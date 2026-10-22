import { NextRequest } from "next/server";
import { StudentService } from "@/server/services/student.service";
import { requireRole } from "@/lib/security/auth";
import { USER_ROLES } from "@/lib/constants/statuses";
import { apiError, apiSuccess } from "@/lib/utils/response";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole([USER_ROLES.SUPER_ADMIN, USER_ROLES.STAFF]);

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const defaultGroupId = (formData.get("groupId") as string) || undefined;
    const defaultSectionId = (formData.get("sectionId") as string) || undefined;

    if (!file) {
      return apiError("يرجى اختيار ملف الإكسيل لرفعه واستيراد البيانات", 400);
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await StudentService.importActivatedStudentsFromExcel({
      buffer,
      performedByUserId: session.userId,
      defaultGroupId,
      defaultSectionId,
    });

    return apiSuccess(
      result,
      `تمت المعالجة بنجاح! تم تسجيل وتفعيل ${result.insertedAndActivated} طالب جديد، وتفعيل ${result.activatedExisting} طالب مسبق، وتجاهل ${result.skippedAlreadyActivated} طالب مفعلين مسبقاً.`
    );
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح: استيراد كشوف الطلاب متاح للإدارة والمشرفين فقط", 403, "FORBIDDEN");
    }
    return apiError(error.message || "فشل استيراد واعتماد كشف الطلاب", 500);
  }
}
