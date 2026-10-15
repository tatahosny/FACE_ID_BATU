import { NextRequest } from "next/server";
import { db } from "@/db";
import { sectionSchedules, sections, groups } from "@/db/schema";
import { eq, asc, desc } from "drizzle-orm";
import { requireRole } from "@/lib/security/auth";
import { USER_ROLES } from "@/lib/constants/statuses";
import { apiError, apiSuccess } from "@/lib/utils/response";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const list = await db
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
        notes: sectionSchedules.notes,
        createdAt: sectionSchedules.createdAt,
      })
      .from(sectionSchedules)
      .innerJoin(sections, eq(sectionSchedules.sectionId, sections.id))
      .innerJoin(groups, eq(sections.groupId, groups.id))
      .orderBy(asc(sectionSchedules.date), asc(sectionSchedules.startTime));

    return apiSuccess({ schedules: list });
  } catch (error: any) {
    return apiError(error.message || "فشل جلب جدول المواعيد", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole([USER_ROLES.SUPER_ADMIN]);

    const body = await req.json();
    const { sectionId, date, startTime, endTime, notes } = body;

    if (!sectionId || !date || !startTime || !endTime) {
      return apiError("يرجى ملء جميع حقول الموعد المطلوبة (السكشن، التاريخ، وقت البدء والانتهاء)", 400);
    }

    const [schedule] = await db
      .insert(sectionSchedules)
      .values({
        sectionId,
        date,
        startTime,
        endTime,
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
