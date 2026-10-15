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
import { decryptNationalId } from "@/lib/security/crypto";

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

      // Verify subSection match (A or B)
      if (
        window.subSection &&
        window.subSection !== "ALL" &&
        window.subSection !== (student.subSection || "A")
      ) {
        throw new Error(
          `فترة الحجز الحالية مخصصة لطلاب (قسم ${window.subSection}) فقط، وأنت مسجل في (قسم ${student.subSection || "A"}). يرجى انتظار موعد فتح الحجز لقسمك.`
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

      // 5. Check existing active booking for this student in this window (idempotency check)
      const [existingBooking] = await tx
        .select()
        .from(bookings)
        .where(
          and(
            eq(bookings.bookingWindowId, window.id),
            eq(bookings.studentId, student.id),
            ne(bookings.status, BOOKING_STATUSES.CANCELLED)
          )
        );

      if (existingBooking) {
        // Also deliver current queue status to student via Telegram
        if (student.telegramUserId) {
          const [aheadResult] = await tx
            .select({ count: sql<number>`count(*)` })
            .from(bookings)
            .where(
              and(
                eq(bookings.bookingWindowId, window.id),
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
<b>رقم دورك الحالي في الطابور:</b> <code>#${formattedTurn}</code> (تذكرة حجز رقم: <code>#${formattedNum}</code>)
<b>حالة الطابور:</b> ${peopleAhead === 0 ? "أنت أول شخص في الطابور الآن!" : `باقي أمامك ${peopleAhead} أشخاص فقط في الانتظار`}

<b>المقر:</b> مبنى كلية تكنولوجيا الصناعة والطاقة — معمل الحاسب الآلي (شباك بصمة الوجه)
ستصلك رسالة تنبيهية فور المناداة على دورك.`;

          try {
            await TelegramService.sendMessage(Number(student.telegramUserId), reminderMsg);
          } catch (err: any) {
            console.error("[BookingService] Failed to send existing booking reminder:", err.message);
          }
        }

        return {
          booking: existingBooking,
          formattedQueueNumber: formatQueueNumber(existingBooking.queueNumber),
          isExisting: true,
        };
      }

      // 6. Queue capacity: Open queueing - every student receives a unique sequential queue number

      // 7. Allocate queue number atomically
      const assignedQueueNumber = window.nextQueueNumber;

      await tx
        .update(bookingWindows)
        .set({
          nextQueueNumber: assignedQueueNumber + 1,
          updatedAt: new Date(),
        })
        .where(eq(bookingWindows.id, window.id));

      // 8. Insert booking record
      const [createdBooking] = await tx
        .insert(bookings)
        .values({
          bookingWindowId: window.id,
          studentId: student.id,
          queueNumber: assignedQueueNumber,
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
              eq(bookings.bookingWindowId, window.id),
              sql`${bookings.status} IN ('WAITING', 'CALLED')`,
              ne(bookings.id, createdBooking.id)
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
<b>رقم دورك الحالي في الطابور:</b> <code>#${formattedTurn}</code> (تذكرة حجز رقم: <code>#${formattedNum}</code>)
<b>حالة الطابور:</b> ${peopleAhead === 0 ? "أنت أول شخص في الطابور الآن!" : `باقي أمامك ${peopleAhead} أشخاص فقط في الانتظار`}

<b>تنبيه عاجل:</b>
أنت من <b>أول 10 طلاب</b> في الطابور!
<b>يرجى التوجه فوراً الآن إلى شباك بصمة الوجه (معمل الحاسب الآلي — الطابق الأرضي).</b>`
          : `<b>جامعة برج العرب التكنولوجية (BATU)</b>
قسم تكنولوجيا المعلومات — نظام بصمة الوجه

<b>تم تأكيد حجز دورك بنجاح!</b>

<b>اسم الطالب:</b> ${student.fullName}
<b>الرقم الأكاديمي:</b> <code>${student.academicNumber}</code>
<b>رقم دورك الحالي في الطابور:</b> <code>#${formattedTurn}</code> (تذكرة حجز رقم: <code>#${formattedNum}</code>)
<b>فاضلك كام واحد:</b> باقي أمامك <b>${peopleAhead}</b> أشخاص في الانتظار.

<b>المقر:</b> مبنى كلية تكنولوجيا الصناعة والطاقة — معمل الحاسب الآلي
<b>ستصلك رسالة تنبيهية فور وصول المتبقي على دورك إلى 10 أشخاص للاستعداد والحضور.</b>`;

        const outboxKey = `booking_confirm_${createdBooking.id}`;
        await tx.insert(notificationOutbox).values({
          eventType: "BOOKING_CONFIRMATION",
          recipientId: student.id,
          telegramChatId: student.telegramUserId,
          payload: {
            studentName: student.fullName,
            academicNumber: student.academicNumber,
            queueNumber: formattedNum,
            peopleAhead,
            isFirstTen,
            bookingId: createdBooking.id,
            message: telegramText,
          },
          status: "DELIVERED",
          idempotencyKey: outboxKey,
        });

        // Send instant message directly to student via Telegram API (awaited)
        try {
          await TelegramService.sendMessage(Number(student.telegramUserId), telegramText);
        } catch (err: any) {
          console.error("[BookingService] Failed to send instant Telegram message:", err.message);
        }
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
        },
      });

      return {
        booking: createdBooking,
        formattedQueueNumber: formatQueueNumber(assignedQueueNumber),
        isExisting: false,
      };
    });
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

    // Accurately calculate waiting students ahead (WAITING, CALLED, IN_PROGRESS with smaller queue number)
    const [{ studentsAhead }] = await db
      .select({ studentsAhead: sql<number>`cast(count(*) as integer)` })
      .from(bookings)
      .where(
        and(
          eq(bookings.bookingWindowId, latestBooking.booking.bookingWindowId),
          sql`${bookings.status} IN ('WAITING', 'CALLED', 'IN_PROGRESS')`,
          sql`${bookings.queueNumber} < ${latestBooking.booking.queueNumber}`
        )
      );

    const aheadCount = Number(studentsAhead || 0);
    // Dynamic moving turn: advances forward when earlier students finish (e.g. 12 -> 10 -> 1)
    const currentTurn = aheadCount + 1;
    const formattedCurrentTurn = formatQueueNumber(currentTurn);
    const formattedTicketNumber = formatQueueNumber(latestBooking.booking.queueNumber);

    return {
      bookingId: latestBooking.booking.id,
      ticketNumber: latestBooking.booking.queueNumber,
      formattedTicketNumber,
      initialQueueNumber: latestBooking.booking.queueNumber,
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
                eq(bookings.bookingWindowId, booking.bookingWindowId),
                sql`${bookings.status} IN ('WAITING', 'CALLED', 'IN_PROGRESS')`,
                lt(bookings.queueNumber, booking.queueNumber)
              )
            );
          const currentTurn = Number(aheadCount?.count || 0) + 1;
          const displayQueueNumber = `رقم #${formatQueueNumber(currentTurn)} (تذكرة حجز رقم ${formatQueueNumber(booking.queueNumber)})`;

          await tx
            .insert(notificationOutbox)
            .values({
              eventType: "TURN_CALLED",
              recipientId: student.id,
              telegramChatId: student.telegramUserId,
              payload: {
                studentName: student.fullName,
                queueNumber: displayQueueNumber,
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

    if (newStatus === BOOKING_STATUSES.COMPLETED || newStatus === BOOKING_STATUSES.CANCELLED) {
      BookingService.notifyQueueProgress(updated.bookingWindowId).catch((err) => {
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

    // Calculate dynamic moving turn position in queue
    const [aheadCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(bookings)
      .where(
        and(
          eq(bookings.bookingWindowId, booking.bookingWindowId),
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
      const alertMsg = `<b>جامعة برج العرب التكنولوجية (BATU)</b>\nقسم تكنولوجيا المعلومات — نظام بصمة الوجه\n\n<b>نداء عاجل ومكرر!</b>\nعزيزي الطالب <b>${student.fullName}</b>،\nحان دورك الآن رسمياً في الطابور برقم: <code>#${formatQueueNumber(currentTurn)}</code> (تذكرة حجز رقم: <code>${formatQueueNumber(booking.queueNumber)}</code>)\n\n<b>يرجى التوجه فوراً لشباك التسجيل لعمل بصمة الوجه قبل فوات الدور!</b>`;

      try {
        await TelegramService.sendMessage(Number(student.telegramUserId), alertMsg);
      } catch (err: any) {
        console.error("Failed to send repeat alert:", err.message);
      }
    }

    return { success: true, message: "تم إرسال النداء العاجل للطالب بنجاح" };
  }

  /**
   * Push back a student by 10 positions if they didn't show up when called.
   */
  static async pushBackTenPositions(bookingId: string) {
    const result = await db.transaction(async (tx) => {
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

      // Safe new queue number: Push back behind at least 10 or current window next
      const newQueueNumber = Math.max(window.nextQueueNumber, booking.queueNumber + 10);

      // Update window nextQueueNumber to guarantee uniqueness
      await tx
        .update(bookingWindows)
        .set({
          nextQueueNumber: newQueueNumber + 1,
          updatedAt: new Date(),
        })
        .where(eq(bookingWindows.id, window.id));

      // Update booking
      const [updated] = await tx
        .update(bookings)
        .set({
          queueNumber: newQueueNumber,
          status: "WAITING",
          calledAt: null,
          notes: `تم تأخير الدور 10 أدوار لعدم الحضور عند النداء الأول (كان ${booking.queueNumber})`,
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, bookingId))
        .returning();

      // Send Telegram notification with exact requested alert phrasing
      let telegramSent = false;
      if (student.telegramUserId) {
        const delayMsg = `<b>جامعة برج العرب التكنولوجية (BATU)</b>
قسم تكنولوجيا المعلومات — نظام بصمة الوجه

<b>تم تاجيل دورك 10 ادوار بسبب عدم وجودك</b>

عزيزي الطالب: <b>${student.fullName}</b>
نظراً لعدم حضورك عند المناداة على دورك أمام شباك التسجيل:

<b>رقم دورك السابق:</b> <code>#${formatQueueNumber(booking.queueNumber)}</code>
<b>رقم دورك الجديد هو:</b> <code>#${formatQueueNumber(newQueueNumber)}</code>

<b>المقر:</b> مبنى كلية تكنولوجيا الصناعة والطاقة — الطابق الأرضي — معمل الحاسب الآلي (شباك بصمة الوجه)
يرجى التواجد أمام الشباك والاستعداد فور وصول رقمك الجديد.`;

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
        previousQueueNumber: booking.queueNumber,
        newQueueNumber,
        formattedQueueNumber: formatQueueNumber(newQueueNumber),
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
يمكنك إعادة الحجز من المنصة عند فتح فترة حجز جديدة لسكشنك أو مراجعة إدارة شؤون الطلاب بالكلية.`;

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

    // Format items with decrypted National ID, activation info, and dynamic live turn in line
    const items = rawBookings.map((b, index) => {
      let nationalId = "غير متوفر";
      try {
        nationalId = decryptNationalId(b.nationalIdEncrypted);
      } catch {
        nationalId = "خطأ في فك التشفير";
      }

      const activation = activationsMap.get(b.studentId);
      const liveTurn = offset + index + 1;

      return {
        id: b.id,
        queueNumber: b.queueNumber,
        formattedQueueNumber: formatQueueNumber(b.queueNumber),
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
          eq(bookings.bookingWindowId, activeBooking.bookingWindowId),
          sql`${bookings.status} IN ('WAITING', 'CALLED')`,
          lt(bookings.queueNumber, activeBooking.queueNumber)
        )
      );

    const peopleAhead = Number(aheadResult?.count || 0);
    const currentTurn = peopleAhead + 1;
    const formattedNum = formatQueueNumber(activeBooking.queueNumber);
    const formattedTurn = formatQueueNumber(currentTurn);

    const msg = `<b>جامعة برج العرب التكنولوجية (BATU)</b>
قسم تكنولوجيا المعلومات — نظام بصمة الوجه

<b>تفاصيل حجز دورك المؤكد:</b>

<b>اسم الطالب:</b> ${student.fullName}
<b>الرقم الأكاديمي:</b> <code>${student.academicNumber}</code>
<b>رقم دورك الحالي في الطابور:</b> <code>#${formattedTurn}</code> (تذكرة حجز رقم: <code>#${formattedNum}</code>)
<b>حالة الطابور:</b> ${peopleAhead === 0 ? "أنت أول شخص في الطابور الآن!" : `باقي أمامك ${peopleAhead} أشخاص فقط في الانتظار`}

<b>المقر:</b> مبنى كلية تكنولوجيا الصناعة والطاقة — معمل الحاسب الآلي (شباك بصمة الوجه)
ستصلك رسالة تنبيهية فور المناداة على دورك.`;

    await TelegramService.sendMessage(Number(student.telegramUserId), msg);
    return { success: true, message: "تم إرسال تفاصيل الدور إلى حسابك على التيليجرام بنجاح" };
  }

  /**
   * Broadcast updated queue position to all remaining waiting students in a booking window
   * when a preceding student is accepted/completed/moved.
   */
  static async notifyQueueProgress(bookingWindowId: string) {
    try {
      // 1. Fetch all active bookings in this window in queue order
      const activeBookings = await db
        .select({
          bookingId: bookings.id,
          queueNumber: bookings.queueNumber,
          status: bookings.status,
          studentId: students.id,
          fullName: students.fullName,
          telegramUserId: students.telegramUserId,
        })
        .from(bookings)
        .innerJoin(students, eq(bookings.studentId, students.id))
        .where(
          and(
            eq(bookings.bookingWindowId, bookingWindowId),
            sql`${bookings.status} IN ('WAITING', 'CALLED')`
          )
        )
        .orderBy(bookings.queueNumber);

      if (!activeBookings.length) return;

      // 2. Iterate each waiting student and send their new turn position
      for (let i = 0; i < activeBookings.length; i++) {
        const item = activeBookings[i];
        // Only notify students who are still WAITING (if someone is already CALLED, they already received call message)
        if (item.status !== "WAITING" || !item.telegramUserId) continue;

        const aheadCount = i;
        const currentTurn = aheadCount + 1;
        const formattedTurn = formatQueueNumber(currentTurn);
        const formattedNum = formatQueueNumber(item.queueNumber);

        const progressMsg = `<b>جامعة برج العرب التكنولوجية (BATU)</b>
قسم تكنولوجيا المعلومات — نظام بصمة الوجه

<b>تحديث حركة الطابور:</b>
عزيزي الطالب <b>${item.fullName}</b>،
تم إنهاء معاملة الطالب السابق وتقدم الطابور، وأصبح دورك الحالي في الانتظار: <b>#${formattedTurn}</b> (تذكرة حجز رقم: <code>#${formattedNum}</code>).
${
  aheadCount === 0
    ? "أنت التالي في الطابور مباشرة! يرجى الوقوف أمام شباك التسجيل بالمعمل للاستعداد."
    : `باقي أمامك في الانتظار: ${aheadCount} طلاب.`
}

<b>المقر:</b> مبنى كلية تكنولوجيا الصناعة والطاقة — معمل الحاسب الآلي (شباك بصمة الوجه)`;

        // Send via Telegram
        TelegramService.sendMessage(Number(item.telegramUserId), progressMsg).catch((err) => {
          console.error(`[QueueProgress] Failed to notify student ${item.studentId}:`, err.message);
        });
      }
    } catch (err: any) {
      console.error("[QueueProgress] Error broadcasting queue progress:", err.message);
    }
  }
}
