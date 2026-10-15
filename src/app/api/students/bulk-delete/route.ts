import { NextRequest } from "next/server";
import { StudentService } from "@/server/services/student.service";
import { requireAuth } from "@/lib/security/auth";
import { USER_ROLES } from "@/lib/constants/statuses";
import { apiError, apiSuccess } from "@/lib/utils/response";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuth();

    if (session.role !== USER_ROLES.SUPER_ADMIN && session.role !== USER_ROLES.STAFF) {
      return apiError("غير مصرح: الحذف المجمّع متاح فقط للمشرفين ومسؤولي النظام", 403, "FORBIDDEN");
    }

    const body = await req.json();
    const { studentIds } = body as { studentIds: string[] };

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return apiError("يرجى تحديد طالب واحد على الأقل للحذف", 400);
    }

    const count = await StudentService.bulkDeleteStudents(studentIds, session.userId);

    return apiSuccess(
      { count },
      `تم حذف (${count}) طالب بنجاح وإلغاء تسجيلهم من دليل الطلاب.`
    );
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return apiError("يرجى تسجيل الدخول أولاً", 401, "UNAUTHORIZED");
    }
    return apiError(error.message || "فشل تنفيذ عملية الحذف المجمّع للطلاب", 500);
  }
}
