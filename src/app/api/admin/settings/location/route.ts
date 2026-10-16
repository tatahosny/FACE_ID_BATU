import { NextRequest } from "next/server";
import { SettingsService } from "@/server/services/settings.service";
import { requireRole } from "@/lib/security/auth";
import { USER_ROLES } from "@/lib/constants/statuses";
import { apiError, apiSuccess } from "@/lib/utils/response";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole([USER_ROLES.SUPER_ADMIN]);
    const location = await SettingsService.getActivationLocation();
    return apiSuccess({ location });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح", 403);
    }
    return apiError(error.message || "فشل جلب المقر المعتمد", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole([USER_ROLES.SUPER_ADMIN]);
    const body = await req.json();
    const { location } = body;

    if (!location || typeof location !== "string" || !location.trim()) {
      return apiError("يرجى إدخال اسم ومقر لجنة البصمة بشكل صحيح", 400);
    }

    const updatedLocation = await SettingsService.setActivationLocation(
      location,
      session.userId
    );

    // Audit log entry
    await db.insert(auditLogs).values({
      actorId: session.userId,
      action: "UPDATE_ACTIVATION_LOCATION",
      entityType: "SETTING",
      entityId: "activation_location",
      safeMetadata: {
        newLocation: updatedLocation,
        updatedBy: session.email || session.userId,
      },
    });

    return apiSuccess(
      { location: updatedLocation },
      "تم تحديث المقر المعتمد للبصمة بنجاح، وسيتم إدراجه فوراً في رسائل التيليجرام المرسلة للطلاب!"
    );
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح: تحديث مقر البصمة متاح فقط للمشرف العام (Super Admin)", 403);
    }
    return apiError(error.message || "فشل تحديث المقر", 500);
  }
}
