import { NextRequest } from "next/server";
import { NotificationService } from "@/server/services/notification.service";
import { getSessionUser } from "@/lib/security/auth";
import { USER_ROLES } from "@/lib/constants/statuses";
import { apiError, apiSuccess } from "@/lib/utils/response";

export async function POST(req: NextRequest) {
  try {
    // Check Authorization: Bearer <CRON_SECRET> or Admin session
    const authHeader = req.headers.get("authorization");
    const configuredSecret = process.env.CRON_SECRET || "batu_cron_secret_worker_auth_key_2026";
    let isAuthorized = false;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      if (token === configuredSecret) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      const user = await getSessionUser();
      if (user && user.role === USER_ROLES.SUPER_ADMIN) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return apiError("غير مصرح: مفتاح معالجة الإشعارات غير صالح", 401, "UNAUTHORIZED");
    }

    // 1. Scan active queues for students who have reached 10 or 5 turns remaining
    const proximityScan = await NotificationService.checkAndQueueProximityNotifications();

    // 2. Process batch of pending outbox messages
    const outboxBatch = await NotificationService.processOutboxBatch(50);

    return apiSuccess({
      proximityScan,
      outboxBatch,
      timestamp: new Date().toISOString(),
    }, "تمت معالجة طابور الإشعارات بنجاح");
  } catch (error: any) {
    return apiError(error.message || "حدث خطأ أثناء معالجة الإشعارات", 500);
  }
}
