import { NextRequest } from "next/server";
import { db } from "@/db";
import { students } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/security/auth";
import { USER_ROLES } from "@/lib/constants/statuses";
import { apiError, apiSuccess } from "@/lib/utils/response";
import { TelegramService } from "@/server/services/telegram.service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await requireRole([USER_ROLES.SUPER_ADMIN, USER_ROLES.STAFF]);

    const body = await req.json();
    const { studentId } = body;

    if (!studentId) {
      return apiError("معرف الطالب مطلوب", 400);
    }

    const [student] = await db
      .select({
        id: students.id,
        fullName: students.fullName,
        academicNumber: students.academicNumber,
        telegramUserId: students.telegramUserId,
      })
      .from(students)
      .where(eq(students.id, studentId));

    if (!student) {
      return apiError("الطالب غير موجود في قاعدة البيانات", 404);
    }

    if (!student.telegramUserId) {
      return apiError("هذا الطالب غير مرتبط بأي حساب تيليجرام حالياً.", 400);
    }

    const purgeResult = await TelegramService.purgeChatMessages(Number(student.telegramUserId));

    return apiSuccess(
      purgeResult,
      purgeResult.message || `تم مسح محادثة بوت التيليجرام للطالب (${student.fullName}) بنجاح!`
    );
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح: هذه العملية متاحة للمشرفين فقط", 403);
    }
    return apiError(error.message || "فشل مسح محادثة التيليجرام", 500);
  }
}

