import { NextRequest } from "next/server";
import { AdminService } from "@/server/services/admin.service";
import { requireRole } from "@/lib/security/auth";
import { USER_ROLES } from "@/lib/constants/statuses";
import { apiError, apiSuccess } from "@/lib/utils/response";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireRole([USER_ROLES.SUPER_ADMIN, USER_ROLES.STAFF]);
    const stats = await AdminService.getDashboardStats();
    return apiSuccess({ stats });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح", 403);
    }
    return apiError(error.message || "فشل جلب إحصائيات النظام", 500);
  }
}
