import { NextRequest } from "next/server";
import { db } from "@/db";
import { users, students, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth, comparePassword, hashPassword } from "@/lib/security/auth";
import { computeNationalIdHash } from "@/lib/security/crypto";
import { apiError, apiSuccess } from "@/lib/utils/response";
import { z } from "zod";

export const dynamic = "force-dynamic";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "يرجى إدخال كلمة المرور الحالية (أو الرقم القومي)"),
  newPassword: z.string().min(6, "كلمة المرور الجديدة يجب ألا تقل عن 6 خانات"),
});

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();
    const body = await req.json();

    const parsed = changePasswordSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.errors[0].message, 400);
    }

    const { currentPassword, newPassword } = parsed.data;

    // Check if session is a student
    if (session.role === "STUDENT" || session.studentId) {
      const studentId = session.studentId || session.userId;
      const [student] = await db
        .select()
        .from(students)
        .where(eq(students.id, studentId));

      if (!student) {
        return apiError("سجل الطالب غير موجود", 404);
      }

      // Check current password (either custom password or original national ID)
      let isMatch = false;
      if (student.passwordHash) {
        isMatch = await comparePassword(currentPassword, student.passwordHash);
      } else {
        const hash = computeNationalIdHash(currentPassword.trim());
        isMatch = hash === student.nationalIdHash;
      }

      if (!isMatch) {
        return apiError("كلمة المرور الحالية (أو الرقم القومي) غير صحيحة", 400);
      }

      const newHash = await hashPassword(newPassword);
      await db
        .update(students)
        .set({
          passwordHash: newHash,
          updatedAt: new Date(),
        })
        .where(eq(students.id, student.id));

      await db.insert(auditLogs).values({
        actorId: null,
        action: "STUDENT_PASSWORD_CHANGED",
        entityType: "STUDENT",
        entityId: student.id,
        safeMetadata: { academicNumber: student.academicNumber },
      });

      return apiSuccess(null, "تم تغيير كلمة المرور بنجاح! يمكنك استخدامها لتسجيل الدخول لاحقاً.");
    }

    // Administrative / Staff user in users table
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, session.userId));

    if (!user) {
      return apiError("المستخدم غير موجود", 404);
    }

    if (!user.passwordHash) {
      return apiError("لم يتم تعيين كلمة مرور سابقة لهذا الحساب", 400);
    }

    const isMatch = await comparePassword(currentPassword, user.passwordHash);
    if (!isMatch) {
      return apiError("كلمة المرور الحالية غير صحيحة", 400);
    }

    const newHash = await hashPassword(newPassword);
    await db
      .update(users)
      .set({
        passwordHash: newHash,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    await db.insert(auditLogs).values({
      actorId: user.id,
      action: "USER_PASSWORD_CHANGED",
      entityType: "USER",
      entityId: user.id,
      safeMetadata: { email: user.email, role: user.role },
    });

    return apiSuccess(null, "تم تغيير كلمة المرور بنجاح!");
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return apiError("يرجى تسجيل الدخول أولاً", 401);
    }
    return apiError(error.message || "فشل تغيير كلمة المرور", 500);
  }
}
