import { db } from "@/db";
import {
  feedbackCampaigns,
  feedbackCampaignRecipients,
  feedbackRatings,
  students,
  sections,
  groups,
} from "@/db/schema";
import { eq, and, sql, isNotNull, desc, like, or } from "drizzle-orm";
import { TelegramService } from "./telegram.service";

export class FeedbackService {
  /**
   * Create feedback campaign and launch autonomous background delivery
   */
  static async createAndDispatchCampaign(params: {
    title: string;
    targetType: "ALL" | "STUDENT";
    targetStudentId?: string;
    createdBy: string;
  }) {
    const { title, targetType, targetStudentId, createdBy } = params;

    // 1. Resolve eligible students
    let eligibleStudents: { id: string; telegramUserId: number; fullName: string }[] = [];

    if (targetType === "ALL") {
      const dbStudents = await db
        .select({
          id: students.id,
          telegramUserId: students.telegramUserId,
          fullName: students.fullName,
        })
        .from(students)
        .where(and(isNotNull(students.telegramUserId), eq(students.isActive, true)));

      eligibleStudents = dbStudents.map((s) => ({
        id: s.id,
        telegramUserId: s.telegramUserId!,
        fullName: s.fullName,
      }));
    } else {
      if (!targetStudentId) {
        throw new Error("معرف الطالب مطلوب عند الاستهداف الفردي");
      }

      const [targetStudent] = await db
        .select({
          id: students.id,
          telegramUserId: students.telegramUserId,
          fullName: students.fullName,
        })
        .from(students)
        .where(eq(students.id, targetStudentId));

      if (!targetStudent?.telegramUserId) {
        throw new Error("الطالب غير مرتبط بتيليجرام أو غير مسجل");
      }

      eligibleStudents = [
        {
          id: targetStudent.id,
          telegramUserId: targetStudent.telegramUserId,
          fullName: targetStudent.fullName,
        },
      ];
    }

    if (eligibleStudents.length === 0) {
      throw new Error("لا يوجد طلاب مرتبطين بتيليجرام في هذه الشريحة");
    }

    // 2. Insert Campaign record
    const [campaign] = await db
      .insert(feedbackCampaigns)
      .values({
        createdBy,
        title: title.trim(),
        targetType,
        targetStudentId: targetType === "STUDENT" ? targetStudentId : null,
        status: "SENDING",
        totalRecipients: eligibleStudents.length,
        sentCount: 0,
        failedCount: 0,
      })
      .returning();

    // 3. Batch insert recipients into tracking table
    const recipientRecords = eligibleStudents.map((s) => ({
      campaignId: campaign.id,
      studentId: s.id,
      telegramUserId: s.telegramUserId,
      status: "PENDING",
    }));

    // Chunk insert to avoid parameter limits if audience is very large
    const CHUNK_SIZE = 100;
    for (let i = 0; i < recipientRecords.length; i += CHUNK_SIZE) {
      await db
        .insert(feedbackCampaignRecipients)
        .values(recipientRecords.slice(i, i + CHUNK_SIZE));
    }

    // 4. Launch Autonomous Background Worker (detached execution)
    // Runs in server background without waiting or blocking HTTP response
    setImmediate(() => {
      FeedbackService.runBackgroundWorker(campaign.id).catch((err) => {
        console.error(`[FeedbackWorker] Error running campaign ${campaign.id}:`, err);
      });
    });

    return {
      campaign,
      totalRecipients: eligibleStudents.length,
    };
  }

