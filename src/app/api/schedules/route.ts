import { NextRequest } from "next/server";
import { db } from "@/db";
import { sectionSchedules, sections, groups } from "@/db/schema";
import { eq, asc, desc, and, sql } from "drizzle-orm";
import { requireRole } from "@/lib/security/auth";
import { USER_ROLES } from "@/lib/constants/statuses";
import { apiError, apiSuccess } from "@/lib/utils/response";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const groupId = searchParams.get("groupId");
    const sectionId = searchParams.get("sectionId");
    const subSection = searchParams.get("subSection");

    let query = db
      .select({
        id: sectionSchedules.id,
        sectionId: sectionSchedules.sectionId,
        sectionName: sections.name,
        sectionCode: sections.code,
        groupId: sections.groupId,
        groupName: groups.name,
        date: sectionSchedules.date,
        startTime: sectionSchedules.startTime,
        endTime: sectionSchedules.endTime,
        subSection: sectionSchedules.subSection,
        notes: sectionSchedules.notes,
        createdAt: sectionSchedules.createdAt,
      })
      .from(sectionSchedules)
      .innerJoin(sections, eq(sectionSchedules.sectionId, sections.id))
      .innerJoin(groups, eq(sections.groupId, groups.id))
      .$dynamic();

    const conditions = [];
    if (groupId) {
      conditions.push(eq(sections.groupId, groupId));
    }
    if (sectionId) {
      conditions.push(eq(sectionSchedules.sectionId, sectionId));
    }
    if (subSection && subSection !== "ALL") {
      conditions.push(
        // Either exact subSection or ALL
        sql`(${sectionSchedules.subSection} = ${subSection} OR ${sectionSchedules.subSection} = 'ALL')`
      );
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    const list = await query.orderBy(asc(sectionSchedules.date), asc(sectionSchedules.startTime));

    return apiSuccess({ schedules: list });
  } catch (error: any) {
    return apiError(error.message || "فشل جلب جدول المواعيد", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole([USER_ROLES.SUPER_ADMIN]);

    const body = await req.json();
    const { sectionId, date, startTime, endTime, subSection, notes } = body;

    if (!sectionId || !date || !startTime || !endTime) {
      return apiError("يرجى ملء جميع حقول الموعد المطلوبة (السكشن، التاريخ، وقت البدء والانتهاء)", 400);
    }

    const validSubSection = ["ALL", "A", "B"].includes(subSection) ? subSection : "ALL";

    const [schedule] = await db
      .insert(sectionSchedules)
      .values({
        sectionId,
        date,
        startTime,
        endTime,
        subSection: validSubSection,
        notes: notes || "مبنى كلية تكنولوجيا الصناعة والطاقة — الطابق الأرضي — معمل الحاسب الآلي وتكنولوجيا المعلومات (شباك بصمة الوجه رقم 1)",
      })
      .returning();

    return apiSuccess(schedule, "تم حفظ الموعد في الجدول بنجاح", 201);
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح: هذه العملية خاصة بالسوبر أدمن فقط", 403);
    }
    return apiError(error.message || "فشل إضافة الموعد للجدول", 500);
  }
}

export async function PUT(req: NextRequest) {
  try {
    await requireRole([USER_ROLES.SUPER_ADMIN]);

    const body = await req.json();
    const { id, sectionId, date, startTime, endTime, subSection, notes } = body;

    if (!id || !sectionId || !date || !startTime || !endTime) {
      return apiError("يرجى ملء جميع حقول الموعد المطلوبة (المعرف، السكشن، التاريخ، وقت البدء والانتهاء)", 400);
    }

    const validSubSection = ["ALL", "A", "B"].includes(subSection) ? subSection : "ALL";

    const [updated] = await db
      .update(sectionSchedules)
      .set({
        sectionId,
        date,
        startTime,
        endTime,
        subSection: validSubSection,
        notes: notes || "مبنى كلية تكنولوجيا الصناعة والطاقة — الطابق الأرضي — معمل الحاسب الآلي وتكنولوجيا المعلومات (شباك بصمة الوجه رقم 1)",
      })
      .where(eq(sectionSchedules.id, id))
      .returning();

    if (!updated) {
      return apiError("الموعد المطلوب تعديله غير موجود", 404);
    }

    return apiSuccess(updated, "تم تحديث الموعد في الجدول بنجاح");
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح: هذه العملية خاصة بالسوبر أدمن فقط", 403);
    }
    return apiError(error.message || "فشل تحديث الموعد", 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireRole([USER_ROLES.SUPER_ADMIN]);

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (!id) {
      return apiError("معرف الموعد مطلوب", 400);
    }

    await db.delete(sectionSchedules).where(eq(sectionSchedules.id, id));

    return apiSuccess(null, "تم حذف الموعد من الجدول بنجاح");
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح: هذه العملية خاصة بالسوبر أدمن فقط", 403);
    }
    return apiError(error.message || "فشل حذف الموعد", 500);
  }
}
