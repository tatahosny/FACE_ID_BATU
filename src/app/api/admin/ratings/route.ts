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
        status: "PENDING",
      })
      .returning();

    // Determine target students
    let targetStudents: { telegramUserId: number | null; fullName: string }[] = [];

    if (targetType === "ALL") {
      targetStudents = await db
        .select({
          telegramUserId: students.telegramUserId,
          fullName: students.fullName,
        })
        .from(students)
        .where(and(isNotNull(students.telegramUserId), eq(students.isActive, true)));
    } else {
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
      targetStudents = [targetStudent];
    }

    // Send rating request message via Telegram with interactive inline keyboard
    const ratingMessage = buildRatingRequestMessage();
    const inlineKeyboard = buildRatingInlineKeyboard(campaign.id);

    let sentCount = 0;
    let failedCount = 0;

    for (const student of targetStudents) {
      if (!student.telegramUserId) continue;
      try {
        await TelegramService.sendMessage(student.telegramUserId, ratingMessage, "HTML", inlineKeyboard);
        sentCount++;
        // Small delay to avoid rate limiting
        await new Promise((r) => setTimeout(r, 50));
      } catch {
        failedCount++;
      }
    }

    // Update campaign status
    await db
      .update(feedbackCampaigns)
      .set({
        status: failedCount === targetStudents.length ? "FAILED" : "SENT",
        sentCount,
        failedCount,
        sentAt: new Date(),
      })
      .where(eq(feedbackCampaigns.id, campaign.id));

    return apiSuccess(
      {
        campaignId: campaign.id,
        sentCount,
        failedCount,
        totalTargeted: targetStudents.length,
      },
      `تم إرسال طلب التقييم إلى ${sentCount} طالب بنجاح`
    );
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
