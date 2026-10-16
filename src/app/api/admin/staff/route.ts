import { NextRequest } from "next/server";
import { db } from "@/db";
import { users, students, auditLogs } from "@/db/schema";
import { eq, or, desc, ilike, and } from "drizzle-orm";
import { requireRole, hashPassword } from "@/lib/security/auth";
import { USER_ROLES } from "@/lib/constants/statuses";
import { apiError, apiSuccess } from "@/lib/utils/response";
import { z } from "zod";

export const dynamic = "force-dynamic";

const editAccountSchema = z.object({
  id: z.string().uuid("معرف المستخدم غير صالح"),
  targetType: z.enum(["USER", "STUDENT"]).default("USER"),
  fullName: z.string().min(2, "الاسم الكامل مطلوب"),
  email: z.string().email("البريد الإلكتروني غير صالح").optional().nullable(),
  academicNumber: z.string().optional().nullable(),
  role: z.enum([USER_ROLES.SUPER_ADMIN, USER_ROLES.STAFF]).optional(),
  password: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
  bannedUntil: z.string().optional().nullable(),
  banReason: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  try {
    await requireRole([USER_ROLES.SUPER_ADMIN]);

    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type"); // "students" or "staff"
    const search = searchParams.get("search")?.trim();

    if (type === "students") {
      let query = db
        .select({
          id: students.id,
          fullName: students.fullName,
          academicNumber: students.academicNumber,
          telegramUsername: students.telegramUsername,
          subSection: students.subSection,
          isActive: students.isActive,
          bannedUntil: students.bannedUntil,
          banReason: students.banReason,
          hasPassword: students.passwordHash,
          createdAt: students.createdAt,
        })
        .from(students);

      if (search) {
        const pattern = `%${search}%`;
        const res = await query
          .where(
            or(
              ilike(students.fullName, pattern),
              ilike(students.academicNumber, pattern)
            )
          )
          .orderBy(desc(students.createdAt))
          .limit(50);

        return apiSuccess({
          students: res.map((s) => ({
            ...s,
            hasPassword: !!s.hasPassword,
          })),
        });
      }

      const res = await query.orderBy(desc(students.createdAt)).limit(50);
      return apiSuccess({
        students: res.map((s) => ({
          ...s,
          hasPassword: !!s.hasPassword,
        })),
      });
    }

    // Default: Staff / Admin accounts
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
      return apiError("غير مصرح", 403);
    }
    return apiError(error.message || "فشل جلب قائمة المستخدمين", 500);
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
      "تم إنشاء الحساب بنجاح",
      201
    );
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح: إدارة الحسابات متاحة فقط لمدير النظام", 403);
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
      targetType,
      fullName,
      email,
      academicNumber,
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

    // USER modification
    if (targetType === "USER") {
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
      const normalizedEmail = (email ? email.toLowerCase().trim() : existingUser.email) || "";
      if (normalizedEmail && normalizedEmail !== existingUser.email) {
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
        email: normalizedEmail || existingUser.email,
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
    }

    // STUDENT modification
    if (targetType === "STUDENT") {
      const [existingStudent] = await db.select().from(students).where(eq(students.id, id));
      if (!existingStudent) {
        return apiError("سجل الطالب غير موجود", 404);
      }

      // Check unique academicNumber if modified
      const normAcad: string = academicNumber ? academicNumber.trim() : existingStudent.academicNumber;
      if (normAcad !== existingStudent.academicNumber) {
        const [duplicate] = await db
          .select()
          .from(students)
          .where(eq(students.academicNumber, normAcad));
        if (duplicate) {
          return apiError("الرقم الأكاديمي مسجل بالفعل لطالب آخر", 400);
        }
      }

      const updateData: any = {
        fullName: fullName.trim(),
        academicNumber: normAcad,
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
        .update(students)
        .set(updateData)
        .where(eq(students.id, id))
        .returning();

      await db.insert(auditLogs).values({
        actorId: session.userId,
        action: "STUDENT_ACCOUNT_UPDATED",
        entityType: "STUDENT",
        entityId: updated.id,
        safeMetadata: {
          academicNumber: updated.academicNumber,
          isActive: updated.isActive,
          bannedUntil: updated.bannedUntil,
          banReason: updated.banReason,
          passwordChanged: !!updateData.passwordHash,
        },
      });

      return apiSuccess({ student: updated }, "تم تحديث بيانات حساب الطالب وعقوباته بنجاح!");
    }

    return apiError("نوع الحساب المستهدف غير معتمد", 400);
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
    const targetType = searchParams.get("targetType") || "USER";

    if (!id) {
      return apiError("معرف الحساب مطلوب للحذف", 400);
    }

    if (targetType === "USER") {
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

      return apiSuccess(null, "تم حذف حساب المستخدم نهائياً");
    }

    if (targetType === "STUDENT") {
      const [student] = await db.select().from(students).where(eq(students.id, id));
      if (!student) {
        return apiError("سجل الطالب غير موجود", 404);
      }

      try {
        await db.delete(students).where(eq(students.id, id));
      } catch (err: any) {
        return apiError(
          "لا يمكن حذف هذا الطالب لوجود سجلات مرتبطة به (حجوزات أو تذاكر). يمكنك تعطيل الحساب بدلاً من حذفه.",
          400
        );
      }

      await db.insert(auditLogs).values({
        actorId: session.userId,
        action: "STUDENT_ACCOUNT_DELETED",
        entityType: "STUDENT",
        entityId: id,
        safeMetadata: { academicNumber: student.academicNumber, fullName: student.fullName },
      });

      return apiSuccess(null, "تم حذف سجل الطالب نهائياً");
    }

    return apiError("نوع الحساب غير مدعوم", 400);
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح: حذف الحسابات متاح فقط لمدير النظام", 403);
    }
    return apiError(error.message || "فشل حذف الحساب", 500);
  }
}
