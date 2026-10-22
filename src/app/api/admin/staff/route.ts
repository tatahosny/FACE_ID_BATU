import { NextRequest } from "next/server";
import { db } from "@/db";
import { users, auditLogs } from "@/db/schema";
import { eq, or, desc, ilike, and } from "drizzle-orm";
import { requireRole, hashPassword } from "@/lib/security/auth";
import { USER_ROLES } from "@/lib/constants/statuses";
import { apiError, apiSuccess } from "@/lib/utils/response";
import { z } from "zod";

export const dynamic = "force-dynamic";

const editAccountSchema = z.object({
  id: z.string().uuid("معرف المستخدم غير صالح"),
  fullName: z.string().min(2, "الاسم الكامل مطلوب"),
  email: z.string().email("البريد الإلكتروني غير صالح"),
  role: z.enum([USER_ROLES.SUPER_ADMIN, USER_ROLES.STAFF]).default(USER_ROLES.STAFF),
  password: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
  bannedUntil: z.string().optional().nullable(),
  banReason: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  try {
    await requireRole([USER_ROLES.SUPER_ADMIN]);

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim();

    // Query Staff & Super Admin accounts only
    let query = db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        role: users.role,
        isActive: users.isActive,
        bannedUntil: users.bannedUntil,
        banReason: users.banReason,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(or(eq(users.role, USER_ROLES.STAFF), eq(users.role, USER_ROLES.SUPER_ADMIN)));

    if (search) {
      const pattern = `%${search}%`;
      const res = await db
        .select({
          id: users.id,
          email: users.email,
          fullName: users.fullName,
          role: users.role,
          isActive: users.isActive,
          bannedUntil: users.bannedUntil,
          banReason: users.banReason,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(
          and(
            or(eq(users.role, USER_ROLES.STAFF), eq(users.role, USER_ROLES.SUPER_ADMIN)),
            or(ilike(users.fullName, pattern), ilike(users.email, pattern))
          )
        )
        .orderBy(desc(users.createdAt));
      return apiSuccess({ staff: res });
    }

    const staffUsers = await query.orderBy(desc(users.createdAt));
    return apiSuccess({ staff: staffUsers });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح لك بعرض هذه البيانات", 403);
    }
    return apiError(error.message || "فشل جلب قائمة موظفي النظام", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole([USER_ROLES.SUPER_ADMIN]);

    const body = await req.json();
    const createSchema = z.object({
      fullName: z.string().min(2, "الاسم الكامل مطلوب"),
      email: z.string().email("البريد الإلكتروني غير صالح"),
      password: z.string().min(6, "كلمة المرور يجب ألا تقل عن 6 خانات"),
      role: z.enum([USER_ROLES.SUPER_ADMIN, USER_ROLES.STAFF]).default(USER_ROLES.STAFF),
    });

    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.errors[0].message, 400);
    }

    const email = parsed.data.email.toLowerCase().trim();

    // Check existing email
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
        fullName: parsed.data.fullName.trim(),
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
      return apiError("غير مصرح: إدارة الحسابات متاحة فقط لمدير النظام العام", 403);
    }
    return apiError(error.message || "فشل إنشاء الحساب", 400);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await requireRole([USER_ROLES.SUPER_ADMIN]);

    const body = await req.json();
    const parsed = editAccountSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.errors[0].message, 400);
    }

    const {
      id,
      fullName,
      email,
      role,
      password,
      isActive,
      bannedUntil,
      banReason,
    } = parsed.data;

    let banDate: Date | null = null;
    if (bannedUntil) {
      const parsedDate = new Date(bannedUntil);
      if (isNaN(parsedDate.getTime())) {
        return apiError("تاريخ الحظر غير صالح", 400);
      }
      banDate = parsedDate;
    }

    const [existingUser] = await db.select().from(users).where(eq(users.id, id));
    if (!existingUser) {
      return apiError("المستخدم غير موجود", 404);
    }

    // Safeguard: Do not allow super admin to demote, deactivate, or ban their own active session
    if (existingUser.id === session.userId) {
      if (!isActive) {
        return apiError("لا يمكنك قفل أو تعطيل حسابك الشخصي النشط حالياً", 400);
      }
      if (banDate && banDate > new Date()) {
        return apiError("لا يمكنك حظر حسابك الشخصي النشط حالياً", 400);
      }
      if (role && role !== USER_ROLES.SUPER_ADMIN) {
        return apiError("لا يمكنك إلغاء صلاحية مدير النظام العام عن حسابك الشخصي", 400);
      }
    }

    // Check unique email if modified
    const normalizedEmail = email.toLowerCase().trim();
    if (normalizedEmail !== existingUser.email) {
      const [duplicate] = await db
        .select()
        .from(users)
        .where(eq(users.email, normalizedEmail));
      if (duplicate) {
        return apiError("البريد الإلكتروني مسجل بالفعل لمستخدم آخر", 400);
      }
    }

    const updateData: any = {
      fullName: fullName.trim(),
      email: normalizedEmail,
      role: role || existingUser.role,
      isActive,
      bannedUntil: banDate,
      banReason: banDate ? banReason || "حظر مؤقت بقرار إداري" : null,
      updatedAt: new Date(),
    };

    if (password && password.trim().length > 0) {
      if (password.trim().length < 6) {
        return apiError("كلمة المرور يجب ألا تقل عن 6 خانات", 400);
      }
      updateData.passwordHash = await hashPassword(password.trim());
    }

    const [updated] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning();

    await db.insert(auditLogs).values({
      actorId: session.userId,
      action: "USER_ACCOUNT_UPDATED",
      entityType: "USER",
      entityId: updated.id,
      safeMetadata: {
        email: updated.email,
        role: updated.role,
        isActive: updated.isActive,
        bannedUntil: updated.bannedUntil,
        banReason: updated.banReason,
        passwordChanged: !!updateData.passwordHash,
      },
    });

    return apiSuccess({ user: updated }, "تم تحديث بيانات الحساب وصلاحياته بنجاح!");
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح: تعديل الحسابات متاح فقط لمدير النظام العام", 403);
    }
    return apiError(error.message || "فشل تحديث بيانات الحساب", 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await requireRole([USER_ROLES.SUPER_ADMIN]);
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return apiError("معرف الحساب مطلوب للحذف", 400);
    }

    if (id === session.userId) {
      return apiError("لا يمكنك حذف حسابك الشخصي المسجل به حالياً", 400);
    }

    const [user] = await db.select().from(users).where(eq(users.id, id));
    if (!user) {
      return apiError("المستخدم غير موجود", 404);
    }

    try {
      await db.delete(users).where(eq(users.id, id));
    } catch (err: any) {
      return apiError(
        "لا يمكن حذف هذا الحساب لوجود سجلات عمليات مرتبطة به (مثل اعتماد بصمات طلاب أو خدمة تذاكر). يمكنك قفل الحساب أو حظره بدلاً من حذفه.",
        400
      );
    }

    await db.insert(auditLogs).values({
      actorId: session.userId,
      action: "USER_ACCOUNT_DELETED",
      entityType: "USER",
      entityId: id,
      safeMetadata: { email: user.email, fullName: user.fullName },
    });

    return apiSuccess(null, "تم حذف حساب المستخدم بنجاح");
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح: حذف الحسابات متاح فقط لمدير النظام العام", 403);
    }
    return apiError(error.message || "فشل حذف الحساب", 500);
  }
}
