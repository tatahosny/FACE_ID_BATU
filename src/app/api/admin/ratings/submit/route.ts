import { NextRequest } from "next/server";
import { db } from "@/db";
import { feedbackRatings, students } from "@/db/schema";
import { apiError, apiSuccess } from "@/lib/utils/response";
import { eq, and } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Public endpoint called by Telegram webhook handler to store a student's rating.
 * Only internal calls (from webhook handler) should use this.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { studentId, rating, message, type, requestCampaignId, telegramMessageId } = body;

    if (!studentId || !rating) {
      return apiError("بيانات التقييم ناقصة", 400);
    }

    const ratingNum = parseInt(rating, 10);
    if (isNaN(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return apiError("التقييم يجب أن يكون بين 1 و5", 400);
    }

    // Check student exists
    const [student] = await db
      .select({ id: students.id })
      .from(students)
      .where(eq(students.id, studentId));

    if (!student) {
      return apiError("الطالب غير موجود", 404);
    }

    const [newRating] = await db
      .insert(feedbackRatings)
      .values({
        studentId,
        rating: ratingNum,
        message: message?.trim() || null,
        type: type || "SERVICE",
        requestCampaignId: requestCampaignId || null,
        telegramMessageId: telegramMessageId || null,
      })
      .returning();

    return apiSuccess({ id: newRating.id }, "تم حفظ التقييم بنجاح");
  } catch (error: any) {
    return apiError(error.message || "فشل حفظ التقييم", 500);
  }
}
