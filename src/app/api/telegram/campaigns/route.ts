import { NextRequest } from "next/server";
import { CampaignService } from "@/server/services/campaign.service";
import { requireRole } from "@/lib/security/auth";
import { USER_ROLES } from "@/lib/constants/statuses";
import { createCampaignSchema } from "@/lib/validation/admin";
import { apiError, apiSuccess } from "@/lib/utils/response";
import { db } from "@/db";
import { telegramCampaigns, users } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireRole([USER_ROLES.SUPER_ADMIN]);

    const { searchParams } = new URL(req.url);
    const isPreview = searchParams.get("preview") === "true";

    if (isPreview) {
      const targetType = (searchParams.get("targetType") || "ALL") as any;
      const groupId = searchParams.get("groupId") || undefined;
      const sectionId = searchParams.get("sectionId") || undefined;

      const preview = await CampaignService.previewAudience({
        targetType,
        groupId,
        sectionId,
      });

      return apiSuccess({ preview });
    }

    const campaigns = await db
      .select({
        id: telegramCampaigns.id,
        title: telegramCampaigns.title,
        message: telegramCampaigns.message,
        targetType: telegramCampaigns.targetType,
        status: telegramCampaigns.status,
        totalRecipients: telegramCampaigns.totalRecipients,
        sentCount: telegramCampaigns.sentCount,
        failedCount: telegramCampaigns.failedCount,
        createdAt: telegramCampaigns.createdAt,
        creatorName: users.fullName,
      })
      .from(telegramCampaigns)
      .innerJoin(users, eq(telegramCampaigns.createdBy, users.id))
      .orderBy(desc(telegramCampaigns.createdAt))
      .limit(50);

    return apiSuccess({ campaigns });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح: إدارة الحملات متاحة فقط لمدير النظام", 403);
    }
    return apiError(error.message || "فشل جلب بيانات الحملات", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole([USER_ROLES.SUPER_ADMIN]);

    const body = await req.json();
    const parsed = createCampaignSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.errors[0].message, 400);
    }

    const campaign = await CampaignService.createCampaign({
      title: parsed.data.title,
      message: parsed.data.message,
      targetType: parsed.data.targetType,
      targetFilters: parsed.data.targetFilters,
      createdBy: session.userId,
    });

    return apiSuccess({ campaign }, "تم إنشاء الحملة بنجاح وجدولتها في قائمة الإرسال", 201);
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح", 403);
    }
    return apiError(error.message || "فشل إنشاء الحملة", 400);
  }
}
