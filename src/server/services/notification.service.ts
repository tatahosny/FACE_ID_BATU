import { db } from "@/db";
import {
  notificationOutbox,
  bookings,
  bookingWindows,
  students,
} from "@/db/schema";
import { eq, and, sql, asc } from "drizzle-orm";
import { TelegramService } from "./telegram.service";
import { BOOKING_STATUSES, BOOKING_WINDOW_STATUSES } from "@/lib/constants/statuses";

export class NotificationService {
  /**
   * Evaluate queue positions for active windows and automatically enqueue proximity notifications (10 ahead, 5 ahead)
   */
  static async checkAndQueueProximityNotifications(bookingWindowId?: string) {
    // 1. Fetch all waiting students across all open windows in unified queue order
    const conditions = [
      eq(bookingWindows.status, BOOKING_WINDOW_STATUSES.OPEN),
      eq(bookings.status, BOOKING_STATUSES.WAITING),
    ];
    if (bookingWindowId) {
      conditions.push(eq(bookings.bookingWindowId, bookingWindowId));
    }

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

      // 3. For each waiting student, calculate the exact number of waiting students ahead
      for (let i = 0; i < waitingBookings.length; i++) {
        const item = waitingBookings[i];
        if (!item.telegramUserId) continue; // Not linked

        const studentsAhead = i; // Array is ordered by queueNumber, so index i is exactly count ahead
        const deskName = item.desk || "T";

        if (studentsAhead === 10) {
          const idempotencyKey = `proximity_10_${item.bookingId}`;
          const msg = `<b>جامعة برج العرب التكنولوجية (BATU)</b>
قسم تكنولوجيا المعلومات — نظام بصمة الوجه

<b>تنبيه اقتراب الدور:</b>
عزيزي الطالب <b>${item.fullName}</b>،
<b>باقى على دورك 10 اشخاص يرجى التوجه الان لمكتب البصمة</b>
<b>الشباك المخصص:</b> <code>شباك ${deskName}</code>

<b>المقر:</b> الواحة — مبنى الشؤون (شباك ${deskName})
يرجى الاستعداد والتواجد بالقرب من شباك ${deskName} لتسجيل بصمة الوجه فور النداء.`;

          const inserted = await this.queueOutboxItem({
            eventType: "PROXIMITY_10",
            recipientId: item.studentId,
            telegramChatId: item.telegramUserId,
            payload: {
              studentName: item.fullName,
              remainingAhead: 10,
              desk: deskName,
              message: msg,
            },
            idempotencyKey,
          });

          if (inserted) {
            queuedCount++;
            TelegramService.sendMessage(Number(item.telegramUserId), msg).catch((err) => {
              console.error(`Failed to send direct proximity 10 alert to student ${item.studentId}:`, err.message);
            });
          }
        } else if (studentsAhead === 5) {
          const idempotencyKey = `proximity_5_${item.bookingId}`;
          const msg = `<b>تنبيه عاجل:</b> متبقي 5 أشخاص فقط على دورك (<b>${item.fullName}</b>). الشباك: <b>شباك ${deskName}</b>. يرجى الوقوف أمام شباك ${deskName} بمبنى الشؤون (الواحة) الآن.`;
          const inserted = await this.queueOutboxItem({
            eventType: "PROXIMITY_5",
            recipientId: item.studentId,
            telegramChatId: item.telegramUserId,
            payload: {
              studentName: item.fullName,
              remainingAhead: 5,
              desk: deskName,
              message: msg,
            },
            idempotencyKey,
          });

          if (inserted) {
            queuedCount++;
            TelegramService.sendMessage(Number(item.telegramUserId), msg).catch((err) => {
              console.error(`Failed to send direct proximity 5 alert to student ${item.studentId}:`, err.message);
            });
          }
        }
      }

    return { queuedCount };
  }

  /**
   * Helper to insert into notification_outbox safely ignoring duplicates
   */
  static async queueOutboxItem(data: {
    eventType: string;
    recipientId?: string;
    telegramChatId: number;
    payload: Record<string, unknown>;
    idempotencyKey: string;
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
        })
        .onConflictDoNothing({ target: notificationOutbox.idempotencyKey })
        .returning();

