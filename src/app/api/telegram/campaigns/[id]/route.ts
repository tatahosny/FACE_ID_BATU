import { NextRequest } from "next/server";
import { CampaignService } from "@/server/services/campaign.service";
import { requireRole } from "@/lib/security/auth";
import { USER_ROLES } from "@/lib/constants/statuses";
import { apiError, apiSuccess } from "@/lib/utils/response";
import { db } from "@/db";
import { telegramCampaigns } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireRole([USER_ROLES.SUPER_ADMIN]);
    const campaignId = params.id;

    const result = await CampaignService.processCampaignBatch(campaignId, 25);
    return apiSuccess(result, "تم معالجة دفعة من رسائل الحملة بنجاح");
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح", 403);
    }
    return apiError(error.message || "فشل معالجة دفعة الحملة", 500);
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireRole([USER_ROLES.SUPER_ADMIN]);
    const campaignId = params.id;

    const [campaign] = await db
      .select()
      .from(telegramCampaigns)
      .where(eq(telegramCampaigns.id, campaignId));

    if (!campaign) {
      return apiError("الحملة غير موجودة", 404);
    }

    return apiSuccess({ campaign });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح", 403);
    }
    return apiError(error.message || "فشل جلب تفاصيل الحملة", 500);
  }
}
