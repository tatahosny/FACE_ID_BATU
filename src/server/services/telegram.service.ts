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
    if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
      console.warn("[TelegramService] TELEGRAM_BOT_TOKEN is not configured.");
    }
    return "";
  }
  return token;
}

const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || "batu_face_id_bot";

function getTelegramApiBase(): string {
  const token = getTelegramBotToken();
  return `https://api.telegram.org/bot${token}`;
}

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

      const response = await fetch(`${getTelegramApiBase()}/sendMessage`, {
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
      await fetch(`${getTelegramApiBase()}/answerCallbackQuery`, {
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
      if (replyMarkup !== undefined) {
        payload.reply_markup = replyMarkup;
      }
      const response = await fetch(`${getTelegramApiBase()}/editMessageText`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok && !data.description?.includes("message is not modified")) {
        console.warn("[TelegramService] editMessageText returned non-ok:", data.description);
      }
      return data;
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

      // Check if booking window is open right now for student's section and subsection
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.APP_URL ||
        "https://face-id-batu-hvk9.vercel.app";

      const nowIso = new Date().toISOString();
      const candidateWindows = await db
        .select()
        .from(bookingWindows)
        .where(
          and(
            eq(bookingWindows.sectionId, student.sectionId),
            eq(bookingWindows.status, BOOKING_WINDOW_STATUSES.OPEN),
            sql`${bookingWindows.startsAt} <= ${nowIso}`,
            sql`${bookingWindows.endsAt} >= ${nowIso}`
          )
        )
        .orderBy(desc(bookingWindows.createdAt));

      const openWindow = candidateWindows.find(
        (w) => w.subSection === "ALL" || w.subSection === (student.subSection || "A")
      );
      const isBookingOpen = !!openWindow;

      let bookingStatusSection = "";
      let replyMarkup: any = undefined;

      if (isBookingOpen) {
        bookingStatusSection = `🟢 <b>حالة الحجز الآن: [مفتوح]</b>\nباب حجز الأدوار مفتوح حالياً لسكشنك وقسمك (${student.subSection || "A"})!\nيمكنك الآن الدخول وحجز رقم دورك في الطابور مباشرة عبر الرابط التالي:\n🔗 <a href="${appUrl}/booking">${appUrl}/booking</a>`;
        replyMarkup = {
          inline_keyboard: [
            [
              {
                text: "🎫 اضغط هنا لحجز دورك الآن",
                url: `${appUrl}/booking`,
              },
            ],
            [
              {
                text: "📅 استعراض جدول المواعيد",
                url: `${appUrl}/schedules`,
              },
            ],
          ],
        };
      } else {
        bookingStatusSection = `🔴 <b>حالة الحجز الآن: [مغلق حالياً]</b>\nباب حجز الأدوار مقفول حالياً لسكشنك (أو لم تبدأ فترته بعد).\n⚠️ <b>يرجى الانتباه ومتابعة رسائل التيليجرام هنا</b>، حيث ستصلك رسالة تنبيهية فور قيام الإدارة بفتح باب الحجز، مع ضرورة اتباع الجدول المعتمد والالتزام بموعدك.\n🔗 <b>رابط صفحة جدول المواعيد الرسمي:</b>\n<a href="${appUrl}/schedules">${appUrl}/schedules</a>`;
        replyMarkup = {
          inline_keyboard: [
            [
              {
                text: "📅 اضغط هنا لاستعراض جدول المواعيد الرسمي",
                url: `${appUrl}/schedules`,
              },
            ],
          ],
        };
      }

      const confirmationText = `<b>[جامعة برج العرب التكنولوجية - BATU]</b>
قسم تكنولوجيا المعلومات — نظام بصمة الوجه

✅ <b>تم تسجيل بياناتك الأكاديمية بنجاح فقط</b>

⚠️ <b>تنبيه هام:</b> أنت الآن قمت <b>بتسجيل بياناتك فقط</b> ولم يتم حجز رقم دور في الطابور بعد.

<b>اسم الطالب:</b> ${student.fullName}
<b>الرقم الأكاديمي:</b> <code>${student.academicNumber}</code>
<b>المجموعة:</b> ${studentAcademic?.groupName || "المجموعة المحددة"}
<b>السكشن:</b> ${studentAcademic?.sectionName || "السكشن المحدد"} (قسم ${student.subSection || "A"})

${scheduleDetails}

<b>المقر والمكان بالتفصيل:</b>
${venueDetails}

━━━━━━━━━━━━━━━━━━━━
${bookingStatusSection}
━━━━━━━━━━━━━━━━━━━━

<b>تعليمات هامة:</b>
• يرجى إحضار أصل بطاقة الرقم القومي والكارنيه الجامعي.
• لا تتوجه لشباك البصمة إلا بعد إتمام حجز دورك واستلام إشعار ندائك في الطابور.`;

      await this.sendMessage(telegramUserId, confirmationText, "HTML", replyMarkup);
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
          // Check if an existing rating/issue is already registered
          const [existingFeedback] = await db
            .select({ id: feedbackRatings.id })
            .from(feedbackRatings)
            .where(
              campaignId
                ? and(
                    eq(feedbackRatings.studentId, studentForRating.id),
                    eq(feedbackRatings.requestCampaignId, campaignId)
                  )
                : eq(feedbackRatings.studentId, studentForRating.id)
            )
            .limit(1);

          if (existingFeedback) {
            await db
              .update(feedbackRatings)
              .set({
                message: issueContent,
                type: "ISSUE",
              })
              .where(eq(feedbackRatings.id, existingFeedback.id));

            TelegramService.pendingIssues.delete(telegramUserId);

            const responseText = `<b>[جامعة برج العرب التكنولوجية - BATU]</b>
قسم تكنولوجيا المعلومات — نظام بصمة الوجه

✅ <b>تم تحديث بلاغك بالملاحظات الجديدة بنجاح!</b>
تفاصيل البلاغ:
<i>"${issueContent}"</i>

<b>شكراً لاستخدامك منصة البصمة 🙏</b>
سيتم مراجعة المشكلة والعمل على حلها فوراً.`;

            await this.sendMessage(telegramUserId, responseText);
            return { handled: true, issueUpdated: true };
          }

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
  ): Promise<{ handled: boolean; rating?: number; alreadyRated?: boolean }> {
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

    // Check if student already rated for this campaign or system
    const [existingRating] = await db
      .select({ id: feedbackRatings.id, rating: feedbackRatings.rating })
      .from(feedbackRatings)
      .where(
        campaignId
          ? and(
              eq(feedbackRatings.studentId, student.id),
              eq(feedbackRatings.requestCampaignId, campaignId)
            )
          : eq(feedbackRatings.studentId, student.id)
      )
      .limit(1);

    if (existingRating) {
      const stars = "⭐".repeat(existingRating.rating);
      await this.sendMessage(
        telegramUserId,
        `<b>[جامعة برج العرب التكنولوجية - BATU]</b>\n\n✅ <b>لقد قمت بتسجيل تقييمك مسبقاً! ${stars}</b>\n\nشكراً لمشاركتك رأيك، ولا يمكن تسجيل التقييم أكثر من مرة 🙏`
      );
      return { handled: true, alreadyRated: true, rating: existingRating.rating };
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

    // Parse callback data: support both rate:1:campaignId, rate:campaignId:1, rate:campaignId:issue, issue:campaignId
    let isIssue = false;
    let ratingNum: number | null = null;
    let campaignId: string | null = null;

    if (data.startsWith("issue:")) {
      isIssue = true;
      const raw = data.slice("issue:".length).trim();
      campaignId = raw && raw !== "none" ? raw : null;
    } else if (data.startsWith("rate:")) {
      const parts = data.split(":");
      if (parts[1] === "issue" || parts[2] === "issue") {
        isIssue = true;
        const raw = parts[1] === "issue" ? parts[2] : parts[1];
        campaignId = raw && raw !== "none" ? raw : null;
      } else {
        const num1 = parseInt(parts[1], 10);
        const num2 = parseInt(parts[2], 10);
        if (!isNaN(num1) && num1 >= 1 && num1 <= 5) {
          ratingNum = num1;
          const raw = parts[2] || "";
          campaignId = raw && raw !== "none" ? raw : null;
        } else if (!isNaN(num2) && num2 >= 1 && num2 <= 5) {
          ratingNum = num2;
          const raw = parts[1] || "";
          campaignId = raw && raw !== "none" ? raw : null;
        }
      }
    } else {
      await this.answerCallbackQuery(callbackQueryId);
      return { handled: true };
    }

    // 1. Strict Duplicate Check: Has this student already rated for this campaign (or in general)?
    const [existingRating] = await db
      .select({
        id: feedbackRatings.id,
        rating: feedbackRatings.rating,
        type: feedbackRatings.type,
        message: feedbackRatings.message,
      })
      .from(feedbackRatings)
      .where(
        campaignId
          ? and(
              eq(feedbackRatings.studentId, student.id),
              eq(feedbackRatings.requestCampaignId, campaignId)
            )
          : eq(feedbackRatings.studentId, student.id)
      )
      .limit(1);

    if (existingRating) {
      // Show Telegram alert modal so user immediately sees they already submitted
      await this.answerCallbackQuery(
        callbackQueryId,
        "لقد قمت بتسجيل تقييمك مسبقاً! شكراً لك 🙏",
        true
      );

      // Instantly remove inline keyboard buttons from Telegram chat
      if (chatId && messageId) {
        const stars = "⭐".repeat(existingRating.rating);
        const alreadyRatedText = `<b>[جامعة برج العرب التكنولوجية - BATU]</b>
قسم تكنولوجيا المعلومات — نظام بصمة الوجه

✅ <b>لقد قمت بتسجيل تقييمك مسبقاً!</b> ${stars} (${existingRating.rating} من 5)
${existingRating.message ? `\n<i>"${existingRating.message}"</i>\n` : ""}
<b>شكراً لمشاركتك رأيك، لا يمكن تكرار التقييم 🙏</b>
<i>(تم إغلاق أزرار التقييم لمنع تكرار التسجيل).</i>`;

        await this.editMessageText(chatId, messageId, alreadyRatedText, "HTML", {
          inline_keyboard: [],
        });
      }

      return { handled: true, alreadyRated: true };
    }

    // 2. Case: Report an Issue
    if (isIssue) {
      TelegramService.pendingIssues.set(telegramUserId, {
        campaignId,
        timestamp: Date.now(),
      });

      await this.answerCallbackQuery(callbackQueryId);

      // Disable/remove buttons from the original message so they cannot be clicked repeatedly
      if (chatId && messageId) {
        await this.editMessageText(
          chatId,
          messageId,
          `<b>[جامعة برج العرب التكنولوجية - BATU]</b>\nقسم تكنولوجيا المعلومات — نظام بصمة الوجه\n\n⚠️ <i>جارٍ تسجيل بلاغ عن مشكلة... يرجى كتابة التفاصيل في الرد بالأسفل.</i>`,
          "HTML",
          { inline_keyboard: [] }
        );
      }

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

    // 3. Case: Star Rating (1 to 5)
    if (ratingNum !== null && ratingNum >= 1 && ratingNum <= 5) {
      let savedRating: any;
      try {
        const [inserted] = await db
          .insert(feedbackRatings)
          .values({
            studentId: student.id,
            rating: ratingNum,
            type: "SERVICE",
            requestCampaignId: campaignId,
            telegramMessageId: messageId || null,
          })
          .returning();
        savedRating = inserted;
      } catch (err: any) {
        // Unique constraint violation in case of rapid concurrent clicks
        console.warn("[TelegramService] Duplicate rating insert prevented:", err.message);
        await this.answerCallbackQuery(callbackQueryId, "لقد قمت بتسجيل تقييمك مسبقاً!", true);

        if (chatId && messageId) {
          await this.editMessageText(
            chatId,
            messageId,
            `<b>[جامعة برج العرب التكنولوجية - BATU]</b>\nقسم تكنولوجيا المعلومات — نظام بصمة الوجه\n\n✅ <b>تم استلام تقييمك مسبقاً، شكراً لمشاركتك رأيك 🙏</b>`,
            "HTML",
            { inline_keyboard: [] }
          );
        }
        return { handled: true, alreadyRated: true };
      }

      // Track pending comment so if they send an optional text next, it attaches to this rating
      TelegramService.pendingComments.set(telegramUserId, {
        ratingId: savedRating.id,
        campaignId,
        timestamp: Date.now(),
      });

      const stars = "⭐".repeat(ratingNum);
      await this.answerCallbackQuery(callbackQueryId, `تم تسجيل تقييمك: ${stars} بنجاح!`);

      // Remove keyboard buttons and update text so buttons disappear from user client
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

    await this.answerCallbackQuery(callbackQueryId);
    return { handled: true };
  }
}
