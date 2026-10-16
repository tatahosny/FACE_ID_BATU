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
} from "@/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { hashToken, generateSecureToken } from "@/lib/security/crypto";
import { formatCairoDateTime } from "@/lib/utils/datetime";

const BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN || "8647667481:AAFATdXAHLuktMs2bzZpDRBghOUYEZfQOA4";
const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || "batu_face_id_bot";
const TELEGRAM_API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

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

  /**
   * Direct API call to send a message to a Telegram chat
   */
  static async sendMessage(chatId: number, text: string, parseMode = "HTML") {
    try {
      const response = await fetch(`${TELEGRAM_API_BASE}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: parseMode,
        }),
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
   * Process incoming Telegram webhook updates with idempotency and token validation
   */
  static async handleWebhookUpdate(update: any) {
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
        : `مبنى كلية تكنولوجيا الصناعة والطاقة — الطابق الأرضي — معمل الحاسب الآلي وتكنولوجيا المعلومات (شباك بصمة الوجه)`;

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

      // Count students ahead across all sections in unified queue
      const [aheadCount] = await db
        .select({
          count: sql<number>`count(*)::int`,
        })
        .from(bookings)
        .where(
          and(
            sql`${bookings.status} IN ('WAITING', 'CALLED', 'IN_PROGRESS')`,
            sql`${bookings.queueNumber} < ${activeBooking.booking.queueNumber}`
          )
        );

      const countAhead = Number(aheadCount?.count || 0);
      const currentTurn = countAhead + 1;
      const formattedCurrentTurn = String(currentTurn).padStart(3, "0");
      const formattedTicketNum = String(activeBooking.booking.queueNumber).padStart(3, "0");
      const isFirstTen = currentTurn <= 10;

      const statusMsg = isFirstTen
        ? `<b>[جامعة برج العرب التكنولوجية - BATU]</b>
قسم تكنولوجيا المعلومات — نظام بصمة الوجه

<b>الطالب:</b> ${student.fullName}
<b>الرقم الأكاديمي:</b> <code>${student.academicNumber}</code>
<b>دورك الحالي في الطابور الآن:</b> <code>#${formattedCurrentTurn}</code>
<b>رقم التذكرة عند الحجز:</b> <code>#${formattedTicketNum}</code>
<b>المتبقي قبلك في الانتظار:</b> ${countAhead === 0 ? "أنت التالي الآن!" : `${countAhead} طلاب`}

<b>تنبيه عاجل:</b>
أنت من <b>أول 10 طلاب</b> في الطابور المتحرك!
<b>يرجى التوجه فوراً الآن إلى مقر التسجيل (معمل الحاسب الآلي — الطابق الأرضي) لعمل بصمة الوجه.</b>`
        : `<b>[جامعة برج العرب التكنولوجية - BATU]</b>
قسم تكنولوجيا المعلومات — نظام بصمة الوجه

<b>الطالب:</b> ${student.fullName}
<b>الرقم الأكاديمي:</b> <code>${student.academicNumber}</code>
<b>دورك الحالي في الطابور الآن:</b> <code>#${formattedCurrentTurn}</code>
<b>رقم التذكرة عند الحجز:</b> <code>#${formattedTicketNum}</code>
<b>المتبقي قبلك في الانتظار:</b> ${countAhead} طلاب

<b>طابور حي ومتحرك:</b> يتقدم رقم دورك تلقائياً للأمام مع انتهاء كل دور يسبقك. ستصلك رسالة تنبيهية فور وصول المتبقي أمامك إلى 10 طلاب للاستعداد والحضور.`;

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

    return { handled: true, unhandledCommand: true };
  }
}
