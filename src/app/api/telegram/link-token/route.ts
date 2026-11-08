import { NextRequest } from "next/server";
import { TelegramService } from "@/server/services/telegram.service";
import { requireAuth } from "@/lib/security/auth";
import { computeNationalIdHash } from "@/lib/security/crypto";
import { apiError, apiSuccess } from "@/lib/utils/response";
import { db } from "@/db";
import { students } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    let studentId: string | null = null;

    try {
      const session = await requireAuth();
      studentId = session.studentId || session.userId || null;
    } catch {
      // Session not present, require nationalId verification below
    }

    if (!studentId) {
      try {
        const body = await req.json();
        const academicNumber = body.academicNumber?.trim();
        const nationalId = body.nationalId?.trim();

        // Require both academicNumber AND nationalId to prevent token leakage
        if (academicNumber && nationalId) {
          const nationalIdHash = computeNationalIdHash(nationalId);
          const [st] = await db
            .select({ id: students.id })
            .from(students)
            .where(
              and(
                eq(students.academicNumber, academicNumber),
                eq(students.nationalIdHash, nationalIdHash)
              )
            );
          if (st) {
            studentId = st.id;
          } else {
            return apiError("بيانات التحقق غير صحيحة (تأكد من الرقم الأكاديمي والرقم القومي 14 رقماً)", 401);
          }
        }
      } catch {
        // Ignored
      }
    }

    if (!studentId) {
      return apiError("غير مصرح: يجب تسجيل الدخول أو إدخال الرقم الأكاديمي والرقم القومي للتحقق من هويتك", 401);
    }

    const result = await TelegramService.createLinkingToken(studentId);

    return apiSuccess(
      result,
      "تم إنشاء رابط ربط التيليجرام الخاص بك بنجاح. صالح لمدة 15 دقيقة."
    );
  } catch (error: any) {
    return apiError(error.message || "فشل إنشاء رابط الربط", 500);
  }
}