  /**
   * Autonomous background worker that continuously sends batches until complete
   */
  static async runBackgroundWorker(campaignId: string) {
    console.log(`[FeedbackWorker] Starting autonomous delivery for campaign ${campaignId}...`);

    const ratingMessage = FeedbackService.buildRatingRequestMessage();
    const inlineKeyboard = FeedbackService.buildRatingInlineKeyboard(campaignId);

    const BATCH_SIZE = 25;
    let keepRunning = true;

    while (keepRunning) {
      // Fetch next batch of pending recipients
      const pendingRecipients = await db
        .select()
        .from(feedbackCampaignRecipients)
        .where(
          and(
            eq(feedbackCampaignRecipients.campaignId, campaignId),
            eq(feedbackCampaignRecipients.status, "PENDING")
          )
        )
        .limit(BATCH_SIZE);

      if (pendingRecipients.length === 0) {
        keepRunning = false;
        break;
      }

      let batchSent = 0;
      let batchFailed = 0;

      for (const recipient of pendingRecipients) {
        try {
          await TelegramService.sendMessage(
            recipient.telegramUserId,
            ratingMessage,
            "HTML",
            inlineKeyboard
          );

          await db
            .update(feedbackCampaignRecipients)
            .set({ status: "SENT", sentAt: new Date() })
            .where(eq(feedbackCampaignRecipients.id, recipient.id));

          batchSent++;
          // 40ms safe delay to respect Telegram's rate limit
          await new Promise((r) => setTimeout(r, 40));
        } catch (err: any) {
          batchFailed++;
          await db
            .update(feedbackCampaignRecipients)
            .set({
              status: "FAILED",
              lastError: err?.message || "Telegram send error",
            })
            .where(eq(feedbackCampaignRecipients.id, recipient.id));
        }
      }

      // Increment campaign counters
      await db
        .update(feedbackCampaigns)
        .set({
          sentCount: sql`${feedbackCampaigns.sentCount} + ${batchSent}`,
          failedCount: sql`${feedbackCampaigns.failedCount} + ${batchFailed}`,
        })
        .where(eq(feedbackCampaigns.id, campaignId));

      // Small 250ms breather between batches
      await new Promise((r) => setTimeout(r, 250));
    }

    // Check if any remain
    const [{ remainingPending }] = await db
      .select({ remainingPending: sql<number>`cast(count(*) as integer)` })
      .from(feedbackCampaignRecipients)
      .where(
        and(
          eq(feedbackCampaignRecipients.campaignId, campaignId),
          eq(feedbackCampaignRecipients.status, "PENDING")
        )
      );

    if (remainingPending === 0) {
      await db
        .update(feedbackCampaigns)
        .set({
          status: "SENT",
          sentAt: new Date(),
        })
        .where(eq(feedbackCampaigns.id, campaignId));
      console.log(`[FeedbackWorker] Campaign ${campaignId} successfully completed!`);
    }
  }

