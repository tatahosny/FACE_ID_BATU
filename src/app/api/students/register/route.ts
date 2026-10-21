import { NextRequest } from "next/server";
import { studentRegistrationSchema } from "@/lib/validation/student";
import { StudentService } from "@/server/services/student.service";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { apiError, apiSuccess } from "@/lib/utils/response";
import { createSessionToken, AUTH_COOKIE_NAME } from "@/lib/security/auth";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || "local";
    const rateLimit = checkRateLimit(`register:${ip}`, 10, 5 * 60 * 1000);
    if (!rateLimit.success) {
      return apiError("تم تجاوز عدد محاولات التسجيل المسموح بها. يرجى الانتظار قليلاً.", 429, "RATE_LIMIT");
    }

    const body = await req.json();
    const parsed = studentRegistrationSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.errors[0].message, 400);
    }

    const result = await StudentService.registerStudent(parsed.data);

    // Automatically create session for the registered student
    const sessionToken = await createSessionToken({
      userId: result.student.id,
      studentId: result.student.id,
      fullName: result.student.fullName,
      academicNumber: result.student.academicNumber,
      groupId: result.student.groupId,
      sectionId: result.student.sectionId,
      role: "STUDENT",
    });

    const successMsg = (result.student as any).isExistingUpdated
      ? "تم التحقق من بياناتك وتحديث السكشن والمجموعة بنجاح. يرجى إتمام ربط التيليجرام لمتابعة حجز دورك."
      : "تم تسجيل بياناتك بنجاح. يرجى ربط حسابك بالتيليجرام لمتابعة الحجز.";

    const response = apiSuccess(result, successMsg, 201);

    response.cookies.set(AUTH_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });

    return response;
  } catch (error: any) {
    return apiError(error.message || "فشل تسجيل الطالب", 400);
  }
}
