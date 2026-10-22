import { NextRequest } from "next/server";
import { db } from "@/db";
import { users, auditLogs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAuth, comparePassword, hashPassword } from "@/lib/security/auth";
import { apiError, apiSuccess } from "@/lib/utils/response";
import { z } from "zod";

export const dynamic = "force-dynamic";

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "يرجى إدخال كلمة المرور الحالية"),
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
