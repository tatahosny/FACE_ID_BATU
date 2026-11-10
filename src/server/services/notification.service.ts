import { db } from "@/db";
import {
  notificationOutbox,
  bookings,
  bookingWindows,
  students,
} from "@/db/schema";
import { eq, and, sql, asc, desc, inArray } from "drizzle-orm";
import { TelegramService } from "./telegram.service";
import { BOOKING_STATUSES, BOOKING_WINDOW_STATUSES } from "@/lib/constants/statuses";

export class NotificationService {
  private static isWorkerRunning = false;
  private static hasPendingWork = false;

  /**
   * Fast-path immediate Telegram dispatch:
   * Asynchronously sends the message directly to Telegram without waiting for outbox batch cycle,
   * then updates the outbox item to DELIVERED upon success (<300ms).
   * If Telegram API fails, triggers the autonomous worker as a failover retry.
   */
  static fastDispatchByKey(
    idempotencyKey: string,
    telegramChatId: number | string,
    messageText: string
  ): void {
    if (!telegramChatId || !messageText) return;

    const chatIdNum =
      typeof telegramChatId === "string" ? parseInt(telegramChatId, 10) : telegramChatId;
    if (!chatIdNum || isNaN(chatIdNum)) return;

    setImmediate(async () => {
      try {
        await TelegramService.sendMessage(chatIdNum, messageText);
        await db
          .update(notificationOutbox)
          .set({
            status: "DELIVERED",
            sentAt: new Date(),
            attempts: 1,
            lastError: null,
          })
          .where(eq(notificationOutbox.idempotencyKey, idempotencyKey));
      } catch (err: any) {
        console.warn(
          `[FastDispatch] Direct send failed for key ${idempotencyKey}, worker will retry:`,
          err?.message || err
        );
        this.triggerBackgroundWorker();
      }
    });
  }

  /**
   * Trigger the detached autonomous background worker to process pending notifications
   * smoothly with safe rate-limiting and zero client/API lag.
   */
  static triggerBackgroundWorker(): void {
    if (this.isWorkerRunning) {
      this.hasPendingWork = true;
      return;
    }

    this.isWorkerRunning = true;
    this.hasPendingWork = false;

    // Run in background detached from current call stack / HTTP response
    setImmediate(async () => {
      try {
        await this.runAutonomousWorker();
      } catch (err: any) {
        console.error("[NotificationWorker] Unexpected failure:", err?.message || err);
      } finally {
        this.isWorkerRunning = false;
        // If more work accumulated while processing, trigger another cycle
        if (this.hasPendingWork) {
          this.hasPendingWork = false;
          this.triggerBackgroundWorker();
        }
      }
    });
  }

  /**
   * Helper to resolve the queue priority for any given outbox event type:
   * Priority 1 (Ultra High): نداء، نداء مكرر، إلغاء دور، تأخير 10 أدوار، تفعيل البصمة، تأكيد الحجز، فتح الحجز، أنت التالي
   * Priority 2 (High): تنبيهات اقتراب الدور (أول 5، أول 10، أول 15)، غلق الحجز، إيقاف الحجز
   * Priority 3 (Standard): رسائل البرودكاست المجمعة وباقي الإشعارات
   */
  static getEventPriority(eventType: string): number {
    switch (eventType) {
      case "TURN_CALLED":
      case "REPEAT_ALERT":
      case "BOOKING_CANCELLED":
      case "QUEUE_PUSH_BACK":
      case "ACTIVATION_SUCCESS":
      case "BOOKING_CONFIRMATION":
      case "WINDOW_OPENED":
      case "PROXIMITY_NEXT":
        return 1;
      case "PROXIMITY_5":
      case "PROXIMITY_10":
      case "PROXIMITY_15":
      case "WINDOW_CLOSED":
      case "WINDOW_PAUSED":
        return 2;
      default:
        return 3;
    }
  }

