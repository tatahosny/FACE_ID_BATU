import { NextRequest } from "next/server";
import { FreeSlotsService } from "@/server/services/free-slots.service";
import { SettingsService } from "@/server/services/settings.service";
import { FREE_SLOT_PERIODS } from "@/lib/constants/academic";
import { apiError, apiSuccess } from "@/lib/utils/response";
import { getSessionUser } from "@/lib/security/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const academicYear = searchParams.get("academicYear") || "الفرقة الثالثة";
    const specialization = searchParams.get("specialization") || undefined;

    const [days, slots, maxSlotsPerSection, portalStatus] = await Promise.all([
      FreeSlotsService.getDaysSettings(academicYear),
      FreeSlotsService.getBookedSlots(academicYear, specialization),
      SettingsService.getMaxFreeSlotsPerSection(),
      SettingsService.getDelegatePortalStatus(),
    ]);

    return apiSuccess({
      days,
      slots,
      periods: FREE_SLOT_PERIODS,
      maxSlotsPerSection,
      portalStatus,
    });
  } catch (error: any) {
    return apiError(error.message || "فشل جلب بيانات فترات الفراغ", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSessionUser();
    const isSuperAdmin = session?.role === "SUPER_ADMIN";

    // Validate that delegate portal is open (unless Super Admin override)
    if (!isSuperAdmin) {
      const portalStatus = await SettingsService.getDelegatePortalStatus();
      if (!portalStatus.isOpen) {
        return apiError("بوابة تسجيل فترات فراغ السكاشن مغلقة حالياً من قبل الإدارة.", 403);
      }
    }

    const body = await req.json();

    const {
      academicYear,
      specialization,
      groupId,
      sectionId,
      delegateStudentId,
      delegateName,
      dayName,
      periodIndex,
      notes,
    } = body;

    if (!specialization || !groupId || !sectionId || !dayName || !periodIndex) {
      return apiError("جميع البيانات الأساسية مطلوبة (الشعبة، المجموعة، السكشن، اليوم، رقم الفترة)", 400);
    }

    const finalDelegateName =
      delegateName ||
      session?.fullName ||
      "مندوب السكشن";

    const finalStudentId =
      delegateStudentId ||
      session?.studentId ||
      session?.userId;

    const booked = await FreeSlotsService.bookSlot({
      academicYear: academicYear || "الفرقة الثالثة",
      specialization,
      groupId,
      sectionId,
      delegateStudentId: finalStudentId,
      delegateName: finalDelegateName,
      dayName,
      periodIndex: Number(periodIndex),
      notes,
      isAdminOverride: session?.role === "SUPER_ADMIN",
    });

    return apiSuccess(
      { slot: booked },
      `تم حجز ${booked.periodName} يوم (${booked.dayName}) بنجاح لسكشنك!`,
      201
    );
  } catch (error: any) {
    return apiError(error.message || "فشل حجز الفترة", 400);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getSessionUser();
    const { searchParams } = new URL(req.url);
    const slotId = searchParams.get("id");

    if (!slotId) {
      return apiError("معرف الفترة مطلوب للحذف", 400);
    }

    const isAdmin = session?.role === "SUPER_ADMIN";
    if (!isAdmin) {
      const portalStatus = await SettingsService.getDelegatePortalStatus();
      if (!portalStatus.isOpen) {
        return apiError("بوابة تسجيل فترات فراغ السكاشن مغلقة حالياً من قبل الإدارة.", 403);
      }
    }

    const result = await FreeSlotsService.cancelSlot(slotId, {
      sectionId: session?.sectionId,
      studentId: session?.studentId,
      isAdmin,
    });

    return apiSuccess(result, "تم إلغاء حجز الفترة بنجاح وإتاحتها للجميع");
  } catch (error: any) {
    return apiError(error.message || "فشل إلغاء حجز الفترة", 400);
  }
}

