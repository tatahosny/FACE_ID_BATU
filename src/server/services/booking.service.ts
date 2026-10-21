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
import { NotificationService } from "./notification.service";
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
        // 0. Acquire global PostgreSQL advisory transaction lock for booking queue allocation.
        // This guarantees absolute mutual exclusion across ALL distributed serverless instances,
        // containers, and concurrent requests, completely preventing duplicate queue numbers or collisions.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(84729103)`);

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
          const deskName = existingBooking.desk || "T";
          const [aheadDeskResult] = await tx
            .select({ count: sql<number>`count(*)` })
            .from(bookings)
            .innerJoin(bookingWindows, eq(bookings.bookingWindowId, bookingWindows.id))
            .where(
              and(
                eq(bookingWindows.status, BOOKING_WINDOW_STATUSES.OPEN),
                eq(bookings.desk, deskName),
                sql`${bookings.status} IN ('WAITING', 'CALLED', 'IN_PROGRESS')`,
                lt(bookings.queueNumber, existingBooking.queueNumber)
              )
            );
          const deskAhead = Number(aheadDeskResult?.count || 0);
          const deskTurn = deskAhead + 1;

          const [aheadGlobalResult] = await tx
            .select({ count: sql<number>`count(*)` })
            .from(bookings)
            .innerJoin(bookingWindows, eq(bookings.bookingWindowId, bookingWindows.id))
            .where(
              and(
                eq(bookingWindows.status, BOOKING_WINDOW_STATUSES.OPEN),
                sql`${bookings.status} IN ('WAITING', 'CALLED', 'IN_PROGRESS')`,
                lt(bookings.queueNumber, existingBooking.queueNumber)
              )
            );
          const globalAhead = Number(aheadGlobalResult?.count || 0);
          const globalTurn = globalAhead + 1;

          const rawTicket = existingBooking.ticketNumber || existingBooking.queueNumber;
          const formattedTicket = formatQueueNumber(rawTicket);
          const formattedDeskTurn = formatQueueNumber(deskTurn);
          const formattedGlobalTurn = formatQueueNumber(globalTurn);

          if (student.telegramUserId) {
            const reminderMsg = `<b>جامعة برج العرب التكنولوجية (BATU)</b>
قسم تكنولوجيا المعلومات — نظام بصمة الوجه

<b>تفاصيل حجز دورك الحالي:</b>

<b>اسم الطالب:</b> ${student.fullName}
<b>الرقم الأكاديمي:</b> <code>${student.academicNumber}</code>
<b>رقم تذكرة الحجز الثابت:</b> <code>#${formattedTicket}</code>
<b>الشباك المخصص:</b> <code>شباك ${deskName}</code>
<b>ترتيبك في طابور شباك ${deskName}:</b> <code>#${formattedDeskTurn}</code> (${deskAhead === 0 ? "أنت التالي مباشرة على هذا الشباك!" : `باقي قبلك ${deskAhead} طلاب على هذا الشباك`})
<b>ترتيبك العام في انتظار الكلية:</b> <code>#${formattedGlobalTurn}</code>

<b>المقر:</b> الواحة — مبنى الشؤون (شباك بصمة الوجه)
ستصلك رسالة تنبيهية فور المناداة على دورك.`;

            pendingTelegramNotification = {
              chatId: Number(student.telegramUserId),
              message: reminderMsg,
            };
          }

          return {
            booking: existingBooking,
            queueNumber: rawTicket,
            formattedQueueNumber: formattedTicket,
            ticketNumber: rawTicket,
            formattedTicketNumber: formattedTicket,
            desk: deskName,
            deskTurn,
            formattedDeskTurn,
            currentTurn: deskTurn,
            formattedCurrentTurn: formattedDeskTurn,
            globalTurn,
            formattedGlobalTurn,
            deskAhead,
            globalAhead,
            isExisting: true,
            pendingTelegramNotification,
          };
        }

        // 7. Atomic desk allocation & strictly sequential queue number allocation
        // Determine desk assignment alternating between T and D based on last booking globally
        const [lastBooking] = await tx
          .select({ desk: bookings.desk })
          .from(bookings)
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

        // Strictly append to the very end of the line: globally sequential across the entire university
        const [maxBooking] = await tx
          .select({ maxQueue: sql<number>`COALESCE(MAX(${bookings.queueNumber}), 0)` })
          .from(bookings);

        const currentMaxQueue = Number(maxBooking?.maxQueue || 0);
        const nextFromWindow = Number(targetWindow.nextQueueNumber || 1);
        const assignedQueueNumber = Math.max(currentMaxQueue + 1, nextFromWindow);

        // Advance nextQueueNumber counter across all booking windows to keep the entire system in sync
        await tx
          .update(bookingWindows)
          .set({
            nextQueueNumber: assignedQueueNumber + 1,
            updatedAt: new Date(),
          });

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

        // 9. Count students ahead specifically on assigned desk AND globally across college
        const [aheadDeskResult] = await tx
          .select({ count: sql<number>`count(*)` })
          .from(bookings)
          .innerJoin(bookingWindows, eq(bookings.bookingWindowId, bookingWindows.id))
          .where(
            and(
              eq(bookingWindows.status, BOOKING_WINDOW_STATUSES.OPEN),
              eq(bookings.desk, assignedDesk),
              sql`${bookings.status} IN ('WAITING', 'CALLED', 'IN_PROGRESS')`,
              lt(bookings.queueNumber, createdBooking.queueNumber)
            )
          );
        const deskAhead = Number(aheadDeskResult?.count || 0);
        const deskTurn = deskAhead + 1;

        const [aheadGlobalResult] = await tx
          .select({ count: sql<number>`count(*)` })
          .from(bookings)
          .innerJoin(bookingWindows, eq(bookings.bookingWindowId, bookingWindows.id))
          .where(
            and(
              eq(bookingWindows.status, BOOKING_WINDOW_STATUSES.OPEN),
              sql`${bookings.status} IN ('WAITING', 'CALLED', 'IN_PROGRESS')`,
              lt(bookings.queueNumber, createdBooking.queueNumber)
            )
          );
        const globalAhead = Number(aheadGlobalResult?.count || 0);
        const globalTurn = globalAhead + 1;

        const isFirstTen = deskAhead < 10;
        const formattedTicket = formatQueueNumber(assignedQueueNumber);
        const formattedDeskTurn = formatQueueNumber(deskTurn);
        const formattedGlobalTurn = formatQueueNumber(globalTurn);

        // Send Telegram confirmation message immediately & log to outbox
        if (student.telegramUserId) {
          const telegramText = isFirstTen
            ? `<b>جامعة برج العرب التكنولوجية (BATU)</b>
قسم تكنولوجيا المعلومات — نظام بصمة الوجه

<b>تم تأكيد حجز دورك بنجاح!</b>

<b>اسم الطالب:</b> ${student.fullName}
<b>الرقم الأكاديمي:</b> <code>${student.academicNumber}</code>
<b>رقم تذكرة الحجز الثابت:</b> <code>#${formattedTicket}</code>
<b>الشباك المخصص:</b> <code>شباك ${assignedDesk}</code>
<b>ترتيبك في طابور شباك ${assignedDesk}:</b> <code>#${formattedDeskTurn}</code> (باقي قبلك ${deskAhead} طلاب على هذا الشباك)
<b>ترتيبك العام في انتظار الكلية:</b> <code>#${formattedGlobalTurn}</code>

<b>تنبيه عاجل:</b>
أنت من <b>أول 10 طلاب</b> في طابور شباك ${assignedDesk}!
<b>يرجى التوجه فوراً الآن إلى شباك ${assignedDesk} (الواحة — مبنى الشؤون) لعمل بصمة الوجه.</b>`
            : `<b>جامعة برج العرب التكنولوجية (BATU)</b>
قسم تكنولوجيا المعلومات — نظام بصمة الوجه

<b>تم تأكيد حجز دورك بنجاح!</b>

<b>اسم الطالب:</b> ${student.fullName}
<b>الرقم الأكاديمي:</b> <code>${student.academicNumber}</code>
<b>رقم تذكرة الحجز الثابت:</b> <code>#${formattedTicket}</code>
<b>الشباك المخصص:</b> <code>شباك ${assignedDesk}</code>
<b>ترتيبك في طابور شباك ${assignedDesk}:</b> <code>#${formattedDeskTurn}</code> (باقي أمامك <b>${deskAhead}</b> طلاب على هذا الشباك)
<b>ترتيبك العام في انتظار الكلية:</b> <code>#${formattedGlobalTurn}</code>

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
              queueNumber: formattedTicket,
              ticketNumber: formattedTicket,
              desk: assignedDesk,
              deskTurn,
              globalTurn,
              peopleAhead: deskAhead,
              deskAhead,
              globalAhead,
              isFirstTen,
              bookingId: createdBooking.id,
              message: telegramText,
            },
            status: "PENDING",
            idempotencyKey: outboxKey,
          });

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
            ticketNumber: assignedQueueNumber,
            desk: assignedDesk,
          },
        });

        return {
          booking: createdBooking,
          queueNumber: assignedQueueNumber,
          formattedQueueNumber: formattedTicket,
          ticketNumber: assignedQueueNumber,
          formattedTicketNumber: formattedTicket,
          desk: assignedDesk,
          deskTurn,
          formattedDeskTurn,
          currentTurn: deskTurn,
          formattedCurrentTurn: formattedDeskTurn,
          globalTurn,
          formattedGlobalTurn,
          deskAhead,
          globalAhead,
          isExisting: false,
          pendingTelegramNotification,
        };
      });
    });

    // Trigger autonomous throttled background worker to dispatch the booking notification safely
    if (result.pendingTelegramNotification) {
      NotificationService.triggerBackgroundWorker();
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

    const rawTicket = latestBooking.booking.ticketNumber || latestBooking.booking.queueNumber;
    const formattedTicketNumber = formatQueueNumber(rawTicket);
    const desk = latestBooking.booking.desk || "T";

    // 1. Accurately calculate waiting students ahead within the student's assigned desk
    const [{ studentsAhead }] = await db
      .select({ studentsAhead: sql<number>`cast(count(*) as integer)` })
      .from(bookings)
      .innerJoin(bookingWindows, eq(bookings.bookingWindowId, bookingWindows.id))
      .where(
        and(
          eq(bookingWindows.status, BOOKING_WINDOW_STATUSES.OPEN),
          eq(bookings.desk, desk),
          sql`${bookings.status} IN ('WAITING', 'CALLED', 'IN_PROGRESS')`,
          sql`${bookings.queueNumber} < ${latestBooking.booking.queueNumber}`
        )
      );

    const deskAhead = Number(studentsAhead || 0);
    const deskTurn = deskAhead + 1;
    const formattedDeskTurn = formatQueueNumber(deskTurn);

    // 2. Accurately calculate waiting students ahead across all desks globally in college
    const [{ globalAheadCount }] = await db
      .select({ globalAheadCount: sql<number>`cast(count(*) as integer)` })
      .from(bookings)
      .innerJoin(bookingWindows, eq(bookings.bookingWindowId, bookingWindows.id))
      .where(
        and(
          eq(bookingWindows.status, BOOKING_WINDOW_STATUSES.OPEN),
          sql`${bookings.status} IN ('WAITING', 'CALLED', 'IN_PROGRESS')`,
          sql`${bookings.queueNumber} < ${latestBooking.booking.queueNumber}`
        )
      );

    const globalAhead = Number(globalAheadCount || 0);
    const globalTurn = globalAhead + 1;
    const formattedGlobalTurn = formatQueueNumber(globalTurn);

    return {
      bookingId: latestBooking.booking.id,
      ticketNumber: rawTicket,
      formattedTicketNumber,
      initialQueueNumber: rawTicket,
      // Provide unique ticket number as primary queueNumber so each student has a distinct number
      queueNumber: rawTicket,
      formattedQueueNumber: formattedTicketNumber,
      deskTurn,
      formattedDeskTurn,
      currentTurn: deskTurn,
      formattedCurrentTurn: formattedDeskTurn,
      globalTurn,
      formattedGlobalTurn,
      status: latestBooking.booking.status,
      bookedAt: latestBooking.booking.bookedAt,
      calledAt: latestBooking.booking.calledAt,
      startedAt: latestBooking.booking.startedAt,
      completedAt: latestBooking.booking.completedAt,
      studentsAhead: deskAhead,
      deskAhead,
      globalAhead,
      desk,
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

      // If CANCELLED, send cancellation notification with booking link to student
      if (newStatus === BOOKING_STATUSES.CANCELLED) {
        const [student] = await tx
          .select()
          .from(students)
          .where(eq(students.id, booking.studentId));

        if (student?.telegramUserId) {
          const appUrl =
            process.env.NEXT_PUBLIC_APP_URL ||
            process.env.APP_URL ||
            "https://face-id-batu-hvk9.vercel.app";
          const cancelMsg = `<b>جامعة برج العرب التكنولوجية (BATU)</b>
قسم تكنولوجيا المعلومات — نظام بصمة الوجه

<b>تم إلغاء دورك في طابور بصمة الوجه</b>

عزيزي الطالب: <b>${student.fullName}</b>
<b>الرقم الأكاديمي:</b> <code>${student.academicNumber}</code>
${notes ? `<b>السبب:</b> ${notes}\n` : ""}
نحيطكم علماً بأنه قد تم إلغاء حجز دورك في الطابور.
<b>يرجى إعادة الحجز من الرابط التالي:</b>
<a href="${appUrl}/booking">${appUrl}/booking</a>`;

          const cancelKey = `cancel_${booking.id}_${Date.now()}`;
          await tx
            .insert(notificationOutbox)
            .values({
              eventType: "BOOKING_CANCELLED",
              recipientId: student.id,
              telegramChatId: student.telegramUserId,
              payload: {
                studentName: student.fullName,
                academicNumber: student.academicNumber,
                notes,
                bookingUrl: `${appUrl}/booking`,
                message: cancelMsg,
              },
              idempotencyKey: cancelKey,
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
      NotificationService.triggerBackgroundWorker();
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

    // Queue Telegram alert into Outbox
    if (student.telegramUserId) {
      const ticketNum = booking.ticketNumber || booking.queueNumber;
      const deskName = booking.desk || "T";
      const alertMsg = `<b>جامعة برج العرب التكنولوجية (BATU)</b>\nقسم تكنولوجيا المعلومات — نظام بصمة الوجه\n\n<b>نداء عاجل ومكرر!</b>\nعزيزي الطالب <b>${student.fullName}</b>،\nحان دورك الآن رسمياً في الطابور برقم: <code>#${formatQueueNumber(currentTurn)}</code> (تذكرة حجز رقم: <code>#${formatQueueNumber(ticketNum)}</code>)\n<b>الشباك المخصص:</b> <code>شباك ${deskName}</code>\n\n<b>يرجى التوجه فوراً إلى الواحة — مبنى الشؤون (شباك ${deskName}) لعمل بصمة الوجه قبل فوات الدور!</b>`;

      const repeatKey = `repeat_alert_${booking.id}_${Date.now()}`;
      await db
        .insert(notificationOutbox)
        .values({
          eventType: "REPEAT_ALERT",
          recipientId: student.id,
          telegramChatId: student.telegramUserId,
          payload: {
            studentName: student.fullName,
            queueNumber: `رقم #${formatQueueNumber(currentTurn)} لشباك ${deskName}`,
            ticketNumber: formatQueueNumber(ticketNum),
            desk: deskName,
            message: alertMsg,
          },
          idempotencyKey: repeatKey,
        })
        .onConflictDoNothing();

      NotificationService.triggerBackgroundWorker();
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

        // Perform atomic update using CASE statement with explicit UUID casting
        const idCases = affected.map((item, idx) => {
          const assignedQ = idx === 0 ? queueNumbers[countToShift] : queueNumbers[idx - 1];
          return sql`WHEN id = ${item.id}::uuid THEN ${assignedQ}`;
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
              WHEN id = ${bookingId}::uuid THEN 'WAITING'
              ELSE status
            END,
            called_at = CASE
              WHEN id = ${bookingId}::uuid THEN NULL
              ELSE called_at
            END,
            notes = CASE
              WHEN id = ${bookingId}::uuid THEN ${targetNotes}
              ELSE notes
            END,
            updated_at = NOW()
          WHERE id IN (${sql.join(affected.map((b) => sql`${b.id}::uuid`), sql`, `)})
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

        const pushBackKey = `pushback_${booking.id}_${Date.now()}`;
        await tx
          .insert(notificationOutbox)
          .values({
            eventType: "QUEUE_PUSH_BACK",
            recipientId: student.id,
            telegramChatId: student.telegramUserId,
            payload: {
              studentName: student.fullName,
              ticketNumber: formatQueueNumber(originalTicketNumber),
              desk: deskName,
              newTurn: formatQueueNumber(newTurn),
              remainingAhead: studentsAhead === 0 ? "أنت التالي الآن!" : `${studentsAhead} طلاب`,
              message: delayMsg,
            },
            idempotencyKey: pushBackKey,
          })
          .onConflictDoNothing();

        telegramSent = true;
      }

      NotificationService.triggerBackgroundWorker();

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
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.APP_URL ||
        "https://face-id-batu-hvk9.vercel.app";
      const cancelMsg = `<b>جامعة برج العرب التكنولوجية (BATU)</b>
قسم تكنولوجيا المعلومات — نظام بصمة الوجه

<b>تم إلغاء دورك بسبب عدم حضورك ومغادرة الطابور</b>

عزيزي الطالب: <b>${student.fullName}</b>
<b>الرقم الأكاديمي:</b> <code>${student.academicNumber}</code>

نحيطكم علماً بأنه قد تم إلغاء حجز دورك رسمياً نظراً لعدم التواجد بعد تكرار النداء.
<b>يرجى إعادة الحجز من الرابط التالي:</b>
<a href="${appUrl}/booking">${appUrl}/booking</a>`;

      const cancelKey = `cancel_noshow_${booking.id}_${Date.now()}`;
      await db
        .insert(notificationOutbox)
        .values({
          eventType: "BOOKING_CANCELLED",
          recipientId: student.id,
          telegramChatId: student.telegramUserId,
          payload: {
            studentName: student.fullName,
            academicNumber: student.academicNumber,
            notes: "عدم التواجد بعد تكرار النداء",
            bookingUrl: `${appUrl}/booking`,
            message: cancelMsg,
          },
          idempotencyKey: cancelKey,
        })
        .onConflictDoNothing();

      telegramSent = true;
      NotificationService.triggerBackgroundWorker();
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
   * Evaluate and dispatch queue movement and proximity milestone alerts (10, 5, next)
   * cleanly without flooding or spamming all students on every turn.
   */
  static async notifyQueueProgress(_bookingWindowId?: string) {
    try {
      await NotificationService.checkAndQueueProximityNotifications();
    } catch (err: any) {
      console.error("[QueueProgress] Error evaluating proximity notifications:", err?.message || err);
    }
  }

  /**
   * Reset day queues / tickets counter and send intelligent notifications to all students still in the queue:
   * - If student's section has an active open booking window:
   *   "تم تصفير الأدوار، يرجى الحجز من جديد" + booking link.
   * - If student's section is closed / finished for the day:
   *   "تم قفل البصمة اليوم وتصفير الحجوزات، توجه فى وقت لاحق".
   */
  static async resetDayQueuesAndNotify(params?: {
    windowIds?: string[];
    adminUserId?: string;
  }): Promise<{ resetBookingsCount: number; notifiedCount: number }> {
    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ||
      process.env.APP_URL ||
      "https://face-id-batu-hvk9.vercel.app";

    // 1. Fetch all active waiting/called/in_progress bookings to notify students still in line
    const conditions = [
      sql`${bookings.status} IN ('WAITING', 'CALLED', 'IN_PROGRESS')`,
    ];
    if (params?.windowIds && params.windowIds.length > 0) {
      conditions.push(inArray(bookings.bookingWindowId, params.windowIds));
    }

    const activeList = await db
      .select({
        bookingId: bookings.id,
        bookingWindowId: bookings.bookingWindowId,
        studentId: students.id,
        fullName: students.fullName,
        academicNumber: students.academicNumber,
        sectionId: students.sectionId,
        subSection: students.subSection,
        telegramUserId: students.telegramUserId,
        sectionName: sections.name,
        groupName: groups.name,
      })
      .from(bookings)
      .innerJoin(students, eq(bookings.studentId, students.id))
      .innerJoin(sections, eq(students.sectionId, sections.id))
      .innerJoin(groups, eq(students.groupId, groups.id))
      .where(and(...conditions));

    // 2. Fetch all currently open booking windows to determine per-student section availability
    const now = new Date();
    const openWindows = await db
      .select({
        id: bookingWindows.id,
        sectionId: bookingWindows.sectionId,
        subSection: bookingWindows.subSection,
        status: bookingWindows.status,
      })
      .from(bookingWindows)
      .where(
        and(
          eq(bookingWindows.status, BOOKING_WINDOW_STATUSES.OPEN),
          sql`${bookingWindows.startsAt} <= ${now}`,
          sql`${bookingWindows.endsAt} >= ${now}`
        )
      );

    // 3. Prepare messages per unique student
    const pendingNotifications: { chatId: number; message: string }[] = [];
    const notifiedUserIds = new Set<string>();

    for (const item of activeList) {
      if (!item.telegramUserId) continue;
      const key = String(item.telegramUserId);
      if (notifiedUserIds.has(key)) continue;
      notifiedUserIds.add(key);

      const isOpenForStudent = openWindows.some(
        (w) =>
          w.sectionId === item.sectionId &&
          (w.subSection === "ALL" || w.subSection === (item.subSection || "A"))
      );

      const message = isOpenForStudent
        ? `<b>جامعة برج العرب التكنولوجية (BATU)</b>
قسم تكنولوجيا المعلومات — نظام بصمة الوجه

⚠️ <b>إشعار هام: تم تصفير أدوار الانتظار</b>

عزيزي الطالب: <b>${item.fullName}</b>
<b>الرقم الأكاديمي:</b> <code>${item.academicNumber}</code>
<b>السكشن:</b> ${item.sectionName} (${item.groupName})

نحيطكم علماً بأنه قد تم تصفير الأدوار، والحجز لا يزال متاحاً ومفتوحاً لسكشنك الآن.
<b>يرجى إعادة الحجز من جديد عبر الرابط التالي:</b>
<a href="${appUrl}/booking">${appUrl}/booking</a>`
        : `<b>جامعة برج العرب التكنولوجية (BATU)</b>
قسم تكنولوجيا المعلومات — نظام بصمة الوجه

🛑 <b>إشعار رسمي: انتهاء فترة البصمة لليوم</b>

عزيزي الطالب: <b>${item.fullName}</b>
<b>الرقم الأكاديمي:</b> <code>${item.academicNumber}</code>
<b>السكشن:</b> ${item.sectionName} (${item.groupName})

<b>تم قفل البصمة اليوم وتصفير الحجوزات، يرجى التوجه في وقت لاحق.</b>
يرجى متابعة إعلانات البوت والمنصة لمعرفة مواعيد فتح فترات البصمة القادمة لسكشنك.`;

      pendingNotifications.push({
        chatId: Number(item.telegramUserId),
        message,
      });
    }

    // 4. Atomically delete bookings and reset nextQueueNumber counter to 1 in transaction
    await db.transaction(async (tx) => {
      if (params?.windowIds && params.windowIds.length > 0) {
        await tx
          .delete(bookings)
          .where(inArray(bookings.bookingWindowId, params.windowIds));

        await tx
          .update(bookingWindows)
          .set({
            nextQueueNumber: 1,
            updatedAt: new Date(),
          })
          .where(inArray(bookingWindows.id, params.windowIds));
      } else {
        await tx.delete(bookings);

        await tx.update(bookingWindows).set({
          nextQueueNumber: 1,
          updatedAt: new Date(),
        });
      }

      await tx.insert(auditLogs).values({
        actorId: params?.adminUserId || null,
        action: "RESET_TICKETS_DAY",
        entityType: "BOOKING_QUEUE",
        safeMetadata: {
          resetBookingsCount: activeList.length,
          notifiedStudentsCount: pendingNotifications.length,
          windowIds: params?.windowIds || "ALL",
        },
      });
    });

    // 5. Send Telegram notifications asynchronously in background with polite rate-limiting
    (async () => {
      for (const notif of pendingNotifications) {
        try {
          await TelegramService.sendMessage(notif.chatId, notif.message);
          await new Promise((resolve) => setTimeout(resolve, 60));
        } catch (err: any) {
          console.error(
            `[ResetDayQueues] Failed to send Telegram message to ${notif.chatId}:`,
            err?.message || err
          );
        }
      }
    })().catch((err) => {
      console.error("[ResetDayQueues] Error during async notification dispatch:", err);
    });

    return {
      resetBookingsCount: activeList.length,
      notifiedCount: pendingNotifications.length,
    };
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

