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
import { eq, desc, sql, and, isNotNull, or, like, inArray } from "drizzle-orm";
import { TelegramService } from "@/server/services/telegram.service";
import { FeedbackService } from "@/server/services/feedback.service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    await requireRole([USER_ROLES.SUPER_ADMIN]);

    const { searchParams } = new URL(req.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = (page - 1) * limit;
    const campaignId = searchParams.get("campaignId") || undefined;
    const filter = searchParams.get("filter") || "all";
    const search = searchParams.get("search")?.trim() || undefined;

    // Build filter conditions
    const conditions: any[] = [];
    if (campaignId) {
      conditions.push(eq(feedbackRatings.requestCampaignId, campaignId));
    }

    if (filter === "low") {
      conditions.push(sql`${feedbackRatings.rating} <= 2`);
    } else if (filter === "low_unreasoned") {
      conditions.push(
        and(
          sql`${feedbackRatings.rating} <= 2`,
          sql`(${feedbackRatings.message} IS NULL OR TRIM(${feedbackRatings.message}) = '')`
        )
      );
    } else if (filter === "low_reasoned") {
      conditions.push(
        and(
          sql`${feedbackRatings.rating} <= 2`,
          sql`(${feedbackRatings.message} IS NOT NULL AND TRIM(${feedbackRatings.message}) != '')`
        )
      );
    } else if (filter === "issues") {
      conditions.push(eq(feedbackRatings.type, "ISSUE"));
    }

    if (search) {
      conditions.push(
        or(
          like(students.fullName, `%${search}%`),
          like(students.academicNumber, `%${search}%`)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Total count for current filter
    const [totalRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(feedbackRatings)
      .innerJoin(students, eq(feedbackRatings.studentId, students.id))
      .where(whereClause);

    // Ratings with student info & reasonRequestedAt
    const ratings = await db
      .select({
        id: feedbackRatings.id,
        rating: feedbackRatings.rating,
        message: feedbackRatings.message,
        type: feedbackRatings.type,
        reasonRequestedAt: feedbackRatings.reasonRequestedAt,
        createdAt: feedbackRatings.createdAt,
        requestCampaignId: feedbackRatings.requestCampaignId,
        studentId: feedbackRatings.studentId,
        studentFullName: students.fullName,
        studentAcademicNumber: students.academicNumber,
        telegramUserId: students.telegramUserId,
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

    // Student counts
    const [{ totalStudents }] = await db
      .select({ totalStudents: sql<number>`cast(count(*) as integer)` })
      .from(students);

    const [{ eligibleStudents }] = await db
      .select({ eligibleStudents: sql<number>`cast(count(*) as integer)` })
      .from(students)
      .where(and(isNotNull(students.telegramUserId), eq(students.isActive, true)));

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
        lowRatingsTotal: sql<number>`count(*) filter (where ${feedbackRatings.rating} <= 2)::int`,
        lowRatingsWithoutReason: sql<number>`count(*) filter (where ${feedbackRatings.rating} <= 2 and (${feedbackRatings.message} is null or trim(${feedbackRatings.message}) = ''))::int`,
        lowRatingsWithReason: sql<number>`count(*) filter (where ${feedbackRatings.rating} <= 2 and ${feedbackRatings.message} is not null and trim(${feedbackRatings.message}) != '')::int`,
        lowRatingsWarned: sql<number>`count(*) filter (where ${feedbackRatings.rating} <= 2 and ${feedbackRatings.reasonRequestedAt} is not null)::int`,
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
        totalRecipients: feedbackCampaigns.totalRecipients,
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
      stats: {
        ...stats,
        totalStudents,
        eligibleStudents,
        unlinkedStudents: totalStudents - eligibleStudents,
      },
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

export async function DELETE(req: NextRequest) {
  try {
    await requireRole([USER_ROLES.SUPER_ADMIN]);

    const { searchParams } = new URL(req.url);
    const action = searchParams.get("action");
    const id = searchParams.get("id");
    const notifyStudent = searchParams.get("notifyStudent") === "true";

    // 1. Batch cancellation of low ratings without a reason
    if (action === "cancel_unreasoned_low") {
      const unreasonedRatings = await db
        .select({
          id: feedbackRatings.id,
          rating: feedbackRatings.rating,
          studentFullName: students.fullName,
          telegramUserId: students.telegramUserId,
        })
        .from(feedbackRatings)
        .innerJoin(students, eq(feedbackRatings.studentId, students.id))
        .where(
          and(
            sql`${feedbackRatings.rating} <= 2`,
            sql`(${feedbackRatings.message} IS NULL OR TRIM(${feedbackRatings.message}) = '')`
          )
        );

      if (unreasonedRatings.length === 0) {
        return apiSuccess({ cancelledCount: 0, notifiedCount: 0 }, "لا توجد تقييمات منخفضة بدون سبب لإلغائها حالياً");
      }

      let notifiedCount = 0;
      if (notifyStudent) {
        for (const item of unreasonedRatings) {
          if (item.telegramUserId) {
            try {
              const msg = `<b>[جامعة برج العرب التكنولوجية - BATU]</b>
قسم تكنولوجيا المعلومات — نظام بصمة الوجه

ℹ️ <b>تنبيه بخصوص التقييم:</b>
عزيزي الطالب: <b>${item.studentFullName}</b>
نظراً لعدم توضيح سبب التقييم (${item.rating} من 5) أو تقديم شكوى توضيحية، تم <b>إلغاء تقييمك</b> من سجلات المنظومة.

نرحب دائماً برأيك ومشاركتك في الاستبيانات القادمة مع توضيح ملاحظاتك لمساعدتنا على تحسين الخدمة 🙏`;
              await TelegramService.sendMessage(item.telegramUserId, msg);
              notifiedCount++;
            } catch (err) {
              console.error(`Failed to notify student ${item.studentFullName} on cancellation:`, err);
            }
          }
        }
      }

      const ratingIds = unreasonedRatings.map((r) => r.id);
      await db.delete(feedbackRatings).where(inArray(feedbackRatings.id, ratingIds));

      return apiSuccess(
        { cancelledCount: unreasonedRatings.length, notifiedCount },
        `تم إلغاء ${unreasonedRatings.length} تقييم بنجاح ${notifyStudent ? `(تم إشعار ${notifiedCount} طالب)` : ""}`
      );
    }

    // 2. Single rating cancellation
    if (id) {
      const [rating] = await db
        .select({
          id: feedbackRatings.id,
          rating: feedbackRatings.rating,
          studentFullName: students.fullName,
          telegramUserId: students.telegramUserId,
        })
        .from(feedbackRatings)
        .innerJoin(students, eq(feedbackRatings.studentId, students.id))
        .where(eq(feedbackRatings.id, id));

      if (!rating) {
        return apiError("التقييم غير موجود", 404);
      }

      if (notifyStudent && rating.telegramUserId) {
        try {
          const msg = `<b>[جامعة برج العرب التكنولوجية - BATU]</b>
قسم تكنولوجيا المعلومات — نظام بصمة الوجه

ℹ️ <b>تنبيه بخصوص التقييم:</b>
عزيزي الطالب: <b>${rating.studentFullName}</b>
تم <b>إلغاء تقييمك السابق</b> (${rating.rating} من 5) من منظومة البصمة لعدم استيفاء سبب التقييم أو بناءً على المراجعة.

شكراً لتفهمك 🙏`;
          await TelegramService.sendMessage(rating.telegramUserId, msg);
        } catch (err) {
          console.error(`Failed to notify student on rating deletion:`, err);
        }
      }

      await db.delete(feedbackRatings).where(eq(feedbackRatings.id, id));

      return apiSuccess({ cancelledId: id }, "تم إلغاء التقييم بنجاح");
    }

    return apiError("معاملات الإلغاء غير مكتملة", 400);
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح لك", 403);
    }
    console.error("Error in DELETE ratings:", error);
    return apiError(error.message || "فشل إلغاء التقييم", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireRole([USER_ROLES.SUPER_ADMIN]);

    const body = await req.json();
    const { title, targetType = "ALL", targetStudentId } = body;

    if (!title?.trim()) {
      return apiError("عنوان الحملة مطلوب", 400);
    }

    if (!["ALL", "STUDENT"].includes(targetType)) {
      return apiError("نوع الهدف غير صالح", 400);
    }

    if (targetType === "STUDENT" && !targetStudentId) {
      return apiError("معرف الطالب مطلوب عند الاستهداف الفردي", 400);
    }

    // Dispatch campaign with autonomous background worker
    const result = await FeedbackService.createAndDispatchCampaign({
      title: title.trim(),
      targetType,
      targetStudentId,
      createdBy: session.userId,
    });

    return apiSuccess(
      {
        campaignId: result.campaign.id,
        title: result.campaign.title,
        totalRecipients: result.totalRecipients,
        status: result.campaign.status,
      },
      `تم إطلاق حملة التقييم لـ ${result.totalRecipients} طالب بنجاح! يتم الإرسال تلقائياً في الخلفية.`
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
