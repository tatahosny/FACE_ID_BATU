import { NextRequest } from "next/server";
import { StaffService } from "@/server/services/staff.service";
import { NotificationService } from "@/server/services/notification.service";
import { requireRole } from "@/lib/security/auth";
import { USER_ROLES } from "@/lib/constants/statuses";
import { apiError, apiSuccess } from "@/lib/utils/response";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole([USER_ROLES.SUPER_ADMIN, USER_ROLES.STAFF]);

    const body = await req.json();
    const { studentId, notes } = body;

    if (!studentId) {
      return apiError("معرف الطالب مطلوب", 400);
    }

    const result = await StaffService.recordActivation({
      studentId,
      staffUserId: session.userId,
      notes: notes || "تم التفعيل والاعتماد من دليل الطلاب",
    });

    // Check proximity notifications for others in queue if an active booking was completed
    NotificationService.checkAndQueueProximityNotifications().catch(console.error);

    return apiSuccess(
      result,
      result.telegramSent
        ? "تم تفعيل بصمة الطالب بنجاح وإرسال إشعار التهنئة والاعتماد على التيليجرام!"
        : "تم تفعيل بصمة الطالب واعتمادها بنجاح في المنظومة!"
    );
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح لك بتنفيذ هذا الإجراء", 403);
    }
    return apiError(error.message || "فشل تفعيل البصمة", 500);
  }
}
