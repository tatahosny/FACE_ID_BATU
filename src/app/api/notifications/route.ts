import { NextRequest } from "next/server";
import { db } from "@/db";
import { notificationOutbox, students } from "@/db/schema";
import { requireRole } from "@/lib/security/auth";
import { USER_ROLES } from "@/lib/constants/statuses";
import { apiError, apiSuccess } from "@/lib/utils/response";
import { desc, sql, eq, and, ilike, or } from "drizzle-orm";
import { NotificationService } from "@/server/services/notification.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireRole([USER_ROLES.SUPER_ADMIN]);

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "25", 10);
    const status = searchParams.get("status");
    const eventType = searchParams.get("eventType");
    const search = searchParams.get("search");
    const offset = (page - 1) * limit;

    const conditions: any[] = [];

    if (status && status !== "ALL") {
      conditions.push(eq(notificationOutbox.status, status));
    }

    if (eventType && eventType !== "ALL") {
      conditions.push(eq(notificationOutbox.eventType, eventType));
    }

    if (search) {
      conditions.push(
        or(
          ilike(students.fullName, `%${search}%`),
          ilike(students.academicNumber, `%${search}%`)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const items = await db
      .select({
        id: notificationOutbox.id,
        eventType: notificationOutbox.eventType,
        telegramChatId: notificationOutbox.telegramChatId,
        status: notificationOutbox.status,
        attempts: notificationOutbox.attempts,
        sentAt: notificationOutbox.sentAt,
        lastError: notificationOutbox.lastError,
        createdAt: notificationOutbox.createdAt,
        payload: notificationOutbox.payload,
        studentName: students.fullName,
        academicNumber: students.academicNumber,
      })
      .from(notificationOutbox)
      .leftJoin(students, eq(notificationOutbox.recipientId, students.id))
      .where(whereClause)
      .orderBy(desc(notificationOutbox.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(notificationOutbox)
      .leftJoin(students, eq(notificationOutbox.recipientId, students.id))
      .where(whereClause);

    // Fetch live summary stats
    const stats = await NotificationService.getOutboxStats();

    return apiSuccess({
      items,
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
      stats,
    });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح", 403);
    }
    return apiError(error.message || "فشل جلب سجلات الإشعارات", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireRole([USER_ROLES.SUPER_ADMIN]);

    const body = await req.json().catch(() => ({}));
    const action = body.action || "trigger";

    if (action === "retry-failed") {
      // Reset failed records back to PENDING
      await db
        .update(notificationOutbox)
        .set({
          status: "PENDING",
          attempts: 0,
          nextAttemptAt: new Date(),
          lastError: null,
        })
        .where(eq(notificationOutbox.status, "FAILED"));
    }

    // Trigger the background worker
    NotificationService.triggerBackgroundWorker();

    const stats = await NotificationService.getOutboxStats();

    return apiSuccess(
      { stats },
      action === "retry-failed"
        ? "تمت إعادة تعيين الرسائل المتعثرة وتشغيل معالج الإرسال التلقائي في الخلفية"
        : "تم تشغيل معالج الإرسال التلقائي في الخلفية بنجاح"
    );
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح", 403);
    }
    return apiError(error.message || "فشل تشغيل معالج الإشعارات", 500);
  }
}
