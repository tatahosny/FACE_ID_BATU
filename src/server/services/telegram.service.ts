import { db } from "@/db";
import {
  students,
  telegramLinkTokens,
  telegramUpdates,
  auditLogs,
  bookings,
  bookingWindows,
  groups,
  sections,
  sectionSchedules,
  feedbackRatings,
  feedbackCampaigns,
} from "@/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { hashToken, generateSecureToken } from "@/lib/security/crypto";
import { formatCairoDateTime } from "@/lib/utils/datetime";
import { BOOKING_WINDOW_STATUSES } from "@/lib/constants/statuses";

function getTelegramBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("[SECURITY] TELEGRAM_BOT_TOKEN environment variable is required in production.");
    }
    // Dev fallback — never commit real tokens to source code
    console.warn("[SECURITY WARNING] TELEGRAM_BOT_TOKEN not set, Telegram features will fail.");
    return "";
  }
  return token;
}

const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || "batu_face_id_bot";
const TELEGRAM_API_BASE = `https://api.telegram.org/bot${getTelegramBotToken()}`;

export class TelegramService {
  /**
   * Generates a new cryptographically secure single-use token for linking Telegram
   */
  static async createLinkingToken(studentId: string) {
    const rawToken = generateSecureToken(32);
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await db.insert(telegramLinkTokens).values({
      studentId,
      tokenHash,
      expiresAt,
    });

    return {
      token: rawToken,
      deepLink: `https://t.me/${BOT_USERNAME}?start=${rawToken}`,
      expiresAt,
    };
  }

  // In-memory tracking for interactive feedback flows
  static pendingIssues = new Map<number, { campaignId: string | null; timestamp: number }>();
  static pendingComments = new Map<number, { ratingId: string; campaignId: string | null; timestamp: number }>();