  /**
   * Continuous loop that drains pending outbox notifications in high-speed safe batches
   * using a concurrent worker pool (6 parallel workers) with sliding rate limiting.
   */
  private static async runAutonomousWorker(): Promise<void> {
    const BATCH_SIZE = 40;
    const CONCURRENCY = 6;
    const MIN_INTERVAL_MS = 35; // Safe ~28 msgs/sec globally across different chats

    while (true) {
      const now = new Date();

      // Dynamic SQL Priority Ordering:
      const priorityOrderSql = sql<number>`
        CASE 
          WHEN ${notificationOutbox.eventType} IN (
            'TURN_CALLED', 'REPEAT_ALERT', 'BOOKING_CANCELLED', 'QUEUE_PUSH_BACK', 
            'ACTIVATION_SUCCESS', 'BOOKING_CONFIRMATION', 'WINDOW_OPENED', 'PROXIMITY_NEXT'
          ) THEN 1
          WHEN ${notificationOutbox.eventType} IN (
            'PROXIMITY_5', 'PROXIMITY_10', 'PROXIMITY_15', 'WINDOW_CLOSED', 'WINDOW_PAUSED'
          ) THEN 2
          ELSE 3
        END
      `;

      const pendingItems = await db
        .select()
        .from(notificationOutbox)
        .where(
          and(
            eq(notificationOutbox.status, "PENDING"),
            sql`${notificationOutbox.nextAttemptAt} <= ${now}`
          )
        )
        .orderBy(asc(priorityOrderSql), asc(notificationOutbox.createdAt))
        .limit(BATCH_SIZE);

      if (pendingItems.length === 0) {
        break;
      }

      // 1. Filter out stale items (>2 hours)
      const validItems: typeof pendingItems = [];
      const expiredIds: string[] = [];
      for (const item of pendingItems) {
        const itemAgeMs = now.getTime() - new Date(item.createdAt).getTime();
        const MAX_NOTIFICATION_AGE_MS = 2 * 60 * 60 * 1000;
        if (itemAgeMs > MAX_NOTIFICATION_AGE_MS) {
          expiredIds.push(item.id);
        } else {
          validItems.push(item);
        }
      }

      if (expiredIds.length > 0) {
        await db
          .update(notificationOutbox)
          .set({
            status: "CANCELLED",
            lastError: "تم إلغاء الإشعار لمرور أكثر من ساعتين على موعده الأصلي منعاً لإزعاج الطالب",
          })
          .where(inArray(notificationOutbox.id, expiredIds));
      }

      if (validItems.length === 0) {
        continue;
      }

      // 2. Bulk mark as PROCESSING in 1 single DB query (prevents 30-40 network roundtrips!)
      const validIds = validItems.map((i) => i.id);
      await db
        .update(notificationOutbox)
        .set({ status: "PROCESSING" })
        .where(inArray(notificationOutbox.id, validIds));

      // 3. High-throughput concurrent worker pool
      let lastDispatchTime = 0;
      let itemIndex = 0;

      const workers = Array.from(
        { length: Math.min(CONCURRENCY, validItems.length) },
        async () => {
          while (itemIndex < validItems.length) {
            const item = validItems[itemIndex++];
            if (!item) break;

            // Safe global rate limiter (~28 requests/second)
            const nowMs = Date.now();
            const elapsed = nowMs - lastDispatchTime;
            if (elapsed < MIN_INTERVAL_MS) {
              await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS - elapsed));
            }
            lastDispatchTime = Date.now();

            const messageText = this.formatNotificationMessage(item.eventType, item.payload);

            try {
              await TelegramService.sendMessage(item.telegramChatId, messageText);

              await db
                .update(notificationOutbox)
                .set({
                  status: "DELIVERED",
                  sentAt: new Date(),
                  attempts: item.attempts + 1,
                  lastError: null,
                })
                .where(eq(notificationOutbox.id, item.id));
            } catch (err: any) {
              const errMsg = err?.message || "";
              const isPermanentFailure =
                errMsg.includes("bot was blocked by the user") ||
                errMsg.includes("chat not found") ||
                errMsg.includes("user is deactivated") ||
                errMsg.includes("chat was deleted");

              const nextAttempts = item.attempts + 1;
              const isExhausted = isPermanentFailure || nextAttempts >= item.maxAttempts;

              let backoffSeconds = Math.min(3600, Math.pow(2, nextAttempts) * 5);

              if (err.retryAfter && typeof err.retryAfter === "number") {
                backoffSeconds = err.retryAfter;
                console.warn(
                  `[NotificationWorker] Telegram rate limited. Pausing worker for ${err.retryAfter}s`
                );
                await new Promise((r) => setTimeout(r, err.retryAfter * 1000));
              }

              const nextAttemptAt = new Date(Date.now() + backoffSeconds * 1000);

              await db
                .update(notificationOutbox)
                .set({
                  status: isExhausted ? "FAILED" : "PENDING",
                  attempts: nextAttempts,
                  nextAttemptAt,
                  lastError: isPermanentFailure
                    ? `تعذر التسليم بشكل نهائي: ${errMsg}`
                    : errMsg || "Unknown delivery error",
                })
                .where(eq(notificationOutbox.id, item.id));
            }
          }
        }
      );

