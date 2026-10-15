import { NextRequest } from "next/server";
import { StudentService } from "@/server/services/student.service";
import { requireRole } from "@/lib/security/auth";
import { USER_ROLES } from "@/lib/constants/statuses";
import { apiError, apiSuccess } from "@/lib/utils/response";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    // Only Staff and Super Admin can list all students
    await requireRole([USER_ROLES.SUPER_ADMIN, USER_ROLES.STAFF]);

    const { searchParams } = new URL(req.url);
    const groupId = searchParams.get("groupId") || undefined;
    const sectionId = searchParams.get("sectionId") || undefined;
    const activationStatus = searchParams.get("activationStatus") || undefined;
    const search = searchParams.get("search") || undefined;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    const result = await StudentService.listStudents({
      groupId,
      sectionId,
      activationStatus,
      search,
      page,
      limit,
    });

    return apiSuccess(result);
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح لك بعرض هذه البيانات", 403, "FORBIDDEN");
    }
    return apiError(error.message || "فشل جلب قائمة الطلاب", 500);
  }
}
