import { NextRequest } from "next/server";
import { CampaignService } from "@/server/services/campaign.service";
import { requireRole } from "@/lib/security/auth";
import { USER_ROLES } from "@/lib/constants/statuses";
import { createTemplateSchema } from "@/lib/validation/admin";
import { apiError, apiSuccess } from "@/lib/utils/response";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const templates = await CampaignService.getTemplates();
    return apiSuccess({ templates });
  } catch (error: any) {
    return apiError(error.message || "فشل جلب القوالب", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole([USER_ROLES.SUPER_ADMIN]);
    const body = await req.json();
    const parsed = createTemplateSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.errors[0].message, 400);
    }

    const template = await CampaignService.createTemplate(
      parsed.data.name,
      parsed.data.content,
      session.userId
    );

    return apiSuccess({ template }, "تم إنشاء القالب بنجاح", 201);
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح: إدارة القوالب متاحة لمدير النظام فقط", 403);
    }
    return apiError(error.message || "فشل إنشاء القالب", 400);
  }
}
