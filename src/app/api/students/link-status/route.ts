import { NextRequest } from "next/server";
import { db } from "@/db";
import { students } from "@/db/schema";
import { eq } from "drizzle-orm";
import { apiSuccess, apiError } from "@/lib/utils/response";

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
        telegramUserId: students.telegramUserId,
        telegramUsername: students.telegramUsername,
        telegramLinkedAt: students.telegramLinkedAt,
      })
      .from(students)
      .where(eq(students.id, studentId));

    if (!student) {
      return apiError("الطالب غير موجود", 404);
    }

    return apiSuccess({
      isLinked: !!student.telegramUserId,
      telegramUsername: student.telegramUsername,
      telegramLinkedAt: student.telegramLinkedAt,
    });
  } catch (error: any) {
    return apiError(error.message || "حدث خطأ أثناء فحص حالة الربط", 500);
  }
}
