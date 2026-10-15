import { NextRequest } from "next/server";
import { AcademicService } from "@/server/services/academic.service";
import { requireRole } from "@/lib/security/auth";
import { USER_ROLES } from "@/lib/constants/statuses";
import { apiError, apiSuccess } from "@/lib/utils/response";
import { z } from "zod";

export const dynamic = "force-dynamic";

const createGroupSchema = z.object({
  name: z.string().trim().min(2, "اسم المجموعة مطلوب").max(100),
  code: z.string().trim().min(2, "رمز المجموعة مطلوب").max(50),
});

export async function GET() {
  try {
    const groupsList = await AcademicService.getGroups(true);
    return apiSuccess({ groups: groupsList });
  } catch (error: any) {
    return apiError(error.message || "فشل جلب المجموعات", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole([USER_ROLES.SUPER_ADMIN]);
    const body = await req.json();
    const parsed = createGroupSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.errors[0].message, 400);
    }

    const created = await AcademicService.createGroup(parsed.data.name, parsed.data.code);
    return apiSuccess({ group: created }, "تم إنشاء المجموعة بنجاح", 201);
  } catch (error: any) {
    if (error.message === "FORBIDDEN" || error.message === "UNAUTHORIZED") {
      return apiError("غير مصرح: هذه العملية متاحة لمدير النظام فقط", 403);
    }
    return apiError(error.message || "فشل إنشاء المجموعة", 400);
  }
}
