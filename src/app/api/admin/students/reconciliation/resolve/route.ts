import { NextRequest } from "next/server";
import { StudentService } from "@/server/services/student.service";
import { requireRole } from "@/lib/security/auth";
import { USER_ROLES } from "@/lib/constants/statuses";
import { apiError, apiSuccess } from "@/lib/utils/response";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole([USER_ROLES.SUPER_ADMIN, USER_ROLES.STAFF]);

    const body = await req.json();
    const { type } = body;

    if (type === "activation_discrepancy") {
      const { studentId, action } = body;
      if (!studentId || !action) {
        return apiError("معرف الطالب والإجراء مطلوبان", 400);
      }
      const res = await StudentService.resolveActivationDiscrepancy({
        studentId,
        staffUserId: session.userId,
        action,
      });
      return apiSuccess(res, res.message);
    } else if (type === "provision_student") {
      const { fullName, academicNumber, nationalId, groupId, sectionId, academicYear, subSection, dbStudentId } = body;
      if (!fullName && !academicNumber && !dbStudentId) {
        return apiError("بيانات الطالب الأساسية مطلوبة (الاسم أو الرقم الأكاديمي)", 400);
      }
      const res = await StudentService.resolveSheetMissingStudent({
        staffUserId: session.userId,
        fullName: fullName || "",
        academicNumber: academicNumber || "",
        nationalId: nationalId || "",
        groupId,
        sectionId,
        academicYear,
        subSection,
        dbStudentId,
      });
      return apiSuccess(res, res.message);
    } else {
      return apiError("نوع الإجراء غير معروف", 400);
    }
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح", 403);
    }
    return apiError(error.message || "فشل تنفيذ العملية", 500);
  }
}

