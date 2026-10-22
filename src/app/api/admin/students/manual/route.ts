import { NextRequest } from "next/server";
import { StudentService } from "@/server/services/student.service";
import { requireRole } from "@/lib/security/auth";
import { USER_ROLES } from "@/lib/constants/statuses";
import { apiError, apiSuccess } from "@/lib/utils/response";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole([USER_ROLES.SUPER_ADMIN]);

    const body = await req.json();
    const {
      fullName,
      nationalId,
      academicNumber,
      groupId,
      sectionId,
      subSection,
      isFingerprintActivated,
      overwrite,
    } = body;

    if (!fullName || !nationalId || !academicNumber || !groupId || !sectionId) {
      return apiError("جميع الحقول الأساسية مطلوبة (الاسم، الرقم القومي، الرقم الأكاديمي، المجموعة، السكشن)", 400);
    }

    const result = await StudentService.manualUpsertStudent({
      fullName,
      nationalId,
      academicNumber,
      groupId,
      sectionId,
      subSection: subSection || "A",
      isFingerprintActivated: Boolean(isFingerprintActivated),
      overwrite: Boolean(overwrite),
      performedByUserId: session.userId,
    });

    if (result.conflict) {
      return apiSuccess(result, "تنبيه: الطالب مسجل بالفعل مسبقاً في المنظومة");
    }

    return apiSuccess(result, result.message);
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح لك بتنفيذ هذا الإجراء", 403);
    }
    return apiError(error.message || "فشل تسجيل أو تحديث بيانات الطالب", 400);
  }
}
