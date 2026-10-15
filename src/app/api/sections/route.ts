import { NextRequest } from "next/server";
import { AcademicService } from "@/server/services/academic.service";
import { requireRole } from "@/lib/security/auth";
import { USER_ROLES } from "@/lib/constants/statuses";
import { apiError, apiSuccess } from "@/lib/utils/response";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createSectionSchema = z.object({
  groupId: z.string().uuid("معرف المجموعة غير صالح"),
  name: z.string().trim().min(2, "اسم السكشن مطلوب").max(100),
  code: z.string().trim().min(2, "رمز السكشن مطلوب").max(50),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const groupId = searchParams.get("groupId");

    let sectionsList;
    if (groupId) {
      sectionsList = await AcademicService.getSectionsByGroup(groupId, true);
    } else {
      sectionsList = await AcademicService.getAllSections(true);
    }

    return apiSuccess({ sections: sectionsList });
  } catch (error: any) {
    return apiError(error.message || "فشل جلب السكاشن", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole([USER_ROLES.SUPER_ADMIN]);
    const body = await req.json();
    const parsed = createSectionSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.errors[0].message, 400);
    }

    const created = await AcademicService.createSection(
      parsed.data.groupId,
      parsed.data.name,
      parsed.data.code
    );
    return apiSuccess({ section: created }, "تم إنشاء السكشن بنجاح", 201);
  } catch (error: any) {
    if (error.message === "FORBIDDEN" || error.message === "UNAUTHORIZED") {
      return apiError("غير مصرح: هذه العملية متاحة لمدير النظام فقط", 403);
    }
    return apiError(error.message || "فشل إنشاء السكشن", 400);
  }
}
