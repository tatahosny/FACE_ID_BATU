import { NextRequest } from "next/server";
import { StaffService } from "@/server/services/staff.service";
import { requireRole } from "@/lib/security/auth";
import { USER_ROLES } from "@/lib/constants/statuses";
import { recordActivationSchema } from "@/lib/validation/booking";
import { apiError, apiSuccess } from "@/lib/utils/response";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole([USER_ROLES.SUPER_ADMIN, USER_ROLES.STAFF]);

    const body = await req.json();
    const parsed = recordActivationSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.errors[0].message, 400);
    }

    const result = await StaffService.recordActivation({
      studentId: parsed.data.studentId,
      bookingId: parsed.data.bookingId,
      staffUserId: session.userId,
      notes: parsed.data.notes,
    });

    const msg = result.notificationQueued
      ? "تم تسجيل تفعيل بصمة الوجه بنجاح وتم إرسال إشعار التأكيد للطالب عبر التيليجرام."
      : "تم تسجيل تفعيل بصمة الوجه بنجاح في قاعدة البيانات.";

    return apiSuccess(result, msg, 201);
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح: تسجيل البصمة متاح فقط لموظفي البصمة المعتمدين", 403);
    }
    return apiError(error.message || "فشل تسجيل تفعيل البصمة", 400);
  }
}

export async function GET(req: NextRequest) {
  try {
    await requireRole([USER_ROLES.SUPER_ADMIN, USER_ROLES.STAFF]);

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);

    const result = await StaffService.listActivations(page, limit);
    return apiSuccess(result);
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح", 403);
    }
    return apiError(error.message || "فشل جلب سجلات التفعيل", 500);
  }
}
