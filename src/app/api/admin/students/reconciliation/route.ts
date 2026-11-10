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
    const targetDate = formData.get("targetDate") as string | null; // "YYYY-MM-DD" or null

    if (!file) {
      return apiError("يرجى اختيار ملف الإكسيل للمطابقة والتدقيق", 400);
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await StudentService.reconcileExcelActivations({
      buffer,
      staffUserId: session.userId,
      targetDate: targetDate || undefined,
    });

    return apiSuccess(
      result,
      `تمت مطابقة الكشف بنجاح! تم فحص ${result.summary.totalSheetRows} طالب في الشيت مقارنة بـ ${result.summary.totalDbActivatedByUser} طالب مفعلين بواسطة حسابك (${result.staffAccount.fullName}).`
    );
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح: هذه العملية مخصصة لمسؤولي وموظفي المنظومة فقط", 403);
    }
    return apiError(error.message || "فشل تحليل ومطابقة ملف الإكسيل", 500);
  }
}

