import { NextRequest } from "next/server";
import { db } from "@/db";
import { users, auditLogs } from "@/db/schema";
import { eq, or, desc } from "drizzle-orm";
import { requireRole, hashPassword } from "@/lib/security/auth";
import { USER_ROLES } from "@/lib/constants/statuses";
import { createStaffUserSchema } from "@/lib/validation/admin";
import { apiError, apiSuccess } from "@/lib/utils/response";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole([USER_ROLES.SUPER_ADMIN]);

    const staffUsers = await db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        role: users.role,
        isActive: users.isActive,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(or(eq(users.role, USER_ROLES.STAFF), eq(users.role, USER_ROLES.SUPER_ADMIN)))
      .orderBy(desc(users.createdAt));

    return apiSuccess({ staff: staffUsers });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح", 403);
    }
    return apiError(error.message || "فشل جلب قائمة الموظفين", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole([USER_ROLES.SUPER_ADMIN]);

    const body = await req.json();
    const parsed = createStaffUserSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.errors[0].message, 400);
    }

    const email = parsed.data.email.toLowerCase();

    // Check existing
    const [existing] = await db.select().from(users).where(eq(users.email, email));
    if (existing) {
      return apiError("البريد الإلكتروني مسجل بالفعل لمستخدم آخر", 400);
    }

    const passwordHash = await hashPassword(parsed.data.password);

    const [created] = await db
      .insert(users)
      .values({
        email,
        passwordHash,
        fullName: parsed.data.fullName,
        role: parsed.data.role,
        isActive: true,
      })
      .returning();

    // Audit log
    await db.insert(auditLogs).values({
      actorId: session.userId,
      action: "STAFF_ACCOUNT_CREATED",
      entityType: "USER",
      entityId: created.id,
      safeMetadata: {
        email: created.email,
        role: created.role,
      },
    });

    return apiSuccess(
      {
        user: {
          id: created.id,
          email: created.email,
          fullName: created.fullName,
          role: created.role,
        },
      },
      "تم إنشاء حساب الموظف بنجاح",
      201
    );
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح: إدارة حسابات الموظفين متاحة فقط لمدير النظام", 403);
    }
    return apiError(error.message || "فشل إنشاء الحساب", 400);
  }
}
