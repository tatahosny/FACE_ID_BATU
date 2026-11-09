import { NextRequest } from "next/server";
import { FreeSlotsService } from "@/server/services/free-slots.service";
import { SettingsService } from "@/server/services/settings.service";
import { requireRole } from "@/lib/security/auth";
import { USER_ROLES } from "@/lib/constants/statuses";
import { apiError, apiSuccess } from "@/lib/utils/response";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole([USER_ROLES.SUPER_ADMIN]);
    const body = await req.json();

    if (body.portalDurationMinutes !== undefined) {
      const status = await SettingsService.setDelegatePortalDuration(
        Number(body.portalDurationMinutes),
        session.userId
      );
      return apiSuccess(
        { portalStatus: status },
        status.isOpen
          ? `تم فتح بوابة المناديب بنجاح لمدة (${status.remainingMinutes}) دقيقة`
          : "تم إغلاق بوابة المناديب فوراً"
      );
    }

    if (body.maxSlotsPerSection !== undefined) {
      const sanitized = await SettingsService.setMaxFreeSlotsPerSection(
        Number(body.maxSlotsPerSection),
        session.userId
      );
      if (!body.days && !body.dayName) {
        return apiSuccess(
          { maxSlotsPerSection: sanitized },
          `تم تحديد الحد الأقصى لفترات المناديب بـ (${sanitized}) فترات بنجاح`
        );
      }
    }

    if (Array.isArray(body.days)) {
      const updated = await FreeSlotsService.bulkUpdateDays(body.days);
      return apiSuccess({ days: updated }, "تم تحديث إعدادات أيام الحجز بنجاح");
    }

    const { dayName, isOpen } = body;
    if (!dayName || isOpen === undefined) {
      return apiError("اسم اليوم وحالة التفعيل مطلوبان", 400);
    }

    const updated = await FreeSlotsService.updateDayStatus(dayName, Boolean(isOpen));
    return apiSuccess({ day: updated }, `تم ${isOpen ? "تفعيل وفتح" : "إغلاق"} يوم ${dayName} بنجاح`);
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح: هذا الإجراء متاح للمشرف العام فقط", 403);
    }
    return apiError(error.message || "فشل تحديث إعدادات اليوم", 400);
  }
}

