import { NextRequest } from "next/server";
import { studentRegistrationSchema } from "@/lib/validation/student";
import { StudentService } from "@/server/services/student.service";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { apiError, apiSuccess } from "@/lib/utils/response";
import { createSessionToken, AUTH_COOKIE_NAME } from "@/lib/security/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || "local";
    const rateLimit = checkRateLimit(`delegate-reg:${ip}`, 10, 5 * 60 * 1000);
    if (!rateLimit.success) {
      return apiError("تم تجاوز عدد محاولات التسجيل المسموح بها. يرجى الانتظار قليلاً.", 429, "RATE_LIMIT");
    }

    const body = await req.json();

    // Ensure isDelegate is explicitly true
    const parsed = studentRegistrationSchema.safeParse({
      ...body,
      academicYear: body.academicYear || "الفرقة الثالثة",
      isDelegate: true,
    });

    if (!parsed.success) {
      return apiError(parsed.error.errors[0].message, 400);
    }

    const result = await StudentService.registerStudent({
      ...parsed.data,
      isDelegate: true,
    });

    // Create session token for delegate
    const sessionToken = await createSessionToken({
      userId: result.student.id,
      studentId: result.student.id,
      fullName: result.student.fullName,
      academicNumber: result.student.academicNumber,
      groupId: result.student.groupId,
      sectionId: result.student.sectionId,
      role: "STUDENT",
    });

    const response = apiSuccess(
      result,
      "تم تسجيل بياناتك كمندوب رسمي بنجاح! يرجى ربط حسابك بالتيليجرام لتأكيد الهوية وتحديد فترات الفراغ.",
      201
    );

    response.cookies.set(AUTH_COOKIE_NAME, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });

    return response;
  } catch (error: any) {
    return apiError(error.message || "فشل تسجيل بيانات المندوب", 400);
  }
}

