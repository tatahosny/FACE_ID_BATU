import { NextRequest } from "next/server";
import { db } from "@/db";
import { feedbackRatings, students } from "@/db/schema";
import { requireRole } from "@/lib/security/auth";
import { USER_ROLES } from "@/lib/constants/statuses";
import { apiError, apiSuccess } from "@/lib/utils/response";
import { eq, and, sql, inArray } from "drizzle-orm";
import { TelegramService } from "@/server/services/telegram.service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await requireRole([USER_ROLES.SUPER_ADMIN]);

    const body = await req.json();
    const {
      target = "UNREASONED", // 'UNREASONED' | 'ALL_LOW' | 'SINGLE'
      ratingId,
      customMessage,
    } = body;

    // 1. Build selection criteria
    let targetRatingsQuery = db
      .select({
        id: feedbackRatings.id,
        rating: feedbackRatings.rating,
        message: feedbackRatings.message,
        studentId: feedbackRatings.studentId,
        studentFullName: students.fullName,
        studentAcademicNumber: students.academicNumber,
        telegramUserId: students.telegramUserId,
      })
      .from(feedbackRatings)
      .innerJoin(students, eq(feedbackRatings.studentId, students.id));

    let rows: Array<{
      id: string;
      rating: number;
      message: string | null;
      studentId: string;
      studentFullName: string;
      studentAcademicNumber: string;
      telegramUserId: number | null;
    }> = [];

    if (target === "SINGLE") {
      if (!ratingId) {
        return apiError("معرف التقييم مطلوب عند الاستهداف الفردي", 400);
      }
      rows = await targetRatingsQuery.where(eq(feedbackRatings.id, ratingId));
    } else if (target === "ALL_LOW") {
      rows = await targetRatingsQuery.where(sql`${feedbackRatings.rating} <= 2`);
    } else {
      // Default: UNREASONED (ratings <= 2 where message is null or empty)
      rows = await targetRatingsQuery.where(
        and(
          sql`${feedbackRatings.rating} <= 2`,
          sql`(${feedbackRatings.message} IS NULL OR TRIM(${feedbackRatings.message}) = '')`
        )
      );
    }

    if (rows.length === 0) {
      return apiSuccess(
        { totalTargeted: 0, sentCount: 0, failedCount: 0, skippedNoTelegram: 0 },
        "لا يوجد طلاب ينطبق عليهم هذا المعيار حالياً"
      );
    }

    let sentCount = 0;
    let failedCount = 0;
    let skippedNoTelegram = 0;
    const ratingIdsToUpdate: string[] = [];

    // 2. Send Telegram messages
    for (const r of rows) {
      if (!r.telegramUserId) {
        skippedNoTelegram++;
        continue;
      }

      const stars = "⭐".repeat(r.rating);
      let text = customMessage?.trim();

      if (!text) {
        text = `<b>[جامعة برج العرب التكنولوجية - BATU]</b>
قسم تكنولوجيا المعلومات — نظام بصمة الوجه

⚠️ <b>تنبيه بخصوص تقييمك لمنظومة البصمة</b>

عزيزي الطالب: <b>${r.studentFullName}</b>
تم تسجيل تقييمك للمنظومة بدرجة: ${stars} (${r.rating} من 5).

نحرص دائماً على أعلى معايير الجودة والاستماع لجميع الطلاب، لذا:
⚠️ <b>يجب كتابة شكوى أو سبب واضح لهذا التقييم في رد على هذه الرسالة الآن.</b>

🚨 <b>تنبيه هام جداً:</b>
في حال عدم تقديم سبب للتقييم أو كتابة شكوى توضح المشكلة، <b>سيتم إلغاء تقييمك تلقائياً من المنظومة</b>.`;
      } else {
        // Substitute basic placeholders if provided in custom message
        text = text
          .replace("{name}", r.studentFullName)
          .replace("{rating}", String(r.rating))
          .replace("{stars}", stars);
      }

      try {
        const sent = await TelegramService.sendMessage(r.telegramUserId, text, "HTML", {
          force_reply: true,
          selective: true,
        });

        if (sent) {
          sentCount++;
          ratingIdsToUpdate.push(r.id);
          TelegramService.pendingLowRatingRequests.set(r.telegramUserId, {
            ratingId: r.id,
            timestamp: Date.now(),
          });
        } else {
          failedCount++;
        }
      } catch (err) {
        console.error(`Failed to send reason request to student ${r.studentFullName}:`, err);
        failedCount++;
      }
    }

    // 3. Mark ratings with reasonRequestedAt timestamp
    if (ratingIdsToUpdate.length > 0) {
      await db
        .update(feedbackRatings)
        .set({ reasonRequestedAt: new Date() })
        .where(inArray(feedbackRatings.id, ratingIdsToUpdate));
    }

    return apiSuccess(
      {
        totalTargeted: rows.length,
        sentCount,
        failedCount,
        skippedNoTelegram,
      },
      `تم إرسال طلب توضيح السبب لـ ${sentCount} طالب بنجاح! ${
        failedCount > 0 ? `(فشل: ${failedCount})` : ""
      }${skippedNoTelegram > 0 ? `(بدون تيليجرام: ${skippedNoTelegram})` : ""}`
    );
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح لك", 403);
    }
    console.error("Error in request-reason:", error);
    return apiError(error.message || "فشل إرسال طلبات توضيح التقييم", 500);
  }
}