      await Promise.all(workers);
    }
  }

  /**
   * Evaluate queue positions for active windows and automatically enqueue proximity notifications
   * (15 ahead, 10 ahead, 5 ahead, next) without flood or race conditions.
   */
  static async checkAndQueueProximityNotifications(_bookingWindowId?: string) {
    // 1. Fetch all waiting students across open windows ordered by queueNumber
    const conditions = [
      eq(bookingWindows.status, BOOKING_WINDOW_STATUSES.OPEN),
      eq(bookings.status, BOOKING_STATUSES.WAITING),
    ];

    const waitingBookings = await db
      .select({
        bookingId: bookings.id,
        queueNumber: bookings.queueNumber,
        desk: bookings.desk,
        studentId: students.id,
        fullName: students.fullName,
        telegramUserId: students.telegramUserId,
      })
      .from(bookings)
      .innerJoin(students, eq(bookings.studentId, students.id))
      .innerJoin(bookingWindows, eq(bookings.bookingWindowId, bookingWindows.id))
      .where(and(...conditions))
      .orderBy(asc(bookings.queueNumber));

    let queuedCount = 0;

    // 2. For each waiting student per desk, calculate the exact count ahead
    const desks = ["T", "D"] as const;
    for (const deskName of desks) {
      const deskWaiting = waitingBookings.filter((b) => (b.desk || "T") === deskName);
      for (let i = 0; i < deskWaiting.length; i++) {
        const item = deskWaiting[i];
        if (!item.telegramUserId) continue; // Not linked

        const studentsAhead = i; // Array is ordered by queueNumber per desk

        // Milestone 1: Next in line (1 or 0 ahead)
        if (studentsAhead <= 1) {
          const idempotencyKey = `proximity_next_${item.bookingId}`;
          const msg = `<b>جامعة برج العرب التكنولوجية (BATU)</b>\nقسم تكنولوجيا المعلومات — نظام بصمة الوجه\n\n<b>تنبيه هام (أنت التالي):</b>\nعزيزي الطالب <b>${item.fullName}</b>،\nأنت التالي مباشرة على <b>شباك ${deskName}</b>!\nيرجى الوقوف فوراً أمام الشباك (مبنى المعامل ب الواحة الدور الاول علوى يمين) للاستعداد لمناداة دورك.`;

          const inserted = await this.queueOutboxItem({
            eventType: "PROXIMITY_NEXT",
            recipientId: item.studentId,
            telegramChatId: item.telegramUserId,
            payload: {
              studentName: item.fullName,
              remainingAhead: studentsAhead,
              desk: deskName,
              message: msg,
            },
            idempotencyKey,
            triggerWorker: false,
          });
          if (inserted) {
            queuedCount++;
            // Instant fast dispatch for "You are next"
            this.fastDispatchByKey(idempotencyKey, item.telegramUserId, msg);
          }
        }
        // Milestone 2: 5 or fewer ahead (2 to 5)
        else if (studentsAhead <= 5) {
          const idempotencyKey = `proximity_5_${item.bookingId}`;
          const msg = `<b>جامعة برج العرب التكنولوجية (BATU)</b>\nقسم تكنولوجيا المعلومات — نظام بصمة الوجه\n\n<b>تنبيه عاجل:</b>\nمتبقي <b>${studentsAhead}</b> أشخاص فقط على دورك (<b>${item.fullName}</b>).\n<b>الشباك:</b> <code>شباك ${deskName}</code>.\nيرجى التواجد أمام شباك ${deskName} بمبنى المعامل ب الواحة الدور الاول علوى يمين الآن.`;

          const inserted = await this.queueOutboxItem({
            eventType: "PROXIMITY_5",
            recipientId: item.studentId,
            telegramChatId: item.telegramUserId,
            payload: {
              studentName: item.fullName,
              remainingAhead: studentsAhead,
              desk: deskName,
              message: msg,
            },
            idempotencyKey,
            triggerWorker: false,
          });
          if (inserted) queuedCount++;
        }
        // Milestone 3: 10 or fewer ahead (6 to 10)
        else if (studentsAhead <= 10) {
          const idempotencyKey = `proximity_10_${item.bookingId}`;
          const msg = `<b>جامعة برج العرب التكنولوجية (BATU)</b>\nقسم تكنولوجيا المعلومات — نظام بصمة الوجه\n\n<b>تنبيه اقتراب الدور:</b>\nعزيزي الطالب <b>${item.fullName}</b>،\n<b>باقى على دورك ${studentsAhead} أشخاص، يرجى التوجه الآن لمكتب البصمة</b>\n<b>الشباك المخصص:</b> <code>شباك ${deskName}</code>\n\n<b>المقر:</b> مبنى المعامل ب الواحة الدور الاول علوى يمين (شباك ${deskName})\nيرجى الاستعداد والتواجد بالقرب من الشباك فور النداء.`;

          const inserted = await this.queueOutboxItem({
            eventType: "PROXIMITY_10",
            recipientId: item.studentId,
            telegramChatId: item.telegramUserId,
            payload: {
              studentName: item.fullName,
              remainingAhead: studentsAhead,
              desk: deskName,
              message: msg,
            },
            idempotencyKey,
            triggerWorker: false,
          });
          if (inserted) queuedCount++;
        }
        // Milestone 4: 15 or fewer ahead (11 to 15)
        else if (studentsAhead <= 15) {
          const idempotencyKey = `proximity_15_${item.bookingId}`;
          const msg = `<b>جامعة برج العرب التكنولوجية (BATU)</b>\nقسم تكنولوجيا المعلومات — نظام بصمة الوجه\n\n<b>تنبيه متابعة الطابور:</b>\nعزيزي الطالب <b>${item.fullName}</b>،\nمتبقي على دورك <b>${studentsAhead}</b> شخصاً في الطابور.\n<b>الشباك المخصص:</b> <code>شباك ${deskName}</code>\n\n<b>المقر:</b> مبنى المعامل ب الواحة الدور الاول علوى يمين\nيرجى متابعة الإشعارات والاقتراب من المقر مع تقدم الطابور.`;

          const inserted = await this.queueOutboxItem({
            eventType: "PROXIMITY_15",
            recipientId: item.studentId,
            telegramChatId: item.telegramUserId,
            payload: {
              studentName: item.fullName,
              remainingAhead: studentsAhead,
              desk: deskName,
              message: msg,
            },
            idempotencyKey,
            triggerWorker: false,
          });
          if (inserted) queuedCount++;
        }
      }
    }

    // Trigger the background worker if any new proximity items were inserted
    if (queuedCount > 0) {
      this.triggerBackgroundWorker();
    }

    return { queuedCount };
  }

  /**
   * Helper to insert into notification_outbox safely ignoring duplicates
   * and optionally triggering the background worker.
   */
  static async queueOutboxItem(data: {
    eventType: string;
    recipientId?: string;
    telegramChatId: number;
    payload: Record<string, unknown>;
    idempotencyKey: string;
    triggerWorker?: boolean;
  }): Promise<boolean> {
    try {
      const [inserted] = await db
        .insert(notificationOutbox)
        .values({
          eventType: data.eventType,
          recipientId: data.recipientId,
          telegramChatId: data.telegramChatId,
          payload: data.payload,
          idempotencyKey: data.idempotencyKey,
          status: "PENDING",
        })
        .onConflictDoNothing({ target: notificationOutbox.idempotencyKey })
        .returning();

      const success = !!inserted;
      if (success && data.triggerWorker !== false) {
        this.triggerBackgroundWorker();
      }

      return success;
    } catch {
      return false;
    }
  }

  /**
   * Formats Arabic text message corresponding to the outbox event
   */
  static formatNotificationMessage(eventType: string, payload: any): string {
    if (payload?.message) {
      return payload.message;
    }

    switch (eventType) {
      case "PROXIMITY_15":
        return `<b>جامعة برج العرب التكنولوجية (BATU)</b>\nقسم تكنولوجيا المعلومات — نظام بصمة الوجه\n\n<b>تنبيه متابعة الطابور:</b>\nعزيزي الطالب <b>${payload.studentName}</b>،\nمتبقي على دورك <b>${payload.remainingAhead || 15}</b> شخصاً في الطابور.\n${payload.desk ? `<b>الشباك المخصص:</b> <code>شباك ${payload.desk}</code>\n` : ""}<b>المقر:</b> مبنى المعامل ب الواحة الدور الاول علوى يمين\nيرجى الاستعداد والاقتراب من المقر مع تقدم الطابور.`;

      case "PROXIMITY_10":
        return `<b>جامعة برج العرب التكنولوجية (BATU)</b>\nقسم تكنولوجيا المعلومات — نظام بصمة الوجه\n\n<b>تنبيه اقتراب الدور:</b>\nعزيزي الطالب <b>${payload.studentName}</b>،\n<b>باقى على دورك ${payload.remainingAhead || 10} اشخاص يرجى التوجه الان لمكتب البصمة</b>\n${payload.desk ? `<b>الشباك المخصص:</b> <code>شباك ${payload.desk}</code>\n` : ""}<b>المقر:</b> مبنى المعامل ب الواحة الدور الاول علوى يمين (شباك بصمة الوجه).`;

      case "PROXIMITY_5":
        return `<b>جامعة برج العرب التكنولوجية (BATU)</b>\nقسم تكنولوجيا المعلومات — نظام بصمة الوجه\n\n<b>تنبيه عاجل:</b>\nمتبقي ${payload.remainingAhead || 5} أدوار فقط على دورك (<b>${payload.studentName}</b>).${payload.desk ? `\n<b>الشباك:</b> <code>شباك ${payload.desk}</code>.` : ""}\nيرجى التواجد أمام شباك ${payload.desk ? `شباك ${payload.desk}` : "بصمة الوجه"} بمبنى المعامل ب الواحة الدور الاول علوى يمين الآن.`;

      case "PROXIMITY_NEXT":
        return `<b>جامعة برج العرب التكنولوجية (BATU)</b>\nقسم تكنولوجيا المعلومات — نظام بصمة الوجه\n\n<b>تنبيه هام (أنت التالي):</b>\nأنت التالي مباشرة على <b>شباك ${payload.desk || "T"}</b>!\nيرجى الوقوف فوراً أمام الشباك بمبنى المعامل ب الواحة الدور الاول علوى يمين للاستعداد.`;

      case "TURN_CALLED":
      case "REPEAT_ALERT":
        return `<b>جامعة برج العرب التكنولوجية (BATU)</b>\nقسم تكنولوجيا المعلومات — نظام بصمة الوجه\n\n<b>حان دورك الآن!</b>\nعزيزي الطالب <b>${payload.studentName}</b>،\n${payload.queueNumber ? `<b>رقمك في الطابور:</b> <code>${payload.queueNumber}</code>\n` : ""}${payload.desk ? `<b>الشباك المخصص:</b> <code>شباك ${payload.desk}</code>\n` : ""}<b>المقر:</b> مبنى المعامل ب الواحة الدور الاول علوى يمين (شباك بصمة الوجه)\n\nيرجى التوجه فوراً إلى <code>شباك ${payload.desk || "T"}</code> لتسجيل بصمة الوجه فوراً.`;

      case "QUEUE_PUSH_BACK":
        return `<b>جامعة برج العرب التكنولوجية (BATU)</b>\nقسم تكنولوجيا المعلومات — نظام بصمة الوجه\n\n<b>تنبيه تأخير الدور:</b>\nعزيزي الطالب: <b>${payload.studentName}</b>\n${payload.ticketNumber ? `<b>رقم التذكرة:</b> <code>#${payload.ticketNumber}</code>\n` : ""}${payload.desk ? `<b>الشباك:</b> <code>شباك ${payload.desk}</code>\n` : ""}${payload.newTurn ? `<b>دورك الجديد في الطابور:</b> <code>#${payload.newTurn}</code>\n` : ""}<b>المتبقي قبلك في الانتظار:</b> ${payload.remainingAhead ?? "عدة أشخاص"}\n\nيرجى التواجد أمام الشباك فور اقتراب رقم دورك الجديد.`;

      case "BOOKING_CONFIRMATION":
        if (payload.isFirstTen) {
          return `<b>جامعة برج العرب التكنولوجية (BATU)</b>\n\n<b>تم تأكيد حجز موعدك بنجاح!</b>\n\n<b>رقم دورك في الطابور:</b> ${payload.queueNumber}\n${payload.desk ? `<b>الشباك المخصص:</b> شباك ${payload.desk}\n` : ""}<b>الطالب:</b> ${payload.studentName}\n<b>الرقم الأكاديمي:</b> ${payload.academicNumber}\n\n<b>تنبيه عاجل:</b>\nأنت من <b>أول 10 طلاب</b> في قائمة الانتظار!\n<b>يرجى التوجه فوراً الآن إلى مبنى المعامل ب الواحة الدور الاول علوى يمين لعمل بصمة الوجه.</b>`;
        }
        return `<b>تأكيد حجز موعد البصمة</b>\n\nعزيزي الطالب <b>${payload.studentName}</b>,\nتم تسجيل حجزك بنجاح.\n\n<b>رقمك في قائمة الانتظار:</b> ${payload.queueNumber}\n${payload.desk ? `<b>الشباك المخصص:</b> شباك ${payload.desk}\n` : ""}<b>الرقم الأكاديمي:</b> ${payload.academicNumber}\n${payload.deskAhead !== undefined ? `<b>المتبقي قبلك:</b> ${payload.deskAhead} أشخاص\n` : ""}<b>المقر:</b> مبنى المعامل ب الواحة الدور الاول علوى يمين\n\nيرجى متابعة إشعارات البوت عند فتح فترة الحضور واقتراب دورك.`;

      case "BOOKING_CANCELLED":
        return `<b>جامعة برج العرب التكنولوجية (BATU)</b>\nقسم تكنولوجيا المعلومات — نظام بصمة الوجه\n\n<b>تم إلغاء حجز دورك في الطابور</b>\n\nعزيزي الطالب: <b>${payload.studentName}</b>\n<b>الرقم الأكاديمي:</b> <code>${payload.academicNumber}</code>\n${payload.notes ? `<b>السبب:</b> ${payload.notes}\n` : ""}نحيطكم علماً بأنه قد تم إلغاء حجز دورك في الطابور.\n${payload.bookingUrl ? `<b>يرجى إعادة الحجز من الرابط:</b>\n<a href="${payload.bookingUrl}">${payload.bookingUrl}</a>` : ""}`;

      case "WINDOW_OPENED":
        return `<b>جامعة برج العرب التكنولوجية (BATU)</b>\nقسم تكنولوجيا المعلومات — نظام بصمة الوجه\n\n<b>تم فتح حجز دور البصمة للسكشن الخاص بكم الآن!</b>\n\n<b>السكشن:</b> ${payload.sectionName || "السكشن الأكاديمي"}\n<b>عزيزي الطالب:</b> ${payload.studentName}\n\n<b>المقر:</b> مبنى المعامل ب الواحة الدور الاول علوى يمين (شباك بصمة الوجه)\n\n<b>يمكنك الآن الدخول إلى المنصة وحجز رقم دورك فوراً:</b>\n<a href="${payload.bookingUrl}">${payload.bookingUrl}</a>`;

      case "WINDOW_PAUSED":
        return `<b>جامعة برج العرب التكنولوجية (BATU)</b>\nقسم تكنولوجيا المعلومات — نظام بصمة الوجه\n\n<b>تنبيه إيقاف حجز دور البصمة:</b>\n\nأعزائنا طلاب <b>${payload.sectionName || "السكشن الأكاديمي"}</b>،\nنحيطكم علماً بأنه قد <b>تم إيقاف حجز دور البصمة لسكشنكم مؤقتاً لحين إشعار آخر بالفتح</b>.\n\nستصلكم رسالة فورية عبر التيليجرام فور استئناف وفتح الحجز لسكشنكم مرة أخرى.`;

      case "WINDOW_CLOSED":
        return `<b>جامعة برج العرب التكنولوجية (BATU)</b>\nقسم تكنولوجيا المعلومات — نظام بصمة الوجه\n\n<b>تنبيه إغلاق باب حجز دور البصمة:</b>\n\nأعزائنا طلاب <b>${payload.sectionName || "السكشن الأكاديمي"}</b>،\nنحيطكم علماً بأنه قد <b>تم إغلاق باب حجز دور البصمة لسكشنكم</b> في الوقت الحالي.\n\nستصلكم رسالة فورية عبر التيليجرام فور إعادة فتح الحجز لسكشنكم مرة أخرى.`;

      case "ACTIVATION_SUCCESS":
        return `<b>جامعة برج العرب التكنولوجية (BATU)</b>\nقسم تكنولوجيا المعلومات — كلية تكنولوجيا الصناعة والطاقة\n\n<b>تم تفعيل بصمة الوجه بنجاح!</b>\n\nعزيزي الطالب: <b>${payload.studentName}</b>\n<b>الرقم الأكاديمي:</b> <code>${payload.academicNumber}</code>\n\nنحيطكم علماً بأنه قد تم تسجيل وتوثيق بصمة الوجه الخاصة بك رسمياً بنجاح تام، لغرض إثبات الحضور والغياب ومراقبة الامتحانات.\n\n<b>المسؤول المعتمد:</b> ${payload.staffName}\n<b>توقيت الاعتماد:</b> ${payload.activatedAt}\n<b>المقر:</b> ${payload.location || "مبنى المعامل ب الواحة الدور الاول علوى يمين (شباك بصمة الوجه)"}\n\nنتمنى لك دوام التوفيق والنجاح!`;

      case "CAMPAIGN_MESSAGE":
        return `<b>إعلان رسمي</b>\n\n${payload.message}`;

      default:
        return payload.message || "إشعار من جامعة برج العرب التكنولوجية";
    }
  }

  /**
   * Returns a real-time summary of the outbox table metrics for dashboards
   */
  static async getOutboxStats() {
    const [counts] = await db
      .select({
        total: sql<number>`cast(count(*) as integer)`,
        delivered: sql<number>`cast(count(case when ${notificationOutbox.status} = 'DELIVERED' then 1 end) as integer)`,
        pending: sql<number>`cast(count(case when ${notificationOutbox.status} = 'PENDING' then 1 end) as integer)`,
        processing: sql<number>`cast(count(case when ${notificationOutbox.status} = 'PROCESSING' then 1 end) as integer)`,
        failed: sql<number>`cast(count(case when ${notificationOutbox.status} = 'FAILED' then 1 end) as integer)`,
      })
      .from(notificationOutbox);

    return {
      total: counts?.total || 0,
      delivered: counts?.delivered || 0,
      pending: counts?.pending || 0,
      processing: counts?.processing || 0,
      failed: counts?.failed || 0,
      isWorkerRunning: this.isWorkerRunning,
    };
  }

  /**
   * Process a batch of pending outbox notifications with rate limit resilience
   */
  static async processOutboxBatch(batchSize = 25) {
    this.triggerBackgroundWorker();
    return { status: "DISPATCHED", message: "تم إطلاق المعالج التلقائي في الخلفية" };
  }
}
