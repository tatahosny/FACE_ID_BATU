import { NextRequest } from "next/server";
import { db } from "@/db";
import { students, bookingWindows } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { apiSuccess, apiError } from "@/lib/utils/response";
import { BOOKING_WINDOW_STATUSES } from "@/lib/constants/statuses";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const studentId = req.nextUrl.searchParams.get("studentId");
    if (!studentId) {
      return apiError("معرف الطالب مطلوب", 400);
    }

    const [student] = await db
      .select({
        id: students.id,
        fullName: students.fullName,
        academicNumber: students.academicNumber,
        sectionId: students.sectionId,
        subSection: students.subSection,
        telegramUserId: students.telegramUserId,
        telegramUsername: students.telegramUsername,
        telegramLinkedAt: students.telegramLinkedAt,
      })
      .from(students)
      .where(eq(students.id, studentId));

    if (!student) {
      return apiError("الطالب غير موجود", 404);
    }

    let isBookingOpen = false;
    if (student.sectionId) {
      const nowIso = new Date().toISOString();
      const candidateWindows = await db
        .select()
        .from(bookingWindows)
        .where(
          and(
            eq(bookingWindows.sectionId, student.sectionId),
            eq(bookingWindows.status, BOOKING_WINDOW_STATUSES.OPEN),
            sql`${bookingWindows.startsAt} <= ${nowIso}`,
            sql`${bookingWindows.endsAt} >= ${nowIso}`
          )
        );

      isBookingOpen = candidateWindows.some(
        (w) => w.subSection === "ALL" || w.subSection === (student.subSection || "A")
      );
    }

    return apiSuccess({
      isLinked: !!student.telegramUserId,
      telegramUsername: student.telegramUsername,
      telegramLinkedAt: student.telegramLinkedAt,
      isBookingOpen,
    });
  } catch (error: any) {
    return apiError(error.message || "حدث خطأ أثناء فحص حالة الربط", 500);
  }
}
