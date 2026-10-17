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
import { TelegramService } from "@/server/services/telegram.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const academicNumber = searchParams.get("academicNumber")?.trim();

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
    let formattedTicketNumber: string | null = null;
    let currentTurn = 1;
    let formattedCurrentTurn: string | null = null;

    if (existingBooking) {
      const ticketNum = existingBooking.ticketNumber || existingBooking.queueNumber;
      formattedTicketNumber = formatQueueNumber(ticketNum);
      // Count active students ahead in the same window
      const [aheadCount] = await db
        .select({ count: sql<number>`count(*)` })
        .from(bookings)
        .where(
          and(
            eq(bookings.bookingWindowId, existingBooking.bookingWindowId),
            sql`${bookings.status} IN ('WAITING', 'CALLED', 'IN_PROGRESS')`,
            lt(bookings.queueNumber, existingBooking.queueNumber)
          )
        );
      peopleAhead = Number(aheadCount?.count || 0);
      currentTurn = peopleAhead + 1;
      formattedCurrentTurn = formatQueueNumber(currentTurn);
    }

    // 4. Check whether booking window is open for student's section
    const now = new Date();
    const [openWindow] = await db
      .select()
      .from(bookingWindows)
      .where(
        and(
          eq(bookingWindows.sectionId, student.sectionId),
          eq(bookingWindows.status, BOOKING_WINDOW_STATUSES.OPEN),
          sql`${bookingWindows.startsAt} <= ${now.toISOString()}`,
          sql`${bookingWindows.endsAt} >= ${now.toISOString()}`
        )
      )
      .limit(1);

    const isWindowOpen = !!openWindow;
    const windowClosedReason = isWindowOpen
      ? null
      : "لم يتم تفعيل وقت البصمة للسكشن بتاعك. يرجى الانتظار، ستصلك رسالة تنبيهية على التيليجرام فور فتح الحجز لسكشنك.";

    // Generate unique personal linking token if student is not linked yet
    let telegramDeepLink: string | null = null;
    if (!hasTelegram) {
      try {
        const linkToken = await TelegramService.createLinkingToken(student.id);
        telegramDeepLink = linkToken.deepLink;
      } catch (err) {
        console.error("Failed to generate link token in student lookup:", err);
      }
    }

    return apiSuccess({
      student: {
        id: student.id,
        fullName: student.fullName,
        academicNumber: student.academicNumber,
        groupName: student.groupName,
        sectionName: student.sectionName,
        sectionId: student.sectionId,
        hasTelegram,
        telegramUsername: student.telegramUsername,
        telegramDeepLink,
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
            // Dynamic moving turn: advances forward when earlier students finish (e.g. 12 -> 10 -> 1)
            queueNumber: currentTurn,
            formattedQueueNumber: formattedCurrentTurn,
            currentTurn,
            formattedCurrentTurn,
            status: existingBooking.status,
            peopleAhead,
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