  /**
   * Direct API call to send a message to a Telegram chat, optionally with reply_markup (inline keyboards, force_reply, etc.)
   */
  static async sendMessage(chatId: number, text: string, parseMode = "HTML", replyMarkup?: any) {
    try {
      const payload: any = {
        chat_id: chatId,
        text,
        parse_mode: parseMode,
      };
      if (replyMarkup) {
        payload.reply_markup = replyMarkup;
      }

      const response = await fetch(`${TELEGRAM_API_BASE}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
          const retryAfter = data.parameters?.retry_after || 5;
          const error: any = new Error(`Telegram Rate Limited. Retry after ${retryAfter}s`);
          error.retryAfter = retryAfter;
          throw error;
        }
        throw new Error(data.description || "Telegram API Error");
      }

      return data;
    } catch (err: any) {
      console.error("[TelegramService] Failed to send message:", err.message);
      throw err;
    }
  }

  /**
   * Answer a Telegram callback query (closes the loading spinner on user's client)
   */
  static async answerCallbackQuery(callbackQueryId: string, text?: string, showAlert = false) {
    try {
      const payload: any = {
        callback_query_id: callbackQueryId,
        show_alert: showAlert,
      };
      if (text) {
        payload.text = text;
      }
      await fetch(`${TELEGRAM_API_BASE}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (err: any) {
      console.error("[TelegramService] Failed to answer callback query:", err.message);
    }
  }

  /**
   * Edit a message's text and update/remove its reply_markup
   */
  static async editMessageText(chatId: number, messageId: number, text: string, parseMode = "HTML", replyMarkup?: any) {
    try {
      const payload: any = {
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: parseMode,
      };
      if (replyMarkup) {
        payload.reply_markup = replyMarkup;
      }
      await fetch(`${TELEGRAM_API_BASE}/editMessageText`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (err: any) {
      console.error("[TelegramService] Failed to edit message text:", err.message);
    }
  }

  /**
   * Process incoming Telegram webhook updates with idempotency and token validation
   */
  static async handleWebhookUpdate(update: any): Promise<{ handled: boolean; success?: boolean; duplicate?: boolean; [key: string]: any }> {
    const updateId = update.update_id;
    if (!updateId) {
      return { handled: false, error: "Invalid update payload" };
    }

    // 1. Idempotency check: Ignore already processed updates
    try {
      const [existing] = await db
        .select()
        .from(telegramUpdates)
        .where(eq(telegramUpdates.id, updateId));

      if (existing) {
        return { handled: true, duplicate: true };
      }

      await db.insert(telegramUpdates).values({ id: updateId });
    } catch {
      // In case of race condition on update_id unique constraint
      return { handled: true, duplicate: true };
    }

    // 2. Interactive Callback Queries (Star Rating buttons & Issue button)
    if (update.callback_query) {
      return await this.handleCallbackQuery(update.callback_query);
    }

    const message = update.message;
    if (!message || !message.text) {
      return { handled: true, ignored: true };
    }

    const text = message.text.trim();
    const telegramUserId = message.from?.id;
    const telegramUsername = message.from?.username || null;

    if (!telegramUserId) {
      return { handled: true, ignored: true };
    }

    // Check for /start command
    if (text.startsWith("/start")) {
      const parts = text.split(/\s+/);
      const linkingToken = parts[1];

      if (!linkingToken) {
        // Just /start without token: send general info
        await this.sendMessage(
          telegramUserId,
          `<b>[جامعة برج العرب التكنولوجية - BATU]</b>\nقسم تكنولوجيا المعلومات\n\nمرحباً بك في بوت نظام تسجيل بصمة الوجه وإدارة طوابير الانتظار.\n\nلربط حسابك، يرجى التسجيل في المنصة الإلكترونية والضغط على زر «ربط تيليجرام».`
        );
        return { handled: true, welcomeSent: true };
      }

      // Validate linking token
      const tokenHash = hashToken(linkingToken);
      const now = new Date();

      const result = await db.transaction(async (tx) => {
        const [tokenRecord] = await tx
          .select()
          .from(telegramLinkTokens)
          .where(
            and(
              eq(telegramLinkTokens.tokenHash, tokenHash),
              sql`${telegramLinkTokens.expiresAt} > ${now}`,
              sql`${telegramLinkTokens.usedAt} IS NULL`
            )
          );

        if (!tokenRecord) {
          return { success: false, reason: "EXPIRED_OR_INVALID" };
        }

        // Prevent another Telegram account from claiming without explicit flow
        const [existingTelegramStudent] = await tx
          .select()
          .from(students)
          .where(eq(students.telegramUserId, telegramUserId));

        if (existingTelegramStudent && existingTelegramStudent.id !== tokenRecord.studentId) {
          return { success: false, reason: "ALREADY_LINKED_TO_OTHER" };
        }

        // Atomically mark token used
        await tx
          .update(telegramLinkTokens)
          .set({ usedAt: new Date() })
          .where(eq(telegramLinkTokens.id, tokenRecord.id));

        // Atomically link student
        const [updatedStudent] = await tx
          .update(students)
          .set({
            telegramUserId,
            telegramUsername,
            telegramLinkedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(students.id, tokenRecord.studentId))
          .returning();

        // Audit log
        await tx.insert(auditLogs).values({
          action: "TELEGRAM_ACCOUNT_LINKED",
          entityType: "STUDENT",
          entityId: updatedStudent.id,
          safeMetadata: {
            telegramUserId,
            academicNumber: updatedStudent.academicNumber,
          },
        });

        return { success: true, student: updatedStudent };
      });

      if (!result.success) {
        if (result.reason === "EXPIRED_OR_INVALID") {
          await this.sendMessage(
            telegramUserId,
            `<b>[تنبيه]</b> عذراً، رابط الربط غير صالح أو انتهت صلاحيته.\n\nيرجى الدخول إلى صفحة حسابك في المنصة والضغط على إعادة إنشاء رابط الربط.`
          );
        } else if (result.reason === "ALREADY_LINKED_TO_OTHER") {
          await this.sendMessage(
            telegramUserId,
            `<b>[تنبيه]</b> حساب التيليجرام هذا مرتبط بالفعل بطالب آخر في النظام.`
          );
        }
        return { handled: true, success: false };
      }

      // Success confirmation message to student with exact schedule and venue
      const student = result.student!;

      // Fetch section, group, and official schedule
      const [studentAcademic] = await db
        .select({
          groupName: groups.name,
          sectionName: sections.name,
        })
        .from(students)
        .innerJoin(groups, eq(students.groupId, groups.id))
        .innerJoin(sections, eq(students.sectionId, sections.id))
        .where(eq(students.id, student.id));

      const [schedule] = await db
        .select()
        .from(sectionSchedules)
        .where(
          and(
            eq(sectionSchedules.sectionId, student.sectionId),
            sql`(${sectionSchedules.subSection} = ${student.subSection || "A"} OR ${sectionSchedules.subSection} = 'ALL')`
          )
        )
        .orderBy(desc(sectionSchedules.date))
        .limit(1);

      const subSectionLabel = schedule?.subSection === "ALL" 
        ? "لجميع طلاب السكشن" 
        : `المخصص لطلاب (قسم ${schedule?.subSection || student.subSection || "A"})`;

      const scheduleDetails = schedule
        ? `<b>الموعد المخصص لسكشنك:</b> ${schedule.date} (من ${schedule.startTime} حتى ${schedule.endTime}) — <i>${subSectionLabel}</i>`
        : `<b>الموعد المخصص لسكشنك:</b> وفق المواعيد المقررة (من 09:00 صباحاً حتى 02:00 ظهراً)`;

      const venueDetails = schedule?.notes
        ? schedule.notes
        : `الواحة — مبنى الشؤون (شباك بصمة الوجه)`;

      const confirmationText = `<b>[جامعة برج العرب التكنولوجية - BATU]</b>\nقسم تكنولوجيا المعلومات — نظام بصمة الوجه\n\n<b>تم توثيق وربط حسابك بنجاح</b>\n\n<b>اسم الطالب:</b> ${student.fullName}\n<b>الرقم الأكاديمي:</b> ${student.academicNumber}\n<b>المجموعة:</b> ${studentAcademic?.groupName || "المجموعة المحددة"}\n<b>السكشن:</b> ${studentAcademic?.sectionName || "السكشن المحدد"} (قسم ${student.subSection || "A"})\n\n${scheduleDetails}\n\n<b>المقر والمكان بالتفصيل:</b>\n${venueDetails}\n\n<b>تعليمات هامة:</b>\n• يرجى إحضار بطاقة الرقم القومي الأصلية والكارنيه الجامعي.\n• فور قيام الإدارة بفتح باب حجز الأدوار لسكشنك، ستصلك رسالة فورية هنا للدخول وحجز رقم دورك في الطابور!`;

      await this.sendMessage(telegramUserId, confirmationText);
      return { handled: true, success: true, studentId: student.id };
    }

    // Check for /status command
    if (text.startsWith("/status")) {
      const [student] = await db
        .select()
        .from(students)
        .where(eq(students.telegramUserId, telegramUserId));

      if (!student) {
        await this.sendMessage(
          telegramUserId,
          `<b>[تنبيه]</b> حسابك غير مرتبط بعد.\nيرجى الدخول للمنصة الإلكترونية والضغط على «ربط حساب التيليجرام» أولاً.`
        );
        return { handled: true, statusSent: false };
      }

      // Query active booking
      const [activeBooking] = await db
        .select({
          booking: bookings,
          window: bookingWindows,
        })
        .from(bookings)
        .innerJoin(bookingWindows, eq(bookings.bookingWindowId, bookingWindows.id))
        .where(
          and(
            eq(bookings.studentId, student.id),
            eq(bookings.status, "WAITING")
          )
        );

      if (!activeBooking) {
        await this.sendMessage(
          telegramUserId,
          `مرحباً <b>${student.fullName}</b>، ليس لديك حجز نشط حالياً.\n\nيرجى الدخول لصفحة الحجز بالمنصة لحجز دور جديد.`
        );
        return { handled: true, statusSent: true };
      }

      const deskName = activeBooking.booking.desk || "T";

      // Count students ahead in this specific desk among active open windows
      const [aheadCount] = await db
        .select({
          count: sql<number>`count(*)::int`,
        })
        .from(bookings)
        .innerJoin(bookingWindows, eq(bookings.bookingWindowId, bookingWindows.id))
        .where(
          and(
            eq(bookingWindows.status, BOOKING_WINDOW_STATUSES.OPEN),
            sql`${bookings.status} IN ('WAITING', 'CALLED', 'IN_PROGRESS')`,
            eq(bookings.desk, deskName),
            sql`${bookings.queueNumber} < ${activeBooking.booking.queueNumber}`
          )
        );

      const countAhead = Number(aheadCount?.count || 0);
      const currentTurn = countAhead + 1;
      const formattedCurrentTurn = String(currentTurn).padStart(3, "0");
      const rawTicket = activeBooking.booking.ticketNumber || activeBooking.booking.queueNumber;
      const formattedTicketNum = String(rawTicket).padStart(3, "0");
      const isFirstTen = currentTurn <= 10;

      const statusMsg = isFirstTen
        ? `<b>[جامعة برج العرب التكنولوجية - BATU]</b>
قسم تكنولوجيا المعلومات — نظام بصمة الوجه

<b>الطالب:</b> ${student.fullName}
<b>الرقم الأكاديمي:</b> <code>${student.academicNumber}</code>
<b>الشباك المخصص:</b> <code>شباك ${deskName}</code>
<b>دورك الحالي في الطابور الآن:</b> <code>#${formattedCurrentTurn}</code>
<b>رقم التذكرة عند الحجز:</b> <code>#${formattedTicketNum}</code>
<b>المتبقي قبلك في الانتظار:</b> ${countAhead === 0 ? "أنت التالي الآن!" : `${countAhead} طلاب`}

<b>تنبيه عاجل:</b>
أنت من <b>أول 10 طلاب</b> في الطابور المتحرك!
<b>يرجى التوجه فوراً الآن إلى شباك ${deskName} (الواحة — مبنى الشؤون) لعمل بصمة الوجه.</b>`
        : `<b>[جامعة برج العرب التكنولوجية - BATU]</b>
قسم تكنولوجيا المعلومات — نظام بصمة الوجه

<b>الطالب:</b> ${student.fullName}
<b>الرقم الأكاديمي:</b> <code>${student.academicNumber}</code>
<b>الشباك المخصص:</b> <code>شباك ${deskName}</code>
<b>دورك الحالي في الطابور الآن:</b> <code>#${formattedCurrentTurn}</code>
<b>رقم التذكرة عند الحجز:</b> <code>#${formattedTicketNum}</code>
<b>المتبقي قبلك في الانتظار:</b> ${countAhead} طلاب

<b>المقر:</b> الواحة — مبنى الشؤون (شباك ${deskName})
<b>طابور حي ومتحرك:</b> يتقدم رقم دورك تلقائياً للأمام مع انتهاء كل دور يسبقك. ستصلك رسالة تنبيهية فور وصول المتبقي أمامك إلى 10 طلاب للاستعداد والتوجه لشباك ${deskName}.`;

      await this.sendMessage(telegramUserId, statusMsg);
      return { handled: true, statusSent: true };
    }

    // Check for /help command
    if (text.startsWith("/help")) {
      await this.sendMessage(
        telegramUserId,
        `<b>[أوامر بوت بصمة الوجه — جامعة برج العرب التكنولوجية]</b>\n\n• /status - معرفة رقم دورك وعدد الطلاب أمامك في الطابور ومكانك\n• /help - عرض قائمة المساعدة والتعليمات\n\nلأي استفسار أو مشكلة، يرجى التوجه لمقر قسم تكنولوجيا المعلومات.`
      );
      return { handled: true, helpSent: true };
    }

    // Try to handle as a rating reply or issue report
    const [studentForRating] = await db
      .select({ id: students.id, fullName: students.fullName })
      .from(students)
      .where(eq(students.telegramUserId, telegramUserId));

    if (studentForRating) {
      // 1. Check if student is responding to an issue prompt (after tapping "واجهت مشكلة؟" or typing مشكلة)
      const pendingIssue = TelegramService.pendingIssues.get(telegramUserId);
      const isReplyToIssuePrompt = message.reply_to_message?.text?.includes("الإبلاغ عن مشكلة");
      const hasIssuePrefix = text.startsWith("مشكلة:") || text.startsWith("مشكلة ");

      if (
        (pendingIssue && Date.now() - pendingIssue.timestamp < 15 * 60 * 1000) ||
        isReplyToIssuePrompt ||
        hasIssuePrefix
      ) {
        const campaignId = pendingIssue?.campaignId || null;
        let issueContent = text;
        if (hasIssuePrefix) {
          issueContent = text.replace(/^مشكلة[:：]?\s*/, "").trim();
        }

        if (issueContent.length > 0) {
          await db.insert(feedbackRatings).values({
            studentId: studentForRating.id,
            rating: 1, // Default rating for reported issues
            message: issueContent,
            type: "ISSUE",
            requestCampaignId: campaignId,
            telegramMessageId: message.message_id || null,
          });

          TelegramService.pendingIssues.delete(telegramUserId);

          const responseText = `<b>[جامعة برج العرب التكنولوجية - BATU]</b>
قسم تكنولوجيا المعلومات — نظام بصمة الوجه

✅ <b>تم استلام المشكلة وإرسالها لإدارة المنظومة بنجاح!</b>
تفاصيل البلاغ:
<i>"${issueContent}"</i>

<b>شكراً لاستخدامك منصة البصمة 🙏</b>
سيتم مراجعة المشكلة والعمل على حلها فوراً.`;

          await this.sendMessage(telegramUserId, responseText);
          return { handled: true, issueSaved: true };
        }
      }

      // 2. Check if student is adding an optional follow-up comment to a star rating just submitted
      const pendingComment = TelegramService.pendingComments.get(telegramUserId);
      if (pendingComment && Date.now() - pendingComment.timestamp < 15 * 60 * 1000) {
        await db
          .update(feedbackRatings)
          .set({ message: text })
          .where(eq(feedbackRatings.id, pendingComment.ratingId));

        TelegramService.pendingComments.delete(telegramUserId);

        const confirmCommentMsg = `<b>[جامعة برج العرب التكنولوجية - BATU]</b>
قسم تكنولوجيا المعلومات — نظام بصمة الوجه

✅ <b>تم حفظ ملاحظاتك وإضافتها لتقييمك بنجاح!</b>
<i>"${text}"</i>

<b>شكراً لاستخدامك منصة البصمة 🙏</b>`;

        await this.sendMessage(telegramUserId, confirmCommentMsg);
        return { handled: true, commentSaved: true };
      }

      // 3. Fallback: Parse manual text ratings (e.g. "5 ممتاز")
      const replyToMessageText = message.reply_to_message?.text || null;
      const ratingResult = await this.handleRatingReply(
        telegramUserId,
        text,
        studentForRating,
        replyToMessageText
      );
      if (ratingResult.handled) {
        return { handled: true, ratingSaved: true, rating: ratingResult.rating };
      }
    }

    return { handled: true, unhandledCommand: true };
  }

  /**
   * Parse and store a student rating reply from Telegram.
   * Looks for a number (1-5) or 'مشكلة: <text>' format.
   * Returns whether a rating was stored.
   */
  static async handleRatingReply(
    telegramUserId: number,
    text: string,
    student: { id: string; fullName: string },
    replyToMessageText?: string
  ): Promise<{ handled: boolean; rating?: number }> {
    // Extract campaign ID from the message being replied to
    let campaignId: string | null = null;
    if (replyToMessageText) {
      const campaignMatch = replyToMessageText.match(/campaign:([a-f0-9-]{36})/);
      if (campaignMatch) campaignId = campaignMatch[1];
    }

    // Parse rating number
    const trimmed = text.trim();
    let ratingNum: number | null = null;
    let message: string | null = null;
    let type: "SERVICE" | "ISSUE" = "SERVICE";

    // Check for 'مشكلة: <text>' pattern
    const issueMatch = trimmed.match(/^مشكلة[:：]?\s*(.+)/s);
    if (issueMatch) {
      type = "ISSUE";
      message = issueMatch[1].trim();
      // Default to 1 star for reported issues
      ratingNum = 1;
    } else {
      // Matches "5", "5 ممتاز جدا", "4 نجوم - سريع جدا", "5: شكرا", etc.
      const ratingWithMsgMatch = trimmed.match(/^([1-5])(?:\s*(?:نجوم?|stars?))?(?:\s*[-–—:\s]\s*|\s+|$)(.*)$/s);
      if (ratingWithMsgMatch) {
        ratingNum = parseInt(ratingWithMsgMatch[1], 10);
        const optionalComment = ratingWithMsgMatch[2]?.trim();
        if (optionalComment && optionalComment.length > 0) {
          message = optionalComment;
        }
      }
    }

    if (ratingNum === null) {
      return { handled: false };
    }

    // Save rating
    await db.insert(feedbackRatings).values({
      studentId: student.id,
      rating: ratingNum,
      message,
      type,
      requestCampaignId: campaignId,
    });

    // Send confirmation
    const stars = "⭐".repeat(ratingNum);
    const typeLabel = type === "ISSUE" ? "بلاغ مشكلة" : "تقييم خدمة";
    const confirmText = `<b>[جامعة برج العرب التكنولوجية - BATU]</b>\n\n<b>شكراً لتقييمك! ${stars}</b>\n\nتم تسجيل ${typeLabel} بنجاح.${message ? `\n\n<i>"${message}"</i>` : ""}\n\nآراؤكم تساعدنا على تحسين الخدمة 🙏`;
    await this.sendMessage(telegramUserId, confirmText);

    return { handled: true, rating: ratingNum };
  }

  /**
   * Handle user interaction with inline keyboard buttons (stars 1-5 or issue report)
   */
  static async handleCallbackQuery(cq: any) {
    const callbackQueryId = cq.id;
    const data = (cq.data || "").trim();
    const telegramUserId = cq.from?.id;
    const messageId = cq.message?.message_id;
    const chatId = cq.message?.chat?.id || telegramUserId;

    if (!telegramUserId) {
      if (callbackQueryId) await this.answerCallbackQuery(callbackQueryId);
      return { handled: true, ignored: true };
    }

    // Lookup student
    const [student] = await db
      .select({ id: students.id, fullName: students.fullName, academicNumber: students.academicNumber })
      .from(students)
      .where(eq(students.telegramUserId, telegramUserId));

    if (!student) {
      await this.answerCallbackQuery(callbackQueryId, "عفواً، الحساب غير مسجل بالمنظومة", true);
      return { handled: true, studentNotFound: true };
    }

    // Case 1: Star Rating (rate:1:campaignId ... rate:5:campaignId)
    if (data.startsWith("rate:")) {
      const parts = data.split(":");
      const ratingNum = parseInt(parts[1], 10);
      const rawCampaign = parts[2] || "";
      const campaignId = rawCampaign && rawCampaign !== "none" ? rawCampaign : null;

      if (ratingNum >= 1 && ratingNum <= 5) {
        const [savedRating] = await db
          .insert(feedbackRatings)
          .values({
            studentId: student.id,
            rating: ratingNum,
            type: "SERVICE",
            requestCampaignId: campaignId,
            telegramMessageId: messageId || null,
          })
          .returning();

        // Track pending comment so if they send a text next, it attaches to this rating
        TelegramService.pendingComments.set(telegramUserId, {
          ratingId: savedRating.id,
          campaignId,
          timestamp: Date.now(),
        });

        const stars = "⭐".repeat(ratingNum);
        await this.answerCallbackQuery(callbackQueryId, `تم تسجيل تقييمك: ${stars} بنجاح!`);

        if (chatId && messageId) {
          const confirmationText = `<b>[جامعة برج العرب التكنولوجية - BATU]</b>
قسم تكنولوجيا المعلومات — نظام بصمة الوجه

✅ <b>تم تسجيل تقييمك بنجاح!</b> ${stars} (${ratingNum} من 5)

<b>شكراً لاستخدامك منصة البصمة 🙏</b>
رأيك يهمنا ويساعدنا دائماً في تقديم أفضل خدمة.

<i>(إذا كان لديك أي تعليق أو ملاحظة إضافية، يمكنك كتابتها وإرسالها في رسالة الآن وسنضيفها إلى تقييمك).</i>`;

          await this.editMessageText(chatId, messageId, confirmationText, "HTML", {
            inline_keyboard: [],
          });
        }

        return { handled: true, ratingSaved: true, rating: ratingNum };
      }
    }

    // Case 2: Report an Issue (issue:campaignId)
    if (data.startsWith("issue:")) {
      const rawCampaign = data.split(":")[1] || "";
      const campaignId = rawCampaign && rawCampaign !== "none" ? rawCampaign : null;

      TelegramService.pendingIssues.set(telegramUserId, {
        campaignId,
        timestamp: Date.now(),
      });

      await this.answerCallbackQuery(callbackQueryId);

      const issuePrompt = `<b>[جامعة برج العرب التكنولوجية - BATU]</b>
⚠️ <b>الإبلاغ عن مشكلة في المنظومة:</b>

يرجى كتابة المشكلة التي واجهتك بشكل واضح في ردك على هذه الرسالة الآن، وسيقوم فريق الدعم بمتابعتها فوراً في صفحة التقييمات.

<i>(اكتب وصف المشكلة وأرسله في رسالة الآن 👇)</i>`;

      await this.sendMessage(chatId, issuePrompt, "HTML", {
        force_reply: true,
        selective: true,
      });

      return { handled: true, issuePromptSent: true };
    }

    await this.answerCallbackQuery(callbackQueryId);
    return { handled: true };
  }
}
