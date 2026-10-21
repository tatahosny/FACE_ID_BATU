import { NextRequest } from "next/server";
import { db } from "@/db";
import {
  feedbackRatings,
  feedbackCampaigns,
  students,
  sections,
  groups,
  users,
} from "@/db/schema";
import { requireRole } from "@/lib/security/auth";
import { USER_ROLES } from "@/lib/constants/statuses";
import { apiError, apiSuccess } from "@/lib/utils/response";
import { eq, desc, sql, and, isNotNull } from "drizzle-orm";
import { TelegramService } from "@/server/services/telegram.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireRole([USER_ROLES.SUPER_ADMIN]);

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = (page - 1) * limit;
    const campaignId = searchParams.get("campaignId") || undefined;

    // Total count & filter
    const whereClause = campaignId ? eq(feedbackRatings.requestCampaignId, campaignId) : undefined;

    const [totalRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(feedbackRatings)
      .where(whereClause);

    // Ratings with student info (name + academic number for admin, hidden in Telegram)
    const ratings = await db
      .select({
        id: feedbackRatings.id,
        rating: feedbackRatings.rating,
        message: feedbackRatings.message,
        type: feedbackRatings.type,
        createdAt: feedbackRatings.createdAt,
        requestCampaignId: feedbackRatings.requestCampaignId,
        studentId: feedbackRatings.studentId,
        studentFullName: students.fullName,
        studentAcademicNumber: students.academicNumber,
        sectionName: sections.name,
        groupName: groups.name,
      })
      .from(feedbackRatings)
      .innerJoin(students, eq(feedbackRatings.studentId, students.id))
      .innerJoin(sections, eq(students.sectionId, sections.id))
      .innerJoin(groups, eq(students.groupId, groups.id))
      .where(whereClause)
      .orderBy(desc(feedbackRatings.createdAt))
      .limit(limit)
      .offset(offset);

    // Summary stats
    const [stats] = await db
      .select({
        totalRatings: sql<number>`count(*)::int`,
        averageRating: sql<number>`round(avg(${feedbackRatings.rating})::numeric, 2)`,
        fiveStars: sql<number>`count(*) filter (where ${feedbackRatings.rating} = 5)::int`,
        fourStars: sql<number>`count(*) filter (where ${feedbackRatings.rating} = 4)::int`,
        threeStars: sql<number>`count(*) filter (where ${feedbackRatings.rating} = 3)::int`,
        twoStars: sql<number>`count(*) filter (where ${feedbackRatings.rating} = 2)::int`,
        oneStar: sql<number>`count(*) filter (where ${feedbackRatings.rating} = 1)::int`,
        issueCount: sql<number>`count(*) filter (where ${feedbackRatings.type} = 'ISSUE')::int`,
        serviceCount: sql<number>`count(*) filter (where ${feedbackRatings.type} = 'SERVICE')::int`,
      })
      .from(feedbackRatings);

    // Recent campaigns
    const campaigns = await db
      .select({
        id: feedbackCampaigns.id,
        title: feedbackCampaigns.title,
        targetType: feedbackCampaigns.targetType,
        status: feedbackCampaigns.status,
        sentCount: feedbackCampaigns.sentCount,
        failedCount: feedbackCampaigns.failedCount,
        createdAt: feedbackCampaigns.createdAt,
        sentAt: feedbackCampaigns.sentAt,
        creatorName: users.fullName,
      })
      .from(feedbackCampaigns)
      .innerJoin(users, eq(feedbackCampaigns.createdBy, users.id))
      .orderBy(desc(feedbackCampaigns.createdAt))
      .limit(20);

    return apiSuccess({
      ratings,
      stats,
      campaigns,
      pagination: {
        total: totalRow?.count || 0,
        page,
        limit,
        totalPages: Math.ceil((totalRow?.count || 0) / limit),
      },
    });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح لك", 403);
    }
    return apiError(error.message || "فشل جلب التقييمات", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole([USER_ROLES.SUPER_ADMIN]);

    const body = await req.json();

    // 1. Process Batch action (for Auto-Send Loop)
    if (body.action === "process-batch") {
      const { campaignId, batchOffset = 0, batchSize = 25 } = body;
      if (!campaignId) {
        return apiError("معرف الحملة مطلوب", 400);
      }

      const [campaign] = await db
        .select()
        .from(feedbackCampaigns)
        .where(eq(feedbackCampaigns.id, campaignId));

      if (!campaign) {
        return apiError("الحملة غير موجودة", 404);
      }

      const [{ totalEligible }] = await db
        .select({ totalEligible: sql<number>`cast(count(*) as integer)` })
        .from(students)
        .where(and(isNotNull(students.telegramUserId), eq(students.isActive, true)));

      const batchStudents = await db
        .select({
          telegramUserId: students.telegramUserId,
          fullName: students.fullName,
        })
        .from(students)
        .where(and(isNotNull(students.telegramUserId), eq(students.isActive, true)))
        .orderBy(students.academicNumber)
        .limit(batchSize)
        .offset(batchOffset);

      const ratingMessage = buildRatingRequestMessage();
      const inlineKeyboard = buildRatingInlineKeyboard(campaign.id);

      let sent = 0;
      let failed = 0;

      for (const student of batchStudents) {
        if (!student.telegramUserId) continue;
        try {
          await TelegramService.sendMessage(student.telegramUserId, ratingMessage, "HTML", inlineKeyboard);
          sent++;
          // Safe 40ms delay to respect Telegram's rate limit
          await new Promise((r) => setTimeout(r, 40));
        } catch {
          failed++;
        }
      }

      const [updatedCampaign] = await db
        .update(feedbackCampaigns)
        .set({
          sentCount: sql`${feedbackCampaigns.sentCount} + ${sent}`,
          failedCount: sql`${feedbackCampaigns.failedCount} + ${failed}`,
        })
        .where(eq(feedbackCampaigns.id, campaignId))
        .returning();

      const nextOffset = batchOffset + batchStudents.length;
      const isCompleted = nextOffset >= totalEligible || batchStudents.length === 0;

      if (isCompleted) {
        await db
          .update(feedbackCampaigns)
          .set({
            status: "SENT",
            sentAt: new Date(),
          })
          .where(eq(feedbackCampaigns.id, campaignId));
      }

      return apiSuccess({
        completed: isCompleted,
        sentInBatch: sent,
        failedInBatch: failed,
        totalSent: updatedCampaign.sentCount,
        totalFailed: updatedCampaign.failedCount,
        totalRecipients: totalEligible,
        nextOffset,
      });
    }

    // 2. Create new Campaign
    const { title, targetType, targetStudentId } = body;

    if (!title?.trim()) {
      return apiError("عنوان الحملة مطلوب", 400);
    }

    if (!targetType || !["ALL", "STUDENT"].includes(targetType)) {
      return apiError("نوع الهدف غير صالح", 400);
    }

    if (targetType === "STUDENT" && !targetStudentId) {
      return apiError("معرف الطالب مطلوب عند الاستهداف الفردي", 400);
    }

    // Build campaign record
    const [campaign] = await db
      .insert(feedbackCampaigns)
      .values({
        createdBy: session.userId,
        title: title.trim(),
        targetType,
        targetStudentId: targetType === "STUDENT" ? targetStudentId : null,
        status: targetType === "ALL" ? "PENDING" : "PENDING",
      })
      .returning();

    // If targeted to ALL, return campaign ID for client-side batch loop
    if (targetType === "ALL") {
      const [{ totalEligible }] = await db
        .select({ totalEligible: sql<number>`cast(count(*) as integer)` })
        .from(students)
        .where(and(isNotNull(students.telegramUserId), eq(students.isActive, true)));

      return apiSuccess(
        {
          campaignId: campaign.id,
          title: campaign.title,
          totalRecipients: totalEligible,
          requiresBatchProcessing: true,
        },
        `تم إنشاء حملة التقييم وجدولة ${totalEligible} طالب`
      );
    }

    // If targeted to a single STUDENT, process immediately
    const [targetStudent] = await db
      .select({
        telegramUserId: students.telegramUserId,
        fullName: students.fullName,
      })
      .from(students)
      .where(eq(students.id, targetStudentId));

    if (!targetStudent?.telegramUserId) {
      await db.delete(feedbackCampaigns).where(eq(feedbackCampaigns.id, campaign.id));
      return apiError("الطالب غير مرتبط بتيليجرام أو غير موجود", 400);
    }

    const ratingMessage = buildRatingRequestMessage();
    const inlineKeyboard = buildRatingInlineKeyboard(campaign.id);

    try {
      await TelegramService.sendMessage(targetStudent.telegramUserId, ratingMessage, "HTML", inlineKeyboard);
      await db
        .update(feedbackCampaigns)
        .set({ status: "SENT", sentCount: 1, failedCount: 0, sentAt: new Date() })
        .where(eq(feedbackCampaigns.id, campaign.id));

      return apiSuccess(
        { campaignId: campaign.id, sentCount: 1, failedCount: 0, totalTargeted: 1, requiresBatchProcessing: false },
        `تم إرسال طلب التقييم إلى الطالب بنجاح`
      );
    } catch {
      await db
        .update(feedbackCampaigns)
        .set({ status: "FAILED", sentCount: 0, failedCount: 1, sentAt: new Date() })
        .where(eq(feedbackCampaigns.id, campaign.id));

      return apiError("فشل إرسال رسالة التليجرام للطالب", 500);
    }
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح لك", 403);
    }
    return apiError(error.message || "فشل إرسال حملة التقييم", 500);
  }
}

