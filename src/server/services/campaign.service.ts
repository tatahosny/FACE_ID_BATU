import { db } from "@/db";
import {
  telegramCampaigns,
  telegramCampaignRecipients,
  students,
  messageTemplates,
  auditLogs,
} from "@/db/schema";
import { eq, and, sql, isNotNull, desc } from "drizzle-orm";
import { TelegramService } from "./telegram.service";

export class CampaignService {
  /**
   * Calculate audience metrics before confirming campaign
   */
  static async previewAudience(params: {
    targetType: "ALL" | "GROUP" | "SECTION";
    groupId?: string;
    sectionId?: string;
  }) {
    const conditions = [];

    if (params.targetType === "GROUP" && params.groupId) {
      conditions.push(eq(students.groupId, params.groupId));
    } else if (params.targetType === "SECTION" && params.sectionId) {
      conditions.push(eq(students.sectionId, params.sectionId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [{ totalStudents }] = await db
      .select({ totalStudents: sql<number>`cast(count(*) as integer)` })
      .from(students)
      .where(whereClause);

    const [{ linkedStudents }] = await db
      .select({ linkedStudents: sql<number>`cast(count(*) as integer)` })
      .from(students)
      .where(and(whereClause, isNotNull(students.telegramUserId)));

    return {
      totalStudents,
      eligibleTelegramRecipients: linkedStudents,
      unlinkedStudents: totalStudents - linkedStudents,
    };
  }

  /**
   * Create campaign and populate recipients
   */
  static async createCampaign(params: {
    title: string;
    message: string;
    targetType: "ALL" | "GROUP" | "SECTION";
    targetFilters?: { groupId?: string; sectionId?: string };
    createdBy: string;
  }) {
    return await db.transaction(async (tx) => {
      // 1. Resolve eligible students who have linked Telegram accounts
      const conditions = [isNotNull(students.telegramUserId)];

      if (params.targetType === "GROUP" && params.targetFilters?.groupId) {
        conditions.push(eq(students.groupId, params.targetFilters.groupId));
      } else if (params.targetType === "SECTION" && params.targetFilters?.sectionId) {
        conditions.push(eq(students.sectionId, params.targetFilters.sectionId));
      }

      const eligibleStudents = await tx
        .select({
          id: students.id,
          telegramUserId: students.telegramUserId,
        })
        .from(students)
        .where(and(...conditions));

      // 2. Insert Campaign record
      const [campaign] = await tx
        .insert(telegramCampaigns)
        .values({
          title: params.title,
          message: params.message,
          targetType: params.targetType,
          targetFilters: params.targetFilters,
          createdBy: params.createdBy,
          totalRecipients: eligibleStudents.length,
          status: "QUEUED",
        })
        .returning();

      // 3. Batch insert recipient delivery tracking
      if (eligibleStudents.length > 0) {
        const recipientRecords = eligibleStudents.map((s) => ({
          campaignId: campaign.id,
          studentId: s.id,
          telegramUserId: s.telegramUserId!,
          status: "QUEUED",
        }));

        await tx.insert(telegramCampaignRecipients).values(recipientRecords);
      }

      // 4. Audit log
      await tx.insert(auditLogs).values({
        actorId: params.createdBy,
        action: "TELEGRAM_CAMPAIGN_CREATED",
        entityType: "CAMPAIGN",
        entityId: campaign.id,
        safeMetadata: {
          title: params.title,
          totalRecipients: eligibleStudents.length,
          targetType: params.targetType,
        },
      });

      return campaign;
    });
  }

  /**
   * Process a chunk of campaign recipients respecting rate limits
   */
  static async processCampaignBatch(campaignId: string, batchSize = 25) {
    const [campaign] = await db
      .select()
      .from(telegramCampaigns)
      .where(eq(telegramCampaigns.id, campaignId));

    if (!campaign || campaign.status === "COMPLETED" || campaign.status === "PAUSED") {
      return { completed: true };
    }

    // Set to RUNNING if not already
    if (campaign.status === "QUEUED") {
      await db
        .update(telegramCampaigns)
        .set({ status: "RUNNING", startedAt: new Date() })
        .where(eq(telegramCampaigns.id, campaignId));
    }

    const recipients = await db
      .select()
      .from(telegramCampaignRecipients)
      .where(
        and(
          eq(telegramCampaignRecipients.campaignId, campaignId),
          eq(telegramCampaignRecipients.status, "QUEUED")
        )
      )
      .limit(batchSize);

    if (recipients.length === 0) {
      await db
        .update(telegramCampaigns)
        .set({ status: "COMPLETED", completedAt: new Date() })
        .where(eq(telegramCampaigns.id, campaignId));
      return { completed: true };
    }

    let sent = 0;
    let failed = 0;

    for (const recipient of recipients) {
      try {
        await TelegramService.sendMessage(
          recipient.telegramUserId,
          `📢 <b>${campaign.title}</b>\n\n${campaign.message}`
        );

        await db
          .update(telegramCampaignRecipients)
          .set({ status: "SENT", sentAt: new Date(), attempts: recipient.attempts + 1 })
          .where(eq(telegramCampaignRecipients.id, recipient.id));

        sent++;
      } catch (err: any) {
        failed++;
        await db
          .update(telegramCampaignRecipients)
          .set({
            status: "FAILED",
            attempts: recipient.attempts + 1,
            lastError: err.message,
          })
          .where(eq(telegramCampaignRecipients.id, recipient.id));
      }
    }

    // Update campaign summary counts
    await db
      .update(telegramCampaigns)
      .set({
        sentCount: sql`${telegramCampaigns.sentCount} + ${sent}`,
        failedCount: sql`${telegramCampaigns.failedCount} + ${failed}`,
      })
      .where(eq(telegramCampaigns.id, campaignId));

    return { completed: false, sentInBatch: sent, failedInBatch: failed };
  }

  /**
   * Templates management
   */
  static async getTemplates() {
    return db
      .select()
      .from(messageTemplates)
      .where(eq(messageTemplates.isActive, true))
      .orderBy(desc(messageTemplates.createdAt));
  }

  static async createTemplate(name: string, content: string, createdBy?: string) {
    const [template] = await db
      .insert(messageTemplates)
      .values({ name, content, createdBy })
      .returning();
    return template;
  }
}
