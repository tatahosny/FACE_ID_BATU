import { NextRequest } from "next/server";
import { StaffService } from "@/server/services/staff.service";
import { requireRole } from "@/lib/security/auth";
import { USER_ROLES } from "@/lib/constants/statuses";
import { apiError, apiSuccess } from "@/lib/utils/response";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireRole([USER_ROLES.SUPER_ADMIN, USER_ROLES.STAFF]);

    const { searchParams } = new URL(req.url);
    const academicNumber = searchParams.get("academicNumber");

    if (!academicNumber) {
      return apiError("يرجى إدخال الرقم الأكاديمي للبحث", 400);
    }

    const result = await StaffService.searchStudent(academicNumber);
    if (!result) {
      return apiError("لم يتم العثور على طالب بهذا الرقم الأكاديمي", 404);
    }

    return apiSuccess(result);
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح لك بالوصول لبيانات الطلاب", 403);
    }
    return apiError(error.message || "حدث خطأ أثناء البحث عن الطالب", 500);
  }
}
