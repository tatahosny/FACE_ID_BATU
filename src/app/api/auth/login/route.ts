import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users, students } from "@/db/schema";
import { eq, or } from "drizzle-orm";
import { comparePassword, createSessionToken, AUTH_COOKIE_NAME } from "@/lib/security/auth";
import { computeNationalIdHash } from "@/lib/security/crypto";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { apiError, apiSuccess } from "@/lib/utils/response";
import { z } from "zod";

const loginSchema = z.object({
  // Can be email (for staff/admin) or academicNumber (for student)
  identifier: z.string().trim().min(3, "يرجى إدخال البريد الإلكتروني أو الرقم الأكاديمي"),
  // Password for staff/admin OR nationalId for student
  secret: z.string().trim().min(6, "يرجى إدخال كلمة المرور أو الرقم القومي"),
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

    // 1. Check if identifier is an administrative or staff user (by email)
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
        return apiError("هذا الحساب معطل حالياً، يرجى مراجعة إدارة الكلية", 403);
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
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60, // 7 days
      });

      return response;
    }

    // 2. Check if identifier is a student academic number
    const [student] = await db
      .select()
      .from(students)
      .where(eq(students.academicNumber, identifier.trim()));

    if (student) {
      // Validate National ID using zero-knowledge HMAC hash
      const secretHash = computeNationalIdHash(secret);
      if (student.nationalIdHash !== secretHash) {
        return apiError("بيانات الدخول غير صحيحة", 401);
      }
      if (!student.isActive) {
        return apiError("حساب الطالب معطل، يرجى مراجعة إدارة الكلية", 403);
      }

      const token = await createSessionToken({
        userId: student.id,
        studentId: student.id,
        academicNumber: student.academicNumber,
        fullName: student.fullName,
        groupId: student.groupId,
        sectionId: student.sectionId,
        role: "STUDENT",
      });

      const response = apiSuccess(
        {
          user: {
            id: student.id,
            studentId: student.id,
            academicNumber: student.academicNumber,
            fullName: student.fullName,
            role: "STUDENT",
            groupId: student.groupId,
            sectionId: student.sectionId,
          },
        },
        "تم تسجيل الدخول بنجاح"
      );

      response.cookies.set(AUTH_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 7 * 24 * 60 * 60,
      });

      return response;
    }

    return apiError("بيانات الدخول غير صحيحة", 401);
  } catch (error: any) {
    return apiError(error.message || "حدث خطأ غير متوقع", 500);
  }
}