  /**
   * Get detailed delivery status and recipient list with rating responses
   */
  static async getDeliveryDetails(params: {
    campaignId?: string;
    search?: string;
    filterStatus?: string;
    page?: number;
    limit?: number;
  }) {
    const page = params.page || 1;
    const limit = params.limit || 50;
    const offset = (page - 1) * limit;

    // 1. Determine active campaign (specified or latest)
    let campaignId = params.campaignId;
    if (!campaignId) {
      const [latest] = await db
        .select()
        .from(feedbackCampaigns)
        .orderBy(desc(feedbackCampaigns.createdAt))
        .limit(1);

      if (latest) campaignId = latest.id;
    }

    if (!campaignId) {
      return {
        campaign: null,
        summary: {
          totalEligible: 0,
          deliveredCount: 0,
          failedCount: 0,
          pendingCount: 0,
          ratingsReceived: 0,
          responseRate: "0%",
        },
        recipients: [],
        pagination: { total: 0, page: 1, limit, totalPages: 0 },
      };
    }

    const [campaign] = await db
      .select()
      .from(feedbackCampaigns)
      .where(eq(feedbackCampaigns.id, campaignId));

    if (!campaign) {
      throw new Error("الحملة غير موجودة");
    }

    // 2. Summary stats for this campaign
    const [{ totalRecipients }] = await db
      .select({ totalRecipients: sql<number>`cast(count(*) as integer)` })
      .from(feedbackCampaignRecipients)
      .where(eq(feedbackCampaignRecipients.campaignId, campaignId));

    const [{ deliveredCount }] = await db
      .select({ deliveredCount: sql<number>`cast(count(*) as integer)` })
      .from(feedbackCampaignRecipients)
      .where(
        and(
          eq(feedbackCampaignRecipients.campaignId, campaignId),
          eq(feedbackCampaignRecipients.status, "SENT")
        )
      );

    const [{ failedCount }] = await db
      .select({ failedCount: sql<number>`cast(count(*) as integer)` })
      .from(feedbackCampaignRecipients)
      .where(
        and(
          eq(feedbackCampaignRecipients.campaignId, campaignId),
          eq(feedbackCampaignRecipients.status, "FAILED")
        )
      );

    const [{ ratingsReceived }] = await db
      .select({ ratingsReceived: sql<number>`cast(count(*) as integer)` })
      .from(feedbackRatings)
      .where(eq(feedbackRatings.requestCampaignId, campaignId));

    const responseRate =
      deliveredCount > 0
        ? `${((ratingsReceived / deliveredCount) * 100).toFixed(1)}%`
        : "0%";

    // 3. Build recipients query with optional filters
    const conditions = [eq(feedbackCampaignRecipients.campaignId, campaignId)];

    if (params.filterStatus && params.filterStatus !== "ALL") {
      conditions.push(eq(feedbackCampaignRecipients.status, params.filterStatus));
    }

    if (params.search?.trim()) {
      const q = `%${params.search.trim()}%`;
      conditions.push(
        or(
          like(students.fullName, q),
          like(students.academicNumber, q)
        )!
      );
    }

    const whereClause = and(...conditions);

    const [{ totalFiltered }] = await db
      .select({ totalFiltered: sql<number>`cast(count(*) as integer)` })
      .from(feedbackCampaignRecipients)
      .innerJoin(students, eq(feedbackCampaignRecipients.studentId, students.id))
      .where(whereClause);

    // Fetch recipient rows with joined student and feedback details
    const rows = await db
      .select({
        id: feedbackCampaignRecipients.id,
        status: feedbackCampaignRecipients.status,
        sentAt: feedbackCampaignRecipients.sentAt,
        studentId: students.id,
        studentFullName: students.fullName,
        studentAcademicNumber: students.academicNumber,
        sectionName: sections.name,
        groupName: groups.name,
        rating: feedbackRatings.rating,
        feedbackType: feedbackRatings.type,
        feedbackMessage: feedbackRatings.message,
        ratedAt: feedbackRatings.createdAt,
      })
      .from(feedbackCampaignRecipients)
      .innerJoin(students, eq(feedbackCampaignRecipients.studentId, students.id))
      .innerJoin(sections, eq(students.sectionId, sections.id))
      .innerJoin(groups, eq(students.groupId, groups.id))
      .leftJoin(
        feedbackRatings,
        and(
          eq(feedbackRatings.requestCampaignId, campaignId),
          eq(feedbackRatings.studentId, students.id)
        )
      )
      .where(whereClause)
      .orderBy(students.academicNumber)
      .limit(limit)
      .offset(offset);

    return {
      campaign,
      summary: {
        totalEligible: totalRecipients,
        deliveredCount,
        failedCount,
        pendingCount: Math.max(0, totalRecipients - deliveredCount - failedCount),
        ratingsReceived,
        responseRate,
      },
      recipients: rows,
      pagination: {
        total: totalFiltered,
        page,
        limit,
        totalPages: Math.ceil(totalFiltered / limit),
      },
    };
  }

  static buildRatingRequestMessage(): string {
    return `<b>[جامعة برج العرب التكنولوجية - BATU]</b>
قسم تكنولوجيا المعلومات — نظام بصمة الوجه

📊 <b>استبيان قياس جودة الخدمة ورضا الطلاب</b>

عزيزي الطالب،
نرجو منك التكرم بتقييم تجربتك مع منظومة تسجيل بصمة الوجه. رأيك يهمنا جداً لتحسين وتطوير المنظومة!

<b>اضغط على التقييم المناسب من 1 إلى 5 نجوم بالأسفل 👇</b>
أو اضغط على زر الإبلاغ عن مشكلة إذا واجهتك أي صعوبة.`;
  }

  static buildRatingInlineKeyboard(campaignId: string) {
    return {
      inline_keyboard: [
        [
          { text: "⭐ 1", callback_data: `rate:1:${campaignId}` },
          { text: "⭐⭐ 2", callback_data: `rate:2:${campaignId}` },
          { text: "⭐⭐⭐ 3", callback_data: `rate:3:${campaignId}` },
        ],
        [
          { text: "⭐⭐⭐⭐ 4", callback_data: `rate:4:${campaignId}` },
          { text: "⭐⭐⭐⭐⭐ 5", callback_data: `rate:5:${campaignId}` },
        ],
        [
          { text: "⚠️ واجهت مشكلة؟ (إبلاغ الإدارة)", callback_data: `issue:${campaignId}` },
        ],
      ],
    };
  }
}
