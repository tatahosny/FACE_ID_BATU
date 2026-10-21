import { NextRequest } from "next/server";
import { FeedbackService } from "@/server/services/feedback.service";
import { requireRole } from "@/lib/security/auth";
import { USER_ROLES } from "@/lib/constants/statuses";
import { apiError, apiSuccess } from "@/lib/utils/response";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireRole([USER_ROLES.SUPER_ADMIN]);

    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get("campaignId") || undefined;
    const search = searchParams.get("search") || undefined;
    const filterStatus = searchParams.get("status") || undefined;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    const details = await FeedbackService.getDeliveryDetails({
      campaignId,
      search,
      filterStatus,
      page,
      limit,
    });

    return apiSuccess(details);
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح لك", 403);
    }
    return apiError(error.message || "فشل جلب تفاصيل المستلمين", 500);
  }
}
