import { NextRequest } from "next/server";
import { FreeSlotsService } from "@/server/services/free-slots.service";
import { requireRole } from "@/lib/security/auth";
import { USER_ROLES } from "@/lib/constants/statuses";
import { apiError, apiSuccess } from "@/lib/utils/response";

export const dynamic = "force-dynamic";

export async function PUT(req: NextRequest) {
  try {
    await requireRole([USER_ROLES.SUPER_ADMIN]);
    const body = await req.json();
    const { slotId, dayName, periodIndex, groupId, sectionId, delegateName, notes } = body;

    if (!slotId) {
      return apiError("معرف الفترة مطلوب", 400);
    }

    const updated = await FreeSlotsService.adminModifySlot(slotId, {
      dayName,
      periodIndex: periodIndex ? Number(periodIndex) : undefined,
      groupId,
      sectionId,
      delegateName,
      notes,
    });

    return apiSuccess({ slot: updated }, "تم تعديل الفترة بنجاح بواسطة الإدارة");
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح: هذا الإجراء متاح للمشرف العام فقط", 403);
    }
    return apiError(error.message || "فشل تعديل الفترة", 400);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await requireRole([USER_ROLES.SUPER_ADMIN]);
    const { searchParams } = new URL(req.url);
    const slotId = searchParams.get("id");

    if (!slotId) {
      return apiError("معرف الفترة مطلوب", 400);
    }

    const result = await FreeSlotsService.cancelSlot(slotId, { isAdmin: true });
    return apiSuccess(result, "تم إلغاء حجز الفترة بواسطة الإدارة بنجاح");
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح: هذا الإجراء متاح للمشرف العام فقط", 403);
    }
    return apiError(error.message || "فشل إلغاء الفترة", 400);
  }
}

