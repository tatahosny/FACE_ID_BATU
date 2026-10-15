import { NextRequest } from "next/server";
import { BookingService } from "@/server/services/booking.service";
import { StaffService } from "@/server/services/staff.service";
import { NotificationService } from "@/server/services/notification.service";
import { requireRole } from "@/lib/security/auth";
import { USER_ROLES } from "@/lib/constants/statuses";
import { apiError, apiSuccess } from "@/lib/utils/response";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireRole([USER_ROLES.SUPER_ADMIN, USER_ROLES.STAFF]);

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || undefined;
    const sectionId = searchParams.get("sectionId") || undefined;
    const search = searchParams.get("search") || undefined;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const result = await BookingService.getDetailedQueueList({
      status,
      sectionId,
      search,
      page,
      limit,
    });

    return apiSuccess(result);
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح لك بعرض بيانات الطابور", 403);
    }
    return apiError(error.message || "فشل جلب تفاصيل الطابور", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole([USER_ROLES.SUPER_ADMIN, USER_ROLES.STAFF]);

    const body = await req.json();
    const { action, bookingId, studentId, notes } = body;

    if (!action) {
      return apiError("الإجراء المطلوب غير محدد", 400);
    }

    switch (action) {
      case "repeat-alert": {
        if (!bookingId) return apiError("معرف الحجز مطلوب", 400);
        const res = await BookingService.repeatAlert(bookingId);
        return apiSuccess(res, "تم إرسال نداء فوري مكرر للطالب على التيليجرام بنجاح");
      }

      case "push-back": {
        if (!bookingId) return apiError("معرف الحجز مطلوب", 400);
        const res = await BookingService.pushBackTenPositions(bookingId);
        NotificationService.checkAndQueueProximityNotifications().catch(console.error);
        return apiSuccess(
          res,
          `تم تأخير دور الطالب بمقدار 10 أدوار للخلف (رقمه الجديد: #${res.formattedQueueNumber}) وإشعاره على التيليجرام.`
        );
      }

      case "cancel": {
        if (!bookingId) return apiError("معرف الحجز مطلوب", 400);
        const res = await BookingService.cancelNoShowBooking(bookingId, session.userId);
        NotificationService.checkAndQueueProximityNotifications().catch(console.error);
        return apiSuccess(res, "تم إلغاء دور الطالب لعدم الحضور وإرسال إشعار الإلغاء على التيليجرام.");
      }

      case "activate": {
        if (!studentId) return apiError("معرف الطالب مطلوب", 400);
        const res = await StaffService.recordActivation({
          studentId,
          bookingId: bookingId || undefined,
          staffUserId: session.userId,
          notes: notes || "تم التفعيل من شاشة إدارة الأدوار",
        });
        NotificationService.checkAndQueueProximityNotifications().catch(console.error);
        return apiSuccess(
          res,
          res.telegramSent
            ? "تم تفعيل بصمة الوجه للطالب بنجاح وإرسال رسالة التهنئة والاعتماد على التيليجرام! ✅"
            : "تم تفعيل بصمة الوجه للطالب بنجاح!"
        );
      }

      default:
        return apiError("إجراء غير مدعوم", 400);
    }
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح لك بتنفيذ هذا الإجراء", 403);
    }
    return apiError(error.message || "فشل تنفيذ الإجراء على الدور", 500);
  }
}
