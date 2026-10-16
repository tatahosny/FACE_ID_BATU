import { NextRequest } from "next/server";
import { StaffService } from "@/server/services/staff.service";
import { requireRole } from "@/lib/security/auth";
import { USER_ROLES } from "@/lib/constants/statuses";
import { apiError, apiSuccess } from "@/lib/utils/response";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole([USER_ROLES.SUPER_ADMIN]);

    const body = await req.json();
    const { studentId, reason } = body;

    if (!studentId) {
      return apiError("معرف الطالب مطلوب", 400);
    }

    const result = await StaffService.revokeActivation({
      studentId,
      staffUserId: session.userId,
      reason: reason || "تم إلغاء البصمة وإعادة إتاحة الحجز بواسطة المشرف",
    });

    return apiSuccess(
      result,
      "تم إلغاء اعتماد البصمة وإلغاء الدور بنجاح، ويمكن للطالب الآن حجز دور جديد كأنه لم يقم بالحجز."
    );
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح لك بتنفيذ هذا الإجراء", 403);
    }
    return apiError(error.message || "فشل إلغاء البصمة", 500);
  }
}
