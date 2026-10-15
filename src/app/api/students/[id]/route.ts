import { NextRequest } from "next/server";
import { StudentService } from "@/server/services/student.service";
import { requireAuth } from "@/lib/security/auth";
import { USER_ROLES } from "@/lib/constants/statuses";
import { apiError, apiSuccess } from "@/lib/utils/response";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAuth();
    const studentId = params.id;

    // Security: Students can ONLY view their own profile. Admin and Staff can view any.
    if (
      session.role === USER_ROLES.STUDENT &&
      session.studentId !== studentId &&
      session.userId !== studentId
    ) {
      return apiError("غير مصرح لك بالوصول لبيانات طالب آخر", 403, "FORBIDDEN");
    }

    const student = await StudentService.getStudentById(studentId);
    if (!student) {
      return apiError("سجل الطالب غير موجود", 404, "NOT_FOUND");
    }

    return apiSuccess({ student });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return apiError("يرجى تسجيل الدخول أولاً", 401, "UNAUTHORIZED");
    }
    return apiError(error.message || "حدث خطأ أثناء جلب بيانات الطالب", 500);
  }
}