function buildRatingRequestMessage(): string {
  return `<b>[جامعة برج العرب التكنولوجية - BATU]</b>
قسم تكنولوجيا المعلومات — نظام بصمة الوجه

📊 <b>استبيان قياس جودة الخدمة ورضا الطلاب</b>

عزيزي الطالب،
نرجو منك التكرم بتقييم تجربتك مع منظومة تسجيل بصمة الوجه. رأيك يهمنا جداً لتحسين وتطوير المنظومة!

<b>اضغط على التقييم المناسب من 1 إلى 5 نجوم بالأسفل 👇</b>
أو اضغط على زر الإبلاغ عن مشكلة إذا واجهتك أي صعوبة.`;
}

function buildRatingInlineKeyboard(campaignId: string) {
  return {
    inline_keyboard: [
      [
        { text: "1 ⭐", callback_data: `rate:1:${campaignId}` },
        { text: "2 ⭐", callback_data: `rate:2:${campaignId}` },
        { text: "3 ⭐", callback_data: `rate:3:${campaignId}` },
        { text: "4 ⭐", callback_data: `rate:4:${campaignId}` },
        { text: "5 ⭐", callback_data: `rate:5:${campaignId}` },
      ],
      [
        { text: "⚠️ واجهت مشكلة؟ (إرسال بلاغ واضح)", callback_data: `issue:${campaignId}` },
      ],
    ],
  };
}
