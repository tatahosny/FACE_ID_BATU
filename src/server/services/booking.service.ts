import { db } from "@/db";
import {
  bookingWindows,
  bookings,
  students,
  sections,
  groups,
  auditLogs,
  notificationOutbox,
  fingerprintActivations,
  users,
} from "@/db/schema";
import { eq, and, sql, ne, desc, or, inArray, lt } from "drizzle-orm";
import { BOOKING_STATUSES, BookingStatus, BOOKING_WINDOW_STATUSES } from "@/lib/constants/statuses";
import { formatQueueNumber } from "@/lib/utils/datetime";
import { TelegramService } from "./telegram.service";
import { SettingsService } from "./settings.service";
import { decryptNationalId } from "@/lib/security/crypto";

/**
 * In-memory concurrency queue lock (FIFO Mutex) to serialize concurrent booking requests
 * and ensure zero collisions under heavy load.
 */
class BookingQueueLock {
  private queue: Promise<void> = Promise.resolve();

  async acquire<T>(fn: () => Promise<T>): Promise<T> {
    let resolveRes!: (val: T) => void;
    let rejectRes!: (err: any) => void;
    const promise = new Promise<T>((resolve, reject) => {
      resolveRes = resolve;
      rejectRes = reject;
    });

    this.queue = this.queue
      .catch(() => {})
      .then(async () => {
        try {
          const result = await fn();
          resolveRes(result);
        } catch (err) {
          rejectRes(err);
        }
      });

    return promise;
  }
}

const bookingQueueLock = new BookingQueueLock();

