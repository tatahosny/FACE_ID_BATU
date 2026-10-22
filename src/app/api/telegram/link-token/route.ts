import { NextRequest } from "next/server";
import { TelegramService } from "@/server/services/telegram.service";
import { requireAuth } from "@/lib/security/auth";
import { apiError, apiSuccess } from "@/lib/utils/response";
import { db } from "@/db";
import { students } from "@/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    let studentId: string | null = null;

    try {
      const session = await requireAuth();
      studentId = session.studentId || session.userId || null;
    } catch {
      // Session not present, fallback to body
    }

    if (!studentId) {
      try {
        const body = await req.json();
        if (body.academicNumber) {
          const [st] = await db
            .select({ id: students.id })
            .from(students)
            .where(eq(students.academicNumber, body.academicNumber.trim()));
          if (st) studentId = st.id;
        } else if (body.studentId) {
          studentId = body.studentId;
        }
      } catch {
        // Ignored
      }
    }

    if (!studentId) {
      return apiError("لم يتم العثور على حساب الطالب، يرجى إدخال الرقم الأكاديمي", 400);
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
