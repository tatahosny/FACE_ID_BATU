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

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireAuth();

    // Only Super Admin and Staff can delete a student
    if (session.role !== USER_ROLES.SUPER_ADMIN && session.role !== USER_ROLES.STAFF) {
      return apiError("غير مصرح: حذف الطالب متاح فقط للمشرفين ومسؤولي النظام", 403, "FORBIDDEN");
    }

    const studentId = params.id;
    const deleted = await StudentService.deleteStudent(studentId, session.userId);

    return apiSuccess(
      { student: deleted },
      `تم حذف الطالب "${deleted.fullName}" بنجاح وإلغاء تسجيله من دليل الطلاب.`
    );
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return apiError("يرجى تسجيل الدخول أولاً", 401, "UNAUTHORIZED");
    }
    return apiError(error.message || "فشل حذف الطالب من دليل الطلاب", 500);
  }
}
