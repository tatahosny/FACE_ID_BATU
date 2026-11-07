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
   * Preview eligible audience metrics for feedback campaigns before confirming
   */
  static async previewAudience(params: {
    targetType: "ALL" | "GROUP" | "SECTION" | "ACADEMIC_YEAR" | "SPECIALIZATION" | "STUDENT";
    academicYear?: string;
    specialization?: string;
    groupId?: string;
    sectionId?: string;
    subSection?: "ALL" | "A" | "B";
    studentId?: string;
  }) {
    const conditions = [];

    if (params.targetType === "STUDENT" && params.studentId) {
      conditions.push(eq(students.id, params.studentId));
    } else {
      if (params.academicYear && params.academicYear !== "ALL") {
        conditions.push(eq(students.academicYear, params.academicYear));
      }
      if (params.specialization && params.specialization !== "ALL") {
        conditions.push(eq(students.specialization, params.specialization));
      }
      if (params.targetType === "GROUP" && params.groupId) {
        conditions.push(eq(students.groupId, params.groupId));
      } else if (params.targetType === "SECTION" && params.sectionId) {
        conditions.push(eq(students.sectionId, params.sectionId));
      }
      if (params.subSection && params.subSection !== "ALL") {
        conditions.push(eq(students.subSection, params.subSection));
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ totalStudents }] = await db
      .select({ totalStudents: sql<number>`cast(count(*) as integer)` })
      .from(students)
      .where(whereClause);

    const [{ linkedStudents }] = await db
      .select({ linkedStudents: sql<number>`cast(count(*) as integer)` })
      .from(students)
      .where(and(whereClause, isNotNull(students.telegramUserId), eq(students.isActive, true)));

    return {
      totalStudents,
      eligibleTelegramRecipients: linkedStudents,
      unlinkedStudents: totalStudents - linkedStudents,
    };
  }

  /**
   * Create feedback campaign and launch autonomous background delivery
   */
  static async createAndDispatchCampaign(params: {
    title: string;
    targetType: "ALL" | "GROUP" | "SECTION" | "ACADEMIC_YEAR" | "SPECIALIZATION" | "STUDENT";
    targetStudentId?: string;
    targetFilters?: {
      academicYear?: string;
      specialization?: string;
      groupId?: string;
      sectionId?: string;
      subSection?: "ALL" | "A" | "B";
    };
    createdBy: string;
  }) {
    const { title, targetType, targetStudentId, targetFilters, createdBy } = params;

    // 1. Resolve eligible students
    const conditions = [
      isNotNull(students.telegramUserId),
      eq(students.isActive, true),
    ];

    if (targetType === "STUDENT") {
      if (!targetStudentId) {
        throw new Error("معرف الطالب مطلوب عند الاستهداف الفردي");
      }
      conditions.push(eq(students.id, targetStudentId));
    } else {
      if (targetFilters?.academicYear && targetFilters.academicYear !== "ALL") {
        conditions.push(eq(students.academicYear, targetFilters.academicYear));
      }
      if (targetFilters?.specialization && targetFilters.specialization !== "ALL") {
        conditions.push(eq(students.specialization, targetFilters.specialization));
      }
      if (targetType === "GROUP" && targetFilters?.groupId) {
        conditions.push(eq(students.groupId, targetFilters.groupId));
      } else if (targetType === "SECTION" && targetFilters?.sectionId) {
        conditions.push(eq(students.sectionId, targetFilters.sectionId));
      }
      if (targetFilters?.subSection && targetFilters.subSection !== "ALL") {
        conditions.push(eq(students.subSection, targetFilters.subSection));
      }
    }

    const eligibleStudents = await db
      .select({
        id: students.id,
        telegramUserId: students.telegramUserId,
        fullName: students.fullName,
      })
      .from(students)
      .where(and(...conditions));

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
      telegramUserId: s.telegramUserId!,
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
   * High-speed batch processor that sends a batch of feedback requests using a concurrent pool (6 parallel workers)
   */
  static async processFeedbackBatch(campaignId: string, batchSize = 30) {
    const [campaign] = await db
      .select()
      .from(feedbackCampaigns)
      .where(eq(feedbackCampaigns.id, campaignId));

    if (!campaign || campaign.status === "SENT" || campaign.status === "PAUSED") {
      const [{ remainingPending = 0 } = {}] = await db
        .select({ remainingPending: sql<number>`cast(count(*) as integer)` })
        .from(feedbackCampaignRecipients)
        .where(
          and(
            eq(feedbackCampaignRecipients.campaignId, campaignId),
            eq(feedbackCampaignRecipients.status, "PENDING")
          )
        );

      return {
        completed: campaign?.status === "SENT",
        isPaused: campaign?.status === "PAUSED",
        sentInBatch: 0,
        failedInBatch: 0,
        totalSent: campaign?.sentCount || 0,
        totalFailed: campaign?.failedCount || 0,
        totalRecipients: campaign?.totalRecipients || 0,
        remainingPending: remainingPending ?? 0,
      };
    }

    if (campaign.status === "PENDING") {
      await db
        .update(feedbackCampaigns)
        .set({ status: "SENDING" })
        .where(eq(feedbackCampaigns.id, campaignId));
    }

    const pendingRecipients = await db
      .select()
      .from(feedbackCampaignRecipients)
      .where(
        and(
          eq(feedbackCampaignRecipients.campaignId, campaignId),
          eq(feedbackCampaignRecipients.status, "PENDING")
        )
      )
      .limit(batchSize);

    if (pendingRecipients.length === 0) {
      await db
        .update(feedbackCampaigns)
        .set({ status: "SENT", sentAt: new Date() })
        .where(eq(feedbackCampaigns.id, campaignId));

      return {
        completed: true,
        isPaused: false,
        sentInBatch: 0,
        failedInBatch: 0,
        totalSent: campaign.sentCount,
        totalFailed: campaign.failedCount,
        totalRecipients: campaign.totalRecipients,
        remainingPending: 0,
      };
    }

    const ratingMessage = FeedbackService.buildRatingRequestMessage();
    const inlineKeyboard = FeedbackService.buildRatingInlineKeyboard(campaignId);

    // High speed concurrent pool (6 parallel workers) with sliding rate-limiter
    const CONCURRENCY = 6;
    const MIN_INTERVAL_MS = 35; // Safe ~28 msgs/sec globally
    let lastDispatchTime = 0;
    let sentCount = 0;
    let failedCount = 0;
    let itemIndex = 0;

    const workers = Array.from(
      { length: Math.min(CONCURRENCY, pendingRecipients.length) },
      async () => {
        while (itemIndex < pendingRecipients.length) {
          const recipient = pendingRecipients[itemIndex++];
          if (!recipient) break;

          const nowMs = Date.now();
          const elapsed = nowMs - lastDispatchTime;
          if (elapsed < MIN_INTERVAL_MS) {
            await new Promise((r) => setTimeout(r, MIN_INTERVAL_MS - elapsed));
          }
          lastDispatchTime = Date.now();

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

            sentCount++;
          } catch (err: any) {
            failedCount++;
            await db
              .update(feedbackCampaignRecipients)
              .set({
                status: "FAILED",
                lastError: err?.message || "Telegram send error",
              })
              .where(eq(feedbackCampaignRecipients.id, recipient.id));
          }
        }
      }
    );

    await Promise.all(workers);

    // Update campaign counters atomically
    const [updatedCampaign] = await db
      .update(feedbackCampaigns)
      .set({
        sentCount: sql`${feedbackCampaigns.sentCount} + ${sentCount}`,
        failedCount: sql`${feedbackCampaigns.failedCount} + ${failedCount}`,
      })
      .where(eq(feedbackCampaigns.id, campaignId))
      .returning();

    // Check remaining pending
    const [{ remainingPending }] = await db
      .select({ remainingPending: sql<number>`cast(count(*) as integer)` })
      .from(feedbackCampaignRecipients)
      .where(
        and(
          eq(feedbackCampaignRecipients.campaignId, campaignId),
          eq(feedbackCampaignRecipients.status, "PENDING")
        )
      );

    const isCompleted = remainingPending === 0;
    if (isCompleted) {
      await db
        .update(feedbackCampaigns)
        .set({ status: "SENT", sentAt: new Date() })
        .where(eq(feedbackCampaigns.id, campaignId));
    }

    return {
      completed: isCompleted,
      isPaused: false,
      sentInBatch: sentCount,
      failedInBatch: failedCount,
      totalSent: updatedCampaign.sentCount,
      totalFailed: updatedCampaign.failedCount,
      totalRecipients: updatedCampaign.totalRecipients,
      remainingPending,
    };
  }

  /**
   * Pause campaign auto-delivery
   */
  static async pauseCampaign(campaignId: string) {
    const [updated] = await db
      .update(feedbackCampaigns)
      .set({ status: "PAUSED" })
      .where(eq(feedbackCampaigns.id, campaignId))
      .returning();
    return updated;
  }

  /**
   * Resume paused campaign
   */
  static async resumeCampaign(campaignId: string) {
    const [updated] = await db
      .update(feedbackCampaigns)
      .set({ status: "SENDING" })
      .where(eq(feedbackCampaigns.id, campaignId))
      .returning();

    // Resume background autonomous delivery
    setImmediate(() => {
      FeedbackService.runBackgroundWorker(campaignId).catch(console.error);
    });

    return updated;
  }

  /**
   * Autonomous background worker that continuously sends batches in high speed until complete
   */
  static async runBackgroundWorker(campaignId: string) {
    console.log(`[FeedbackWorker] Starting high-speed autonomous batch delivery for campaign ${campaignId}...`);

    let keepRunning = true;
    while (keepRunning) {
      const result = await FeedbackService.processFeedbackBatch(campaignId, 30);
      if (result.completed || result.isPaused || result.remainingPending === 0) {
        keepRunning = false;
        break;
      }
      await new Promise((r) => setTimeout(r, 150));
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