export class BookingService {
  /**
   * Check whether booking is open for a student's section and return availability.
   */
  static async checkStudentEligibility(studentId: string) {
    const [student] = await db
      .select({
        id: students.id,
        fullName: students.fullName,
        academicNumber: students.academicNumber,
        groupId: students.groupId,
        sectionId: students.sectionId,
        subSection: students.subSection,
        telegramUserId: students.telegramUserId,
      })
      .from(students)
      .where(eq(students.id, studentId));

    if (!student) {
      throw new Error("سجل الطالب غير موجود");
    }

    const now = new Date();

    // Query active booking windows for the student's exact section
    const candidateWindows = await db
      .select()
      .from(bookingWindows)
      .where(
        and(
          eq(bookingWindows.sectionId, student.sectionId),
          eq(bookingWindows.status, BOOKING_WINDOW_STATUSES.OPEN),
          sql`${bookingWindows.startsAt} <= ${now}`,
          sql`${bookingWindows.endsAt} >= ${now}`
        )
      );

    // Match window targeted to ALL or to the student's exact subSection (A or B)
    const activeWindow = candidateWindows.find(
      (w) => w.subSection === "ALL" || w.subSection === (student.subSection || "A")
    );

    if (!activeWindow) {
      return {
        eligible: false,
        student,
        reason:
          "لم يتم تفعيل وقت البصمة للسكشن أو القسم الفرعي بتاعك. يرجى الانتظار، ستصلك رسالة تنبيهية على التيليجرام فور فتح الحجز لسكشنك.",
        window: null,
      };
    }

    // Check if student already has an active booking in this window
    const [existingBooking] = await db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.bookingWindowId, activeWindow.id),
          eq(bookings.studentId, student.id),
          ne(bookings.status, BOOKING_STATUSES.CANCELLED)
        )
      );

    if (existingBooking) {
      return {
        eligible: false,
        student,
        reason: "لديك حجز نشط بالفعل في هذه الفترة الأكاديمية.",
        existingBooking: {
          id: existingBooking.id,
          queueNumber: formatQueueNumber(existingBooking.queueNumber),
          status: existingBooking.status,
          bookedAt: existingBooking.bookedAt,
        },
        window: activeWindow,
      };
    }

    // Open queueing: All registered students in this section can book without a maximum limit cap
    return {
      eligible: true,
      student,
      reason: null,
      window: {
        id: activeWindow.id,
        startsAt: activeWindow.startsAt,
        endsAt: activeWindow.endsAt,
        capacity: activeWindow.capacity,
        currentQueueCount: activeWindow.nextQueueNumber - 1,
      },
    };
  }

  /**
   * Concurrency-safe, transactional booking creation.
   * Acquires row lock on the booking window to prevent race conditions and duplicate queue numbers.
   */
  static async createBooking(studentId: string, bookingWindowId: string, idempotencyKey?: string) {
    let pendingTelegramNotification: { chatId: number; message: string } | null = null;
    const result = await bookingQueueLock.acquire(async () => {
      return await db.transaction(async (tx) => {
        // 1. Fetch student
        const [student] = await tx
          .select()
          .from(students)
          .where(eq(students.id, studentId));

        if (!student) {
          throw new Error("سجل الطالب غير موجود");
        }

        // 2. Lock the booking window row for atomic queue allocation
        const [window] = await tx
          .select()
          .from(bookingWindows)
          .where(eq(bookingWindows.id, bookingWindowId))
          .for("update");

        if (!window) {
          throw new Error("نافذة الحجز غير موجودة");
        }

        // 3. Verify section match
        if (window.sectionId !== student.sectionId) {
          throw new Error(
            "لا يمكن الحجز الآن، لأن الحجز لم يتم فتحه للسكشن الخاص بك. يرجى متابعة الإعلانات الرسمية."
          );
        }

        // 4. Verify window status and time
        const now = new Date();
        if (
          window.status !== BOOKING_WINDOW_STATUSES.OPEN ||
          now < new Date(window.startsAt) ||
          now > new Date(window.endsAt)
        ) {
          throw new Error(
            "لم يتم تفعيل وقت البصمة للسكشن بتاعك. يرجى الانتظار، ستصلك رسالة تنبيهية على التيليجرام فور فتح الحجز لسكشنك."
          );
        }

        // 5. Verify subSection match (A or B)
        let targetWindow = window;
        if (
          window.subSection &&
          window.subSection !== "ALL" &&
          window.subSection !== (student.subSection || "A")
        ) {
          // Check if an alternate window is open for the student's subSection in this section
          const [alternateWindow] = await tx
            .select()
            .from(bookingWindows)
            .where(
              and(
                eq(bookingWindows.sectionId, student.sectionId),
                eq(bookingWindows.status, BOOKING_WINDOW_STATUSES.OPEN),
                or(
                  eq(bookingWindows.subSection, "ALL"),
                  eq(bookingWindows.subSection, student.subSection || "A")
                ),
                sql`${bookingWindows.startsAt} <= ${now}`,
                sql`${bookingWindows.endsAt} >= ${now}`
              )
            )
            .orderBy(desc(bookingWindows.createdAt))
            .limit(1);

          if (alternateWindow) {
            targetWindow = alternateWindow;
          } else {
            throw new Error(
              `فترة الحجز الحالية مخصصة لطلاب (قسم ${window.subSection}) فقط، وأنت مسجل في (قسم ${student.subSection || "A"}). يرجى انتظار موعد فتح الحجز لقسمك.`
            );
          }
        }

        // 6. Check existing active booking for this student in this window (idempotency check)
        const [existingBooking] = await tx
          .select()
          .from(bookings)
          .where(
            and(
              eq(bookings.studentId, student.id),
              sql`${bookings.status} IN ('WAITING', 'CALLED', 'IN_PROGRESS')`
            )
          );

        if (existingBooking) {
          // Also deliver current queue status to student via Telegram
          if (student.telegramUserId) {
            const deskName = existingBooking.desk || "T";
            const [aheadResult] = await tx
              .select({ count: sql<number>`count(*)` })
              .from(bookings)
              .where(
                and(
                  eq(bookings.bookingWindowId, existingBooking.bookingWindowId),
                  sql`${bookings.status} IN ('WAITING', 'CALLED')`,
                  lt(bookings.queueNumber, existingBooking.queueNumber)
                )
              );
            const peopleAhead = Number(aheadResult?.count || 0);
            const currentTurn = peopleAhead + 1;
            const formattedNum = formatQueueNumber(existingBooking.queueNumber);
            const formattedTurn = formatQueueNumber(currentTurn);

            const reminderMsg = `<b>جامعة برج العرب التكنولوجية (BATU)</b>
قسم تكنولوجيا المعلومات — نظام بصمة الوجه

<b>تفاصيل حجز دورك الحالي:</b>

<b>اسم الطالب:</b> ${student.fullName}
<b>الرقم الأكاديمي:</b> <code>${student.academicNumber}</code>
<b>الشباك المخصص:</b> <code>شباك ${deskName}</code>
<b>رقم دورك الحالي في الطابور:</b> <code>#${formattedTurn}</code> (تذكرة حجز رقم: <code>#${formattedNum}</code>)
<b>حالة الطابور:</b> ${peopleAhead === 0 ? "أنت أول شخص في الطابور الآن!" : `باقي أمامك ${peopleAhead} أشخاص فقط في الانتظار`}

<b>المقر:</b> الواحة — مبنى الشؤون (شباك بصمة الوجه)
ستصلك رسالة تنبيهية فور المناداة على دورك.`;

            pendingTelegramNotification = {
              chatId: Number(student.telegramUserId),
              message: reminderMsg,
            };
          }

          return {
            booking: existingBooking,
            formattedQueueNumber: formatQueueNumber(existingBooking.queueNumber),
            desk: existingBooking.desk || "T",
            isExisting: true,
            pendingTelegramNotification,
          };
        }

        // 7. Atomic desk allocation & strictly sequential queue number allocation
        // Determine desk assignment alternating between T and D based on last booking in this window
        const [lastBooking] = await tx
          .select({ desk: bookings.desk })
          .from(bookings)
          .where(eq(bookings.bookingWindowId, targetWindow.id))
          .orderBy(desc(bookings.createdAt))
          .limit(1);

        // Check active desk statuses from settings
        const deskStatuses = await SettingsService.getDeskStatuses();
        let assignedDesk: "T" | "D";

        if (deskStatuses.deskTActive && !deskStatuses.deskDActive) {
          // Window D is closed, Window T is active: all bookings go to T
          assignedDesk = "T";
        } else if (!deskStatuses.deskTActive && deskStatuses.deskDActive) {
          // Window T is closed, Window D is active: all bookings go to D
          assignedDesk = "D";
        } else {
          // Both active: alternate between T and D based on last booking
          assignedDesk = lastBooking?.desk === "T" ? "D" : "T";
        }

        // Strictly append to the very end of the line: always sequential within the window
        const [maxBooking] = await tx
          .select({ maxQueue: sql<number>`COALESCE(MAX(${bookings.queueNumber}), 0)` })
          .from(bookings)
          .where(eq(bookings.bookingWindowId, targetWindow.id));

        const currentMaxQueue = Number(maxBooking?.maxQueue || 0);
        const nextFromWindow = Number(targetWindow.nextQueueNumber || 1);
        const assignedQueueNumber = Math.max(currentMaxQueue + 1, nextFromWindow);

        // Advance nextQueueNumber counter on the window
        await tx
          .update(bookingWindows)
          .set({
            nextQueueNumber: assignedQueueNumber + 1,
            updatedAt: new Date(),
          })
          .where(eq(bookingWindows.id, targetWindow.id));

        // 8. Insert booking record with globally sequential queue number and permanent ticket number
        const [createdBooking] = await tx
          .insert(bookings)
          .values({
            bookingWindowId: targetWindow.id,
            studentId: student.id,
            queueNumber: assignedQueueNumber,
            ticketNumber: assignedQueueNumber,
            desk: assignedDesk,
            status: BOOKING_STATUSES.WAITING,
          })
          .returning();

        // 9. Send Telegram confirmation message immediately & log to outbox
        if (student.telegramUserId) {
          const [aheadResult] = await tx
            .select({ count: sql<number>`count(*)` })
            .from(bookings)
            .where(
              and(
                eq(bookings.bookingWindowId, targetWindow.id),
                sql`${bookings.status} IN ('WAITING', 'CALLED')`,
                lt(bookings.queueNumber, createdBooking.queueNumber)
              )
            );
          const peopleAhead = Number(aheadResult?.count || 0);
          const isFirstTen = peopleAhead < 10;
          const currentTurn = peopleAhead + 1;
          const formattedNum = formatQueueNumber(assignedQueueNumber);
          const formattedTurn = formatQueueNumber(currentTurn);

          const telegramText = isFirstTen
            ? `<b>جامعة برج العرب التكنولوجية (BATU)</b>
قسم تكنولوجيا المعلومات — نظام بصمة الوجه

<b>تم تأكيد حجز دورك بنجاح!</b>

<b>اسم الطالب:</b> ${student.fullName}
<b>الرقم الأكاديمي:</b> <code>${student.academicNumber}</code>
<b>الشباك المخصص:</b> <code>شباك ${assignedDesk}</code>
<b>رقم دورك في طابور شباك ${assignedDesk}:</b> <code>#${formattedTurn}</code> (تذكرة حجز رقم: <code>#${formattedNum}</code>)
<b>حالة الطابور:</b> ${peopleAhead === 0 ? `أنت أول شخص في طابور شباك ${assignedDesk} الآن!` : `باقي أمامك ${peopleAhead} أشخاص في طابور شباك ${assignedDesk}`}

<b>تنبيه عاجل:</b>
أنت من <b>أول 10 طلاب</b> في طابور شباك ${assignedDesk}!
<b>يرجى التوجه فوراً الآن إلى شباك ${assignedDesk} (الواحة — مبنى الشؤون) لعمل بصمة الوجه.</b>`
            : `<b>جامعة برج العرب التكنولوجية (BATU)</b>
قسم تكنولوجيا المعلومات — نظام بصمة الوجه

<b>تم تأكيد حجز دورك بنجاح!</b>

<b>اسم الطالب:</b> ${student.fullName}
<b>الرقم الأكاديمي:</b> <code>${student.academicNumber}</code>
<b>الشباك المخصص:</b> <code>شباك ${assignedDesk}</code>
<b>رقم دورك في طابور شباك ${assignedDesk}:</b> <code>#${formattedTurn}</code> (تذكرة حجز رقم: <code>#${formattedNum}</code>)
<b>فاضلك كام واحد:</b> باقي أمامك <b>${peopleAhead}</b> أشخاص في طابور شباك ${assignedDesk}.

<b>المقر:</b> الواحة — مبنى الشؤون (شباك ${assignedDesk})
<b>ستصلك رسالة تنبيهية فور وصول المتبقي على دورك إلى 10 أشخاص للاستعداد والتوجه إلى شباك ${assignedDesk}.</b>`;

          const outboxKey = `booking_confirm_${createdBooking.id}`;
          await tx.insert(notificationOutbox).values({
            eventType: "BOOKING_CONFIRMATION",
            recipientId: student.id,
            telegramChatId: student.telegramUserId,
            payload: {
              studentName: student.fullName,
              academicNumber: student.academicNumber,
              queueNumber: formattedNum,
              desk: assignedDesk,
              peopleAhead,
              isFirstTen,
              bookingId: createdBooking.id,
              message: telegramText,
            },
            status: "DELIVERED",
            idempotencyKey: outboxKey,
          });

          // Queue telegram message for background dispatch outside transaction
          pendingTelegramNotification = {
            chatId: Number(student.telegramUserId),
            message: telegramText,
          };
        }

        // 10. Audit log
        await tx.insert(auditLogs).values({
          action: "BOOKING_CREATED",
          entityType: "BOOKING",
          entityId: createdBooking.id,
          safeMetadata: {
            studentId: student.id,
            bookingWindowId: window.id,
            queueNumber: assignedQueueNumber,
            desk: assignedDesk,
          },
        });

        return {
          booking: createdBooking,
          formattedQueueNumber: formatQueueNumber(assignedQueueNumber),
          desk: assignedDesk,
          isExisting: false,
          pendingTelegramNotification,
        };
      });
    });

    // Send instant message directly to student via Telegram API outside the database transaction
    if (result.pendingTelegramNotification) {
      TelegramService.sendMessage(
        result.pendingTelegramNotification.chatId,
        result.pendingTelegramNotification.message
      ).catch((err: any) => {
        console.error("[BookingService] Failed to send instant Telegram message:", err?.message || err);
      });
    }

    return {
      booking: result.booking,
      formattedQueueNumber: result.formattedQueueNumber,
      desk: result.desk,
      isExisting: result.isExisting,
    };
  }

  /**
   * Get student's current queue status and count students ahead
   */
  static async getStudentQueueStatus(studentId: string) {
    const [latestBooking] = await db
      .select({
        booking: bookings,
        window: bookingWindows,
        student: students,
        section: sections,
      })
      .from(bookings)
      .innerJoin(bookingWindows, eq(bookings.bookingWindowId, bookingWindows.id))
      .innerJoin(students, eq(bookings.studentId, students.id))
      .innerJoin(sections, eq(students.sectionId, sections.id))
      .where(
        and(
          eq(bookings.studentId, studentId),
          ne(bookings.status, BOOKING_STATUSES.CANCELLED)
        )
      )
      .orderBy(desc(bookings.bookedAt))
      .limit(1);

    if (!latestBooking) {
      return null;
    }

    // Accurately calculate waiting students ahead within the student's assigned desk
    const [{ studentsAhead }] = await db
      .select({ studentsAhead: sql<number>`cast(count(*) as integer)` })
      .from(bookings)
      .where(
        and(
          eq(bookings.desk, latestBooking.booking.desk),
          sql`${bookings.status} IN ('WAITING', 'CALLED', 'IN_PROGRESS')`,
          sql`${bookings.queueNumber} < ${latestBooking.booking.queueNumber}`
        )
      );

    const aheadCount = Number(studentsAhead || 0);
    // Dynamic moving turn: advances forward when earlier students finish (e.g. 12 -> 10 -> 1)
    const currentTurn = aheadCount + 1;
    const formattedCurrentTurn = formatQueueNumber(currentTurn);
    const rawTicket = latestBooking.booking.ticketNumber || latestBooking.booking.queueNumber;
    const formattedTicketNumber = formatQueueNumber(rawTicket);

    return {
      bookingId: latestBooking.booking.id,
      ticketNumber: rawTicket,
      formattedTicketNumber,
      initialQueueNumber: rawTicket,
      currentTurn,
      formattedCurrentTurn,
      // Provide currentTurn as primary queueNumber so all consumers display the dynamic moving position
      queueNumber: currentTurn,
      formattedQueueNumber: formattedCurrentTurn,
      status: latestBooking.booking.status,
      bookedAt: latestBooking.booking.bookedAt,
      calledAt: latestBooking.booking.calledAt,
      startedAt: latestBooking.booking.startedAt,
      completedAt: latestBooking.booking.completedAt,
      studentsAhead: aheadCount,
      desk: latestBooking.booking.desk || "T",
      sectionName: latestBooking.section.name,
      studentName: latestBooking.student.fullName,
      academicNumber: latestBooking.student.academicNumber,
      windowStatus: latestBooking.window.status,
      isTelegramLinked: !!latestBooking.student.telegramUserId,
    };
  }

  /**
   * Update booking status (e.g. CALLED, IN_PROGRESS, COMPLETED, CANCELLED, NO_SHOW)
   */
  static async transitionStatus(
    bookingId: string,
    newStatus: BookingStatus,
    actorId: string,
    notes?: string
  ) {
    const updated = await db.transaction(async (tx) => {
      const [booking] = await tx
        .select()
        .from(bookings)
        .where(eq(bookings.id, bookingId));

      if (!booking) {
        throw new Error("الحجز غير موجود");
      }

      const updateData: Record<string, unknown> = {
        status: newStatus,
        updatedAt: new Date(),
        notes: notes || booking.notes,
      };

      if (newStatus === BOOKING_STATUSES.CALLED) {
        updateData.calledAt = new Date();
      } else if (newStatus === BOOKING_STATUSES.IN_PROGRESS) {
        updateData.startedAt = new Date();
      } else if (newStatus === BOOKING_STATUSES.COMPLETED) {
        updateData.completedAt = new Date();
      }

      const [updated] = await tx
        .update(bookings)
        .set(updateData)
        .where(eq(bookings.id, bookingId))
        .returning();

      // If CALLED, queue TURN_CALLED notification to student
      if (newStatus === BOOKING_STATUSES.CALLED) {
        const [student] = await tx
          .select()
          .from(students)
          .where(eq(students.id, booking.studentId));

        if (student?.telegramUserId) {
          const [aheadCount] = await tx
            .select({ count: sql<number>`count(*)` })
            .from(bookings)
            .where(
              and(
                eq(bookings.desk, booking.desk),
                sql`${bookings.status} IN ('WAITING', 'CALLED', 'IN_PROGRESS')`,
                lt(bookings.queueNumber, booking.queueNumber)
              )
            );
          const currentTurn = Number(aheadCount?.count || 0) + 1;
          const displayQueueNumber = `رقم #${formatQueueNumber(currentTurn)} لشباك ${booking.desk || "T"} (تذكرة حجز رقم ${formatQueueNumber(booking.queueNumber)})`;

          await tx
            .insert(notificationOutbox)
            .values({
              eventType: "TURN_CALLED",
              recipientId: student.id,
              telegramChatId: student.telegramUserId,
              payload: {
                studentName: student.fullName,
                queueNumber: displayQueueNumber,
                desk: booking.desk || "T",
                currentTurn: formatQueueNumber(currentTurn),
                ticketNumber: formatQueueNumber(booking.queueNumber),
              },
              idempotencyKey: `turn_called_${booking.id}`,
            })
            .onConflictDoNothing();
        }
      }

      // Log audit
      await tx.insert(auditLogs).values({
        actorId,
        action: `BOOKING_STATUS_${newStatus}`,
        entityType: "BOOKING",
        entityId: bookingId,
        safeMetadata: {
          previousStatus: booking.status,
          newStatus,
          notes,
        },
      });

      return updated;
    });

    if (
      newStatus === BOOKING_STATUSES.COMPLETED ||
      newStatus === BOOKING_STATUSES.CANCELLED ||
      newStatus === BOOKING_STATUSES.CALLED
    ) {
      BookingService.notifyQueueProgress().catch((err) => {
        console.error("[BookingStatus] Failed to notify queue progress:", err.message);
      });
    }

    return updated;
  }

  /**
   * Send a repeated urgent Telegram alert to the student when their turn is called.
   */
  static async repeatAlert(bookingId: string) {
    const [bookingData] = await db
      .select({
        booking: bookings,
        student: students,
      })
      .from(bookings)
      .innerJoin(students, eq(bookings.studentId, students.id))
      .where(eq(bookings.id, bookingId));

    if (!bookingData) {
      throw new Error("سجل الحجز غير موجود");
    }

    const { booking, student } = bookingData;

    // Calculate dynamic moving turn position in desk queue
    const [aheadCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(bookings)
      .where(
        and(
          eq(bookings.desk, booking.desk),
          sql`${bookings.status} IN ('WAITING', 'CALLED', 'IN_PROGRESS')`,
          lt(bookings.queueNumber, booking.queueNumber)
        )
      );
    const currentTurn = Number(aheadCount?.count || 0) + 1;

    // Update called status and timestamp
    await db
      .update(bookings)
      .set({
        status: "CALLED",
        calledAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, bookingId));

    // Send Telegram alert
    if (student.telegramUserId) {
      const ticketNum = booking.ticketNumber || booking.queueNumber;
      const deskName = booking.desk || "T";
      const alertMsg = `<b>جامعة برج العرب التكنولوجية (BATU)</b>\nقسم تكنولوجيا المعلومات — نظام بصمة الوجه\n\n<b>نداء عاجل ومكرر!</b>\nعزيزي الطالب <b>${student.fullName}</b>،\nحان دورك الآن رسمياً في الطابور برقم: <code>#${formatQueueNumber(currentTurn)}</code> (تذكرة حجز رقم: <code>#${formatQueueNumber(ticketNum)}</code>)\n<b>الشباك المخصص:</b> <code>شباك ${deskName}</code>\n\n<b>يرجى التوجه فوراً إلى الواحة — مبنى الشؤون (شباك ${deskName}) لعمل بصمة الوجه قبل فوات الدور!</b>`;

      try {
        await TelegramService.sendMessage(Number(student.telegramUserId), alertMsg);
      } catch (err: any) {
        console.error("Failed to send repeat alert:", err.message);
      }
    }

    return { success: true, message: "تم إرسال النداء العاجل للطالب بنجاح" };
  }

  /**
   * Push back a student by 10 positions in the queue without changing their permanent ticket number.
   * If there are fewer than 10 students behind them, pushes them to the end of the line.
   */
  static async pushBackTenPositions(bookingId: string) {
    const result = await db.transaction(async (tx) => {
      // 1. Fetch target booking
      const [bookingData] = await tx
        .select({
          booking: bookings,
          window: bookingWindows,
          student: students,
        })
        .from(bookings)
        .innerJoin(bookingWindows, eq(bookings.bookingWindowId, bookingWindows.id))
        .innerJoin(students, eq(bookings.studentId, students.id))
        .where(eq(bookings.id, bookingId))
        .for("update");

      if (!bookingData) {
        throw new Error("سجل الحجز غير موجود");
      }

      const { booking, window, student } = bookingData;
      const originalTicketNumber = booking.ticketNumber || booking.queueNumber;

      // 2. Fetch all currently active bookings in the queue for the SAME DESK ordered by queueNumber
      const activeBookings = await tx
        .select({
          id: bookings.id,
          queueNumber: bookings.queueNumber,
          ticketNumber: bookings.ticketNumber,
          desk: bookings.desk,
          status: bookings.status,
          studentId: bookings.studentId,
        })
        .from(bookings)
        .where(
          and(
            eq(bookings.desk, booking.desk),
            sql`${bookings.status} IN ('WAITING', 'CALLED', 'IN_PROGRESS')`
          )
        )
        .orderBy(bookings.queueNumber)
        .for("update");

      const currentIndex = activeBookings.findIndex((b) => b.id === bookingId);
      if (currentIndex === -1) {
        throw new Error("الحجز غير موجود في الطابور النشط حالياً");
      }

      // Students waiting behind the target student
      const studentsBehind = activeBookings.slice(currentIndex + 1);
      const countToShift = Math.min(10, studentsBehind.length);

      let newTurn: number;
      let newQueueNumber: number = booking.queueNumber;

      if (countToShift === 0) {
        // No students behind him, he is already at the very end of the line
        newTurn = currentIndex + 1;
        await tx
          .update(bookings)
          .set({
            status: "WAITING",
            calledAt: null,
            notes: `تم تأخير الدور لعدم الحضور عند النداء (الطالب بالفعل في نهاية الطابور)`,
            updatedAt: new Date(),
          })
          .where(eq(bookings.id, bookingId));
      } else {
        // Students involved in rotation: target student followed by next countToShift students
        const affected = [activeBookings[currentIndex], ...studentsBehind.slice(0, countToShift)];
        const queueNumbers = affected.map((b) => b.queueNumber);

        // Assign queue numbers:
        // The students behind target student move forward by 1 place:
        // affected[1] gets queueNumbers[0]
        // affected[2] gets queueNumbers[1]
        // ...
        // affected[countToShift] gets queueNumbers[countToShift - 1]
        // target student gets queueNumbers[countToShift]
        newQueueNumber = queueNumbers[countToShift];
        newTurn = currentIndex + countToShift + 1;

        // Perform atomic update using CASE statement to avoid any unique constraint conflicts
        const idCases = affected.map((item, idx) => {
          const assignedQ = idx === 0 ? queueNumbers[countToShift] : queueNumbers[idx - 1];
          return sql`WHEN ${bookings.id} = ${item.id} THEN ${assignedQ}`;
        });

        const targetNotes = `تم تأخير الدور 10 أدوار لعدم الحضور عند النداء (تذكرة #${originalTicketNumber}، أصبح دوره #${formatQueueNumber(newTurn)})`;

        await tx.execute(sql`
          UPDATE bookings
          SET
            queue_number = CASE
              ${sql.join(idCases, sql` `)}
              ELSE queue_number
            END,
            status = CASE
              WHEN id = ${bookingId} THEN 'WAITING'
              ELSE status
            END,
            called_at = CASE
              WHEN id = ${bookingId} THEN NULL
              ELSE called_at
            END,
            notes = CASE
              WHEN id = ${bookingId} THEN ${targetNotes}
              ELSE notes
            END,
            updated_at = NOW()
          WHERE id IN (${sql.join(affected.map((b) => sql`${b.id}`), sql`, `)})
        `);
      }

      // 3. Send Telegram notification with fixed ticket number + new turn in queue + remaining ahead
      let telegramSent = false;
      if (student.telegramUserId) {
        const studentsAhead = newTurn - 1;
        const deskName = booking.desk || "T";
        const delayMsg = `<b>جامعة برج العرب التكنولوجية (BATU)</b>
قسم تكنولوجيا المعلومات — نظام بصمة الوجه

<b>تم تأجيل دورك في الطابور بسبب عدم التواجد عند النداء</b>

عزيزي الطالب: <b>${student.fullName}</b>
<b>رقم التذكرة الثابت:</b> <code>#${formatQueueNumber(originalTicketNumber)}</code>
<b>الشباك المخصص:</b> <code>شباك ${deskName}</code>
<b>دورك الحالي في الطابور الآن:</b> <code>#${formatQueueNumber(newTurn)}</code>
<b>المتبقي قبلك في الانتظار:</b> ${studentsAhead === 0 ? "أنت التالي الآن!" : `${studentsAhead} طلاب`}

${
  countToShift < 10
    ? `⚠️ نظراً لوجود ${studentsBehind.length} طلاب فقط في الطابور خلفك، تم وضع دورك في نهاية الطابور الحالي (رقم #${formatQueueNumber(newTurn)}).`
    : `تم تأخيرك 10 أدوار للخلف، وسيحين دورك بعد مرور 10 طلاب.`
}

<b>المقر:</b> الواحة — مبنى الشؤون (شباك ${deskName})
يرجى التواجد أمام شباك ${deskName} بمبنى الشؤون فور اقتراب رقم دورك.`;

        try {
          await TelegramService.sendMessage(Number(student.telegramUserId), delayMsg);
          telegramSent = true;
        } catch (err: any) {
          console.error("[PushBackTen] Failed to send Telegram delay message:", err?.message || err);
        }
      }

      return {
        success: true,
        bookingWindowId: booking.bookingWindowId,
        ticketNumber: originalTicketNumber,
        formattedTicketNumber: formatQueueNumber(originalTicketNumber),
        newTurn,
        formattedLiveTurn: formatQueueNumber(newTurn),
        previousQueueNumber: booking.queueNumber,
        newQueueNumber,
        formattedQueueNumber: formatQueueNumber(newQueueNumber),
        studentsAhead: newTurn - 1,
        telegramSent,
      };
    });

    BookingService.notifyQueueProgress(result.bookingWindowId).catch((err) => {
      console.error("[PushBackTen] Failed to notify queue progress:", err.message);
    });

    return result;
  }

  /**
   * Super Admin cancels booking completely due to student no-show.
   */
  static async cancelNoShowBooking(bookingId: string, adminUserId?: string) {
    const [bookingData] = await db
      .select({
        booking: bookings,
        student: students,
      })
      .from(bookings)
      .innerJoin(students, eq(bookings.studentId, students.id))
      .where(eq(bookings.id, bookingId));

    if (!bookingData) {
      throw new Error("سجل الحجز غير موجود");
    }

    const { booking, student } = bookingData;

    await db
      .update(bookings)
      .set({
        status: "CANCELLED",
        notes: "تم إلغاء الدور من قبل الإدارة لعدم الحضور نهائياً",
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, bookingId));

    // Audit log
    await db.insert(auditLogs).values({
      actorId: adminUserId || null,
      action: "BOOKING_CANCELLED_NO_SHOW",
      entityType: "BOOKING",
      entityId: bookingId,
      safeMetadata: {
        studentId: student.id,
        queueNumber: booking.queueNumber,
      },
    });

    // Send Telegram cancellation message
    let telegramSent = false;
    if (student.telegramUserId) {
      const cancelMsg = `<b>جامعة برج العرب التكنولوجية (BATU)</b>
قسم تكنولوجيا المعلومات — نظام بصمة الوجه

<b>تم إلغاء دورك بسبب عدم حضورك ومغادرة الطابور</b>

عزيزي الطالب: <b>${student.fullName}</b>
<b>الرقم الأكاديمي:</b> <code>${student.academicNumber}</code>

نحيطكم علماً بأنه قد تم إلغاء حجز دورك رسمياً نظراً لعدم التواجد بعد تكرار النداء.
يمكنك إعادة الحجز من المنصة عند فتح فترة حجز جديدة لسكشنك أو مراجعة إدارة شؤون الطلاب (مبنى الشؤون — الواحة).`;

      try {
        await TelegramService.sendMessage(Number(student.telegramUserId), cancelMsg);
        telegramSent = true;
      } catch (err: any) {
        console.error("[CancelNoShow] Failed to send cancel notification:", err?.message || err);
      }
    }

    BookingService.notifyQueueProgress(booking.bookingWindowId).catch((err) => {
      console.error("[CancelNoShow] Failed to notify queue progress:", err.message);
    });

    return { success: true, message: "تم إلغاء دور الطالب بنجاح", telegramSent };
  }

  /**
   * Get detailed queues list for Admin/Staff with decrypted National ID and fingerprint activation status.
   */
  static async getDetailedQueueList(params: {
    status?: string;
    sectionId?: string;
    desk?: string;
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(200, Math.max(1, params.limit || 50));
    const offset = (page - 1) * limit;

    const conditions = [];
    if (params.status && params.status !== "ALL" && params.status !== "ACTIVE") {
      conditions.push(eq(bookings.status, params.status));
    } else if (params.status === "ACTIVE" || !params.status || params.status === "WAITING") {
      // Active queue roles: only students currently in line (WAITING, CALLED, IN_PROGRESS)
      // Once fingerprint is activated (COMPLETED), they are removed from the active queue!
      conditions.push(sql`${bookings.status} IN ('WAITING', 'CALLED', 'IN_PROGRESS')`);
    }

    if (params.desk && params.desk !== "ALL") {
      conditions.push(eq(bookings.desk, params.desk));
    }

    if (params.sectionId) {
      conditions.push(eq(students.sectionId, params.sectionId));
    }
    if (params.search) {
      const term = `%${params.search.trim()}%`;
      conditions.push(
        or(
          sql`${students.fullName} ILIKE ${term}`,
          sql`${students.academicNumber} ILIKE ${term}`
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const rawBookings = await db
      .select({
        id: bookings.id,
        queueNumber: bookings.queueNumber,
        ticketNumber: bookings.ticketNumber,
        desk: bookings.desk,
        status: bookings.status,
        bookedAt: bookings.bookedAt,
        calledAt: bookings.calledAt,
        notes: bookings.notes,
        bookingWindowId: bookings.bookingWindowId,
        studentId: students.id,
        studentName: students.fullName,
        academicNumber: students.academicNumber,
        nationalIdEncrypted: students.nationalIdEncrypted,
        groupId: students.groupId,
        groupName: groups.name,
        sectionId: students.sectionId,
        sectionName: sections.name,
        telegramUserId: students.telegramUserId,
      })
      .from(bookings)
      .innerJoin(students, eq(bookings.studentId, students.id))
      .innerJoin(sections, eq(students.sectionId, sections.id))
      .innerJoin(groups, eq(students.groupId, groups.id))
      .where(whereClause)
      .orderBy(bookings.queueNumber)
      .limit(limit)
      .offset(offset);

    // Fetch activations for these students
    const studentIds = rawBookings.map((b) => b.studentId);
    const activationsMap = new Map<string, { activatedAt: Date; staffName: string }>();

    if (studentIds.length > 0) {
      const acts = await db
        .select({
          studentId: fingerprintActivations.studentId,
          activatedAt: fingerprintActivations.activatedAt,
          staffName: users.fullName,
        })
        .from(fingerprintActivations)
        .innerJoin(users, eq(fingerprintActivations.activatedBy, users.id))
        .where(
          and(
            inArray(fingerprintActivations.studentId, studentIds),
            eq(fingerprintActivations.status, "ACTIVATED")
          )
        );

      acts.forEach((a) => {
        activationsMap.set(a.studentId, {
          activatedAt: a.activatedAt,
          staffName: a.staffName,
        });
      });
    }

    // Calculate liveTurn per desk and globally across the entire active queue
    const activeWaiting = await db
      .select({
        id: bookings.id,
        desk: bookings.desk,
        queueNumber: bookings.queueNumber,
      })
      .from(bookings)
      .where(sql`${bookings.status} IN ('WAITING', 'CALLED', 'IN_PROGRESS')`)
      .orderBy(bookings.queueNumber);

    const globalTurns = new Map<string, number>();
    const deskTurns = {
      T: new Map<string, number>(),
      D: new Map<string, number>(),
    };
    let countGlobal = 0;
    let countT = 0;
    let countD = 0;
    activeWaiting.forEach((b) => {
      countGlobal++;
      globalTurns.set(b.id, countGlobal);

      const d = (b.desk === "D" ? "D" : "T") as "T" | "D";
      if (d === "T") {
        countT++;
        deskTurns.T.set(b.id, countT);
      } else {
        countD++;
        deskTurns.D.set(b.id, countD);
      }
    });

    const isDeskFiltered = params.desk === "T" || params.desk === "D";

    // Format items with decrypted National ID, activation info, and dynamic live turn
    const items = rawBookings.map((b, index) => {
      let nationalId = "غير متوفر";
      try {
        nationalId = decryptNationalId(b.nationalIdEncrypted);
      } catch {
        nationalId = "خطأ في فك التشفير";
      }

      const activation = activationsMap.get(b.studentId);
      const deskKey = (b.desk === "D" ? "D" : "T") as "T" | "D";
      const liveTurn = isDeskFiltered
        ? (deskTurns[deskKey].get(b.id) || b.queueNumber)
        : (globalTurns.get(b.id) || b.queueNumber);
      const ticketNum = b.ticketNumber || b.queueNumber;

      return {
        id: b.id,
        queueNumber: b.queueNumber,
        formattedQueueNumber: formatQueueNumber(b.queueNumber),
        ticketNumber: ticketNum,
        formattedTicketNumber: formatQueueNumber(ticketNum),
        desk: b.desk || "T",
        liveTurn,
        formattedLiveTurn: formatQueueNumber(liveTurn),
        status: b.status,
        bookedAt: b.bookedAt,
        calledAt: b.calledAt,
        notes: b.notes,
        studentId: b.studentId,
        studentName: b.studentName,
        academicNumber: b.academicNumber,
        nationalId,
        groupId: b.groupId,
        groupName: b.groupName,
        sectionId: b.sectionId,
        sectionName: b.sectionName,
        hasTelegram: !!b.telegramUserId,
        isActivated: !!activation,
        activatedAt: activation ? activation.activatedAt : null,
        activatedByStaffName: activation ? activation.staffName : null,
      };
    });

    const [{ count }] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(bookings)
      .innerJoin(students, eq(bookings.studentId, students.id))
      .where(whereClause);

    return {
      items,
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
    };
  }

  /**
   * Resend booking status to student's linked Telegram
   */
  static async resendBookingTelegram(academicNumber: string) {
    const [student] = await db
      .select()
      .from(students)
      .where(eq(students.academicNumber, academicNumber.trim()));

    if (!student) {
      throw new Error("سجل الطالب غير موجود");
    }

    if (!student.telegramUserId) {
      throw new Error("يرجى ربط حساب التيليجرام أولاً");
    }

    const [activeBooking] = await db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.studentId, student.id),
          sql`${bookings.status} IN ('WAITING', 'CALLED')`
        )
      )
      .orderBy(desc(bookings.bookedAt))
      .limit(1);

    if (!activeBooking) {
      throw new Error("لا يوجد حجز فعال حالياً لهذا الطالب");
    }

    const [aheadResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(bookings)
      .where(
        and(
          eq(bookings.desk, activeBooking.desk),
          sql`${bookings.status} IN ('WAITING', 'CALLED', 'IN_PROGRESS')`,
          lt(bookings.queueNumber, activeBooking.queueNumber)
        )
      );

    const peopleAhead = Number(aheadResult?.count || 0);
    const currentTurn = peopleAhead + 1;
    const rawTicket = activeBooking.ticketNumber || activeBooking.queueNumber;
    const formattedNum = formatQueueNumber(rawTicket);
    const formattedTurn = formatQueueNumber(currentTurn);

    const msg = `<b>جامعة برج العرب التكنولوجية (BATU)</b>
قسم تكنولوجيا المعلومات — نظام بصمة الوجه

<b>تفاصيل حجز دورك المؤكد:</b>

<b>اسم الطالب:</b> ${student.fullName}
<b>الرقم الأكاديمي:</b> <code>${student.academicNumber}</code>
<b>الشباك المخصص:</b> <code>شباك ${activeBooking.desk || "T"}</code>
<b>رقم دورك الحالي في الطابور:</b> <code>#${formattedTurn}</code> (تذكرة حجز رقم: <code>#${formattedNum}</code>)
<b>حالة الطابور:</b> ${peopleAhead === 0 ? "أنت أول شخص في الطابور الآن!" : `باقي أمامك ${peopleAhead} أشخاص فقط في الانتظار`}

<b>المقر:</b> الواحة — مبنى الشؤون (شباك بصمة الوجه)
ستصلك رسالة تنبيهية فور المناداة على دورك.`;

    await TelegramService.sendMessage(Number(student.telegramUserId), msg);
    return { success: true, message: "تم إرسال تفاصيل الدور إلى حسابك على التيليجرام بنجاح" };
  }

  /**
   * Broadcast updated queue position to all remaining waiting students in a booking window
   * when a preceding student is accepted/completed/moved.
   */
  static async notifyQueueProgress(bookingWindowId?: string) {
    try {
      for (const desk of ["T", "D"] as const) {
        const activeBookings = await db
          .select({
            bookingId: bookings.id,
            queueNumber: bookings.queueNumber,
            ticketNumber: bookings.ticketNumber,
            desk: bookings.desk,
            status: bookings.status,
            studentId: students.id,
            fullName: students.fullName,
            telegramUserId: students.telegramUserId,
          })
          .from(bookings)
          .innerJoin(students, eq(bookings.studentId, students.id))
          .where(
            and(
              eq(bookings.desk, desk),
              sql`${bookings.status} IN ('WAITING', 'CALLED', 'IN_PROGRESS')`
            )
          )
          .orderBy(bookings.queueNumber);

        if (!activeBookings.length) continue;

        for (let i = 0; i < activeBookings.length; i++) {
          const item = activeBookings[i];
          if (item.status !== "WAITING" || !item.telegramUserId) continue;

          const aheadCount = i;
          const currentTurn = aheadCount + 1;
          const formattedTurn = formatQueueNumber(currentTurn);
          const ticketNum = item.ticketNumber || item.queueNumber;
          const formattedNum = formatQueueNumber(ticketNum);

          let aheadText = "";
          if (aheadCount === 0) {
            aheadText = `🚀 <b>أنت التالي في طابور شباك ${desk} مباشرة الآن!</b>\nيرجى الوقوف أمام شباك ${desk} بمبنى الشؤون فوراً.`;
          } else if (aheadCount === 1) {
            aheadText = `⏳ <b>لقد أصبح أمامك شخص واحد فقط (1) في طابور شباك ${desk}!</b>\nيرجى التواجد أمام شباك ${desk} والاستعداد.`;
          } else if (aheadCount === 2) {
            aheadText = `⏳ <b>لقد أصبح أمامك شخصان فقط (2) في طابور شباك ${desk}!</b>\nيرجى الاستعداد والاقتراب من شباك ${desk}.`;
          } else {
            aheadText = `⏳ <b>لقد أصبح أمامك ${aheadCount} أشخاص في طابور شباك ${desk}.</b>`;
          }

          const progressMsg = `<b>[جامعة برج العرب التكنولوجية - BATU]</b>
قسم تكنولوجيا المعلومات — نظام بصمة الوجه

📢 <b>تحديث حركة وتقدم طابور شباك ${desk}:</b>
عزيزي الطالب: <b>${item.fullName}</b>
<b>الشباك المخصص:</b> <code>شباك ${desk}</code>
<b>دورك الحالي في طابور شباك ${desk}:</b> <code>#${formattedTurn}</code>
<b>رقم التذكرة الثابت:</b> <code>#${formattedNum}</code>

${aheadText}

📍 <b>المقر:</b> الواحة — مبنى الشؤون (شباك ${desk})`;

          try {
            await TelegramService.sendMessage(Number(item.telegramUserId), progressMsg);
            await new Promise((resolve) => setTimeout(resolve, 80));
          } catch (err: any) {
            console.error(`[QueueProgress] Failed to notify student ${item.studentId}:`, err?.message || err);
          }
        }
      }
    } catch (err: any) {
      console.error("[QueueProgress] Error broadcasting queue progress:", err.message);
    }
  }

  /**
   * Migrate all active bookings (WAITING and CALLED) from one desk to another.
   * Retains the student's ticketNumber and re-sequences queueNumber at destination desk
   * so there are zero conflicts with the unique constraints.
   */
  static async migrateDeskBookings(fromDesk: "T" | "D", toDesk: "T" | "D"): Promise<number> {
    const movedIds = await db.transaction(async (tx) => {
      // 1. Fetch all active bookings in fromDesk ordered by queueNumber
      const activeList = await tx
        .select({
          id: bookings.id,
          queueNumber: bookings.queueNumber,
          ticketNumber: bookings.ticketNumber,
          status: bookings.status,
          notes: bookings.notes,
        })
        .from(bookings)
        .where(
          and(
            eq(bookings.desk, fromDesk),
            sql`${bookings.status} IN ('WAITING', 'CALLED')`
          )
        )
        .orderBy(bookings.queueNumber)
        .for("update");

      if (activeList.length === 0) {
        return [];
      }

      // 2. Query global maximum queue number across all bookings to append safely
      const maxRes = await tx.execute(sql<{ max_q: number }>`
        SELECT COALESCE(MAX(queue_number), 0) AS max_q FROM bookings
      `);
      let currentMax = Number(maxRes.rows?.[0]?.max_q || 0);

      const affectedIds: string[] = [];

      for (const item of activeList) {
        currentMax += 1;
        const newQueueNumber = currentMax;
        const originalTicket = item.ticketNumber || item.queueNumber;

        await tx
          .update(bookings)
          .set({
            desk: toDesk,
            queueNumber: newQueueNumber,
            ticketNumber: originalTicket,
            status: BOOKING_STATUSES.WAITING,
            calledAt: null,
            notes: item.notes
              ? `${item.notes} | تم تحويل الدور تلقائياً لشباك ${toDesk} لإغلاق شباك ${fromDesk}`
              : `تم تحويل الدور تلقائياً لشباك ${toDesk} لإغلاق شباك ${fromDesk}`,
            updatedAt: new Date(),
          })
          .where(eq(bookings.id, item.id));

        affectedIds.push(item.id);
      }

      // Keep booking windows nextQueueNumber synchronized
      await tx
        .update(bookingWindows)
        .set({
          nextQueueNumber: currentMax + 1,
          updatedAt: new Date(),
        });

      return affectedIds;
    });

    if (movedIds.length > 0) {
      this.notifyQueueProgress().catch(console.error);
    }

    return movedIds.length;
  }
}