      return !!inserted;
    } catch {
      return false;
    }
  }

  /**
   * Formats the Arabic text message corresponding to the outbox event
   */
  static formatNotificationMessage(eventType: string, payload: any): string {
    switch (eventType) {
      case "PROXIMITY_10":
        return (
          payload.message ||
          `<b>جامعة برج العرب التكنولوجية (BATU)</b>\nقسم تكنولوجيا المعلومات — نظام بصمة الوجه\n\n<b>تنبيه اقتراب الدور:</b>\nعزيزي الطالب <b>${payload.studentName}</b>،\n<b>باقى على دورك 10 اشخاص يرجى التوجه الان لمكتب البصمة</b>\n${payload.desk ? `<b>الشباك المخصص:</b> <code>شباك ${payload.desk}</code>\n` : ""}<b>المقر:</b> الواحة — مبنى الشؤون (شباك بصمة الوجه).`
        );

      case "PROXIMITY_5":
        return `تنبيه عاجل: متبقي 5 أدوار فقط على دورك (<b>${payload.studentName}</b>).${payload.desk ? ` الشباك: <b>شباك ${payload.desk}</b>.` : ""} يرجى التوجه إلى شباك بصمة الوجه بمبنى الشؤون (الواحة) للاستعداد.`;

      case "TURN_CALLED":
        return `<b>جامعة برج العرب التكنولوجية (BATU)</b>\nقسم تكنولوجيا المعلومات — نظام بصمة الوجه\n\n<b>حان دورك الآن!</b>\nعزيزي الطالب <b>${payload.studentName}</b>،\nدورك الحالي في الطابور: <b>${payload.queueNumber}</b>\n${payload.desk ? `<b>الشباك المخصص:</b> <code>شباك ${payload.desk}</code>\n` : ""}<b>المقر:</b> الواحة — مبنى الشؤون (شباك بصمة الوجه)\nيرجى التوجه فوراً إلى شباك ${payload.desk ? `شباك ${payload.desk}` : "بصمة الوجه"} بمبنى الشؤون لتسجيل بصمة الوجه.`;

      case "BOOKING_CONFIRMATION":
        if (payload.message) return payload.message;
        if (payload.isFirstTen) {
          return `<b>جامعة برج العرب التكنولوجية (BATU)</b>\n\n<b>تم تأكيد حجز موعدك بنجاح!</b>\n\n<b>رقم دورك في الطابور:</b> ${payload.queueNumber}\n${payload.desk ? `<b>الشباك المخصص:</b> شباك ${payload.desk}\n` : ""}<b>الطالب:</b> ${payload.studentName}\n<b>الرقم الأكاديمي:</b> ${payload.academicNumber}\n\n<b>تنبيه عاجل:</b>\nأنت من <b>أول 10 طلاب</b> في قائمة الانتظار!\n<b>يرجى التوجه فوراً الآن إلى الواحة — مبنى الشؤون لعمل بصمة الوجه.</b>`;
        }
        return `<b>تأكيد حجز موعد البصمة</b>\n\nعزيزي الطالب <b>${payload.studentName}</b>,\nتم تسجيل حجزك بنجاح.\n\n<b>رقمك في قائمة الانتظار:</b> ${payload.queueNumber}\n${payload.desk ? `<b>الشباك المخصص:</b> شباك ${payload.desk}\n` : ""}<b>الرقم الأكاديمي:</b> ${payload.academicNumber}\n<b>المقر:</b> الواحة — مبنى الشؤون\n\nيرجى متابعة إشعارات البوت عند فتح فترة الحضور واقتراب دورك.`;

      case "ACTIVATION_SUCCESS":
        return `<b>جامعة برج العرب التكنولوجية (BATU)</b>
قسم تكنولوجيا المعلومات — كلية تكنولوجيا الصناعة والطاقة

<b>تم تفعيل بصمة الوجه بنجاح!</b>

عزيزي الطالب: <b>${payload.studentName}</b>
<b>الرقم الأكاديمي:</b> <code>${payload.academicNumber}</code>

نحيطكم علماً بأنه قد تم تسجيل وتوثيق بصمة الوجه الخاصة بك رسمياً بنجاح تام، وتأكيد حضورك لدى شؤون الطلاب.

<b>المسؤول المعتمد:</b> ${payload.staffName}
<b>توقيت الاعتماد:</b> ${payload.activatedAt}
<b>المقر:</b> ${payload.location || "الواحة — مبنى الشؤون (شباك بصمة الوجه)"}

نتمنى لك دوام التوفيق والنجاح!`;

      case "CAMPAIGN_MESSAGE":
        return `<b>إعلان رسمي</b>\n\n${payload.message}`;

      default:
        return payload.message || "إشعار من جامعة برج العرب التكنولوجية";
    }
  }

  /**
   * Process a batch of pending outbox notifications with rate limit resilience and exponential backoff
   */
  static async processOutboxBatch(batchSize = 25) {
    const now = new Date();

    // 1. Fetch pending notifications eligible for delivery
    const pendingItems = await db
      .select()
      .from(notificationOutbox)
      .where(
        and(
          eq(notificationOutbox.status, "PENDING"),
          sql`${notificationOutbox.nextAttemptAt} <= ${now}`
        )
      )
      .limit(batchSize);

    if (pendingItems.length === 0) {
      return { processed: 0, successful: 0, failed: 0 };
    }

    let successful = 0;
    let failed = 0;

    for (const item of pendingItems) {
      // Mark as PROCESSING
      await db
        .update(notificationOutbox)
        .set({ status: "PROCESSING" })
        .where(eq(notificationOutbox.id, item.id));

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

        successful++;
      } catch (err: any) {
        failed++;
        const nextAttempts = item.attempts + 1;
        const isExhausted = nextAttempts >= item.maxAttempts;

        // Exponential backoff with jitter: 2^attempts * 5 seconds
        const backoffSeconds = Math.min(3600, Math.pow(2, nextAttempts) * 5);
        const nextAttemptAt = new Date(Date.now() + backoffSeconds * 1000);

        await db
          .update(notificationOutbox)
          .set({
            status: isExhausted ? "FAILED" : "PENDING",
            attempts: nextAttempts,
            nextAttemptAt,
            lastError: err.message || "Unknown delivery error",
          })
          .where(eq(notificationOutbox.id, item.id));
      }
    }

    return { processed: pendingItems.length, successful, failed };
  }
}
