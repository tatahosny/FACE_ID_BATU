import { NextRequest } from "next/server";
import { db } from "@/db";
import {
  students,
  groups,
  sections,
  bookingWindows,
  bookings,
  fingerprintActivations,
  users,
} from "@/db/schema";
import { eq, and, sql, desc, ne, lt } from "drizzle-orm";
import { apiError, apiSuccess } from "@/lib/utils/response";
import { BOOKING_STATUSES, BOOKING_WINDOW_STATUSES } from "@/lib/constants/statuses";
import { formatQueueNumber, formatCairoDateTime } from "@/lib/utils/datetime";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const academicNumber = (searchParams.get("academicNumber") || searchParams.get("query"))?.trim();

    if (!academicNumber) {
      return apiError("يرجى إدخال الرقم الأكاديمي", 400);
    }

    // 1. Fetch student record with group and section
    const [student] = await db
      .select({
        id: students.id,
        fullName: students.fullName,
        academicNumber: students.academicNumber,
        groupId: students.groupId,
        groupName: groups.name,
        sectionId: students.sectionId,
        sectionName: sections.name,
        subSection: students.subSection,
        telegramUserId: students.telegramUserId,
        telegramUsername: students.telegramUsername,
        isActive: students.isActive,
      })
      .from(students)
      .innerJoin(groups, eq(students.groupId, groups.id))
      .innerJoin(sections, eq(students.sectionId, sections.id))
      .where(eq(students.academicNumber, academicNumber));

    if (!student) {
      return apiError(
        "الرقم الأكاديمي غير مسجل في المنظومة. يرجى تسجيل بياناتك أولاً عبر صفحة «تسجيل طالب جديد».",
        404
      );
    }

    if (!student.isActive) {
      return apiError("تم تعطيل هذا القيد الأكاديمي، يرجى مراجعة إدارة شؤون الطلاب.", 403);
    }

    const hasTelegram = !!student.telegramUserId;

    // 2. Check if fingerprint is already activated
    const [activation] = await db
      .select({
        id: fingerprintActivations.id,
        activatedAt: fingerprintActivations.activatedAt,
        staffName: users.fullName,
      })
      .from(fingerprintActivations)
      .innerJoin(users, eq(fingerprintActivations.activatedBy, users.id))
      .where(
        and(
          eq(fingerprintActivations.studentId, student.id),
          eq(fingerprintActivations.status, "ACTIVATED")
        )
      )
      .orderBy(desc(fingerprintActivations.activatedAt))
      .limit(1);

    const isFingerprintActivated = !!activation;

    // 3. Check if student already has an active or called booking
    const [existingBooking] = await db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.studentId, student.id),
          sql`${bookings.status} IN ('WAITING', 'CALLED', 'IN_PROGRESS')`
        )
      )
      .orderBy(desc(bookings.bookedAt))
      .limit(1);

    let peopleAhead = 0;
    let deskAhead = 0;
    let globalAhead = 0;
    let formattedTicketNumber: string | null = null;
    let deskTurn = 1;
    let globalTurn = 1;
    let formattedDeskTurn: string | null = null;
    let formattedGlobalTurn: string | null = null;

    if (existingBooking) {
      const ticketNum = existingBooking.ticketNumber || existingBooking.queueNumber;
      formattedTicketNumber = formatQueueNumber(ticketNum);
      const studentDesk = existingBooking.desk || "T";

      // 1. Count active students ahead specifically in the assigned desk
      const [aheadDeskCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(bookings)
        .where(
          and(
            eq(bookings.desk, studentDesk),
            sql`${bookings.status} IN ('WAITING', 'CALLED', 'IN_PROGRESS')`,
            lt(bookings.queueNumber, existingBooking.queueNumber)
          )
        );
      deskAhead = Number(aheadDeskCount?.count || 0);
      deskTurn = deskAhead + 1;
      formattedDeskTurn = formatQueueNumber(deskTurn);

      // 2. Count active students ahead across the entire college queue
      const [aheadGlobalCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(bookings)
        .where(
          and(
            sql`${bookings.status} IN ('WAITING', 'CALLED', 'IN_PROGRESS')`,
            lt(bookings.queueNumber, existingBooking.queueNumber)
          )
        );
      globalAhead = Number(aheadGlobalCount?.count || 0);
      globalTurn = globalAhead + 1;
      formattedGlobalTurn = formatQueueNumber(globalTurn);
      peopleAhead = deskAhead;
    }

    // 4. Check whether booking window is open for student's section and subsection
    const now = new Date();
    // In our system, if admin sets status = 'OPEN', it is explicitly open regardless of clock drift or endsAt.
    const candidateWindows = await db
      .select()
      .from(bookingWindows)
      .where(
        and(
          eq(bookingWindows.sectionId, student.sectionId),
          eq(bookingWindows.status, BOOKING_WINDOW_STATUSES.OPEN)
        )
      )
      .orderBy(desc(bookingWindows.createdAt));

    const studentSub = (student.subSection || "A").trim().toUpperCase();
    const openWindow = candidateWindows.find((w) => {
      const winSub = (w.subSection || "ALL").trim().toUpperCase();
      return winSub === "ALL" || winSub === "" || winSub === studentSub;
    });

    if (openWindow && (new Date(openWindow.endsAt) < now || new Date(openWindow.startsAt) > now)) {
      // Auto-refresh window validity if open
      db.update(bookingWindows)
        .set({
          startsAt: new Date(Date.now() - 3600000),
          endsAt: new Date(Date.now() + 14 * 86400000),
          updatedAt: new Date(),
        })
        .where(eq(bookingWindows.id, openWindow.id))
        .catch(console.error);
    }

    const isWindowOpen = !!openWindow;
    const windowClosedReason = isWindowOpen
      ? null
      : candidateWindows.length > 0
      ? `الحجز مفتوح حالياً لطلاب القسم الفرعي (${candidateWindows[0].subSection}) فقط، وأنت مقيد في القسم (${studentSub}). ستصلك رسالة تنبيهية فورية على التيليجرام فور فتح الحجز لقسمك.`
      : `لم يتم تفعيل وقت البصمة للسكشن بتاعك بعد. يرجى الانتظار، ستصلك رسالة تنبيهية على التيليجرام فور فتح الحجز لسكشنك.`;

    // Security Notice: Linking tokens are strictly restricted to verified identity flows (National ID verification or active authenticated sessions).
    // Student Lookup is a public query and MUST NEVER generate or expose any student's Telegram linking token.

    return apiSuccess({
      student: {
        id: student.id,
        fullName: student.fullName,
        academicNumber: student.academicNumber,
        groupName: student.groupName,
        sectionName: student.sectionName,
        sectionId: student.sectionId,
        subSection: student.subSection || "A",
        hasTelegram,
        telegramUsername: student.telegramUsername,
      },
      isFingerprintActivated,
      activation: activation
        ? {
            activatedAt: formatCairoDateTime(activation.activatedAt),
            staffName: activation.staffName,
          }
        : null,
      existingBooking: existingBooking
        ? {
            id: existingBooking.id,
            ticketNumber: existingBooking.ticketNumber || existingBooking.queueNumber,
            formattedTicketNumber,
            // Provide unique ticket number as primary queueNumber so each student has a distinct number
            queueNumber: existingBooking.ticketNumber || existingBooking.queueNumber,
            formattedQueueNumber: formattedTicketNumber,
            deskTurn,
            formattedDeskTurn,
            currentTurn: deskTurn,
            formattedCurrentTurn: formattedDeskTurn,
            globalTurn,
            formattedGlobalTurn,
            status: existingBooking.status,
            desk: existingBooking.desk || "T",
            peopleAhead: deskAhead,
            deskAhead,
            globalAhead,
            bookedAt: formatCairoDateTime(existingBooking.bookedAt),
          }
        : null,
      isWindowOpen,
      windowId: openWindow?.id || null,
      windowClosedReason,
    });
  } catch (error: any) {
    return apiError(error.message || "فشل التحقق من بيانات الطالب", 500);
  }
}
