import { NextRequest } from "next/server";
import { db } from "@/db";
import { users, students } from "@/db/schema";
import { eq } from "drizzle-orm";
import { comparePassword, createSessionToken, AUTH_COOKIE_NAME } from "@/lib/security/auth";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { formatCairoDateTime } from "@/lib/utils/datetime";
import { apiError, apiSuccess } from "@/lib/utils/response";
import { z } from "zod";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  identifier: z.string().trim().min(3, "يرجى إدخال البريد الإلكتروني"),
  secret: z.string().trim().min(6, "يرجى إدخال كلمة المرور"),
});

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get("x-forwarded-for") || "local";
    const rateLimit = checkRateLimit(`login:${ip}`, 10, 15 * 60 * 1000);
    if (!rateLimit.success) {
      return apiError("تم تجاوز عدد محاولات الدخول المسموحة. يرجى المحاولة بعد 15 دقيقة.", 429, "RATE_LIMIT");
    }

    const body = await req.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.errors[0].message, 400);
    }

    const { identifier, secret } = parsed.data;

    // Check if user is staff or admin
    const [adminUser] = await db
      .select()
      .from(users)
      .where(eq(users.email, identifier.toLowerCase()));

    if (adminUser) {
      if (!adminUser.passwordHash) {
        return apiError("بيانات الدخول غير صحيحة", 401);
      }
      const isMatch = await comparePassword(secret, adminUser.passwordHash);
      if (!isMatch) {
        return apiError("بيانات الدخول غير صحيحة", 401);
      }
      if (!adminUser.isActive) {
        return apiError("هذا الحساب مغلق / معطل حالياً من قِبل مسؤول النظام العام", 403);
      }
      if (adminUser.bannedUntil && new Date(adminUser.bannedUntil) > new Date()) {
        const reasonPart = adminUser.banReason ? ` - سبب الحظر: ${adminUser.banReason}` : "";
        return apiError(`تم حظر هذا الحساب مؤقتاً حتى ${formatCairoDateTime(adminUser.bannedUntil)}${reasonPart}`, 403);
      }

      const token = await createSessionToken({
        userId: adminUser.id,
        email: adminUser.email || undefined,
        fullName: adminUser.fullName,
        role: adminUser.role as any,
      });

      const response = apiSuccess(
        {
          user: {
            id: adminUser.id,
            email: adminUser.email,
            fullName: adminUser.fullName,
            role: adminUser.role,
          },
        },
        "تم تسجيل الدخول بنجاح"
      );

      response.cookies.set(AUTH_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 24 * 60 * 60, // 24 hours
      });

      return response;
    }

    // Check if this was a student trying to login by academic number
    const [student] = await db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.academicNumber, identifier.trim()))
      .limit(1);

    if (student) {
      return apiError(
        "بوابة تسجيل الدخول مخصصة لمشرفي وموظفي المنظومة فقط. لا توجد حسابات دخول للطلاب — متابعة حالة البصمة والدور متاحة مباشرة عبر بوت تيليجرام.",
        403
      );
    }

    return apiError("بيانات الدخول غير صحيحة", 401);
  } catch (error: any) {
    return apiError(error.message || "حدث خطأ غير متوقع", 500);
  }
}
