import { NextRequest } from "next/server";
import { db } from "@/db";
import { notificationOutbox, students } from "@/db/schema";
import { requireRole } from "@/lib/security/auth";
import { USER_ROLES } from "@/lib/constants/statuses";
import { apiError, apiSuccess } from "@/lib/utils/response";
import { desc, sql, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireRole([USER_ROLES.SUPER_ADMIN]);

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "25", 10);
    const offset = (page - 1) * limit;

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
        studentName: students.fullName,
        academicNumber: students.academicNumber,
      })
      .from(notificationOutbox)
      .leftJoin(students, eq(notificationOutbox.recipientId, students.id))
      .orderBy(desc(notificationOutbox.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(notificationOutbox);

    return apiSuccess({
      items,
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
    });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح", 403);
    }
    return apiError(error.message || "فشل جلب سجلات الإشعارات", 500);
  }
}
