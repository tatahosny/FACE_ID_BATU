import { NextRequest } from "next/server";
import { db } from "@/db";
import { bookingWindows, sections, groups, students, bookings, notificationOutbox } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireRole } from "@/lib/security/auth";
import { USER_ROLES } from "@/lib/constants/statuses";
import { updateBookingWindowStatusSchema } from "@/lib/validation/booking";
import { apiError, apiSuccess } from "@/lib/utils/response";
import { BookingService } from "@/server/services/booking.service";
import { NotificationService } from "@/server/services/notification.service";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await requireRole([USER_ROLES.SUPER_ADMIN]);
    const windowId = params.id;

    const body = await req.json();
    const parsed = updateBookingWindowStatusSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.errors[0].message, 400);
    }

    // 1. Reset Tickets Action
    if (parsed.data.action === "RESET_TICKETS" || body.resetTickets === true) {
      const result = await BookingService.resetDayQueuesAndNotify({
        windowIds: [windowId],
        adminUserId: session.userId,
      });

      return apiSuccess(
        result,
        `تمت إعادة تعيين أرقام التذاكر لتبدأ من 1 بنجاح، وإشعار الطلاب المتبقين في الطابور (${result.notifiedCount} طالب) بحالة الحجز.`
      );
    }

    // 2. Regular Status Update (OPEN, PAUSED, CLOSED, DRAFT)
    if (!parsed.data.status) {
      return apiError("حالة فترة الحجز مطلوبة", 400);
    }

    const updateFields: Record<string, any> = {
      status: parsed.data.status,
      updatedAt: new Date(),
    };

    if (parsed.data.subSection) {
      updateFields.subSection = parsed.data.subSection;
    }

    if (parsed.data.status === "OPEN") {
      updateFields.startsAt = new Date(Date.now() - 3600000);
      updateFields.endsAt = new Date(Date.now() + 86400000 * 30);
      if (body.latitude !== undefined && body.longitude !== undefined && body.latitude !== null && body.longitude !== null) {
        updateFields.openLatitude = String(body.latitude);
        updateFields.openLongitude = String(body.longitude);
      }
    }

    const [updated] = await db
      .update(bookingWindows)
      .set(updateFields)
      .where(eq(bookingWindows.id, windowId))
      .returning();

    if (!updated) {
      return apiError("فترة الحجز غير موجودة", 404);
    }

    // Fetch section details and registered students for Telegram broadcasting
    const [sec] = await db
      .select({
        sectionName: sections.name,
        groupName: groups.name,
        academicYear: groups.academicYear,
        specialization: groups.specialization,
      })
      .from(sections)
      .innerJoin(groups, eq(sections.groupId, groups.id))
      .where(eq(sections.id, updated.sectionId));

    const studentConditions = [
      eq(students.sectionId, updated.sectionId),
      sql`${students.telegramUserId} IS NOT NULL`,
    ];

    if (updated.subSection && updated.subSection !== "ALL") {
      studentConditions.push(eq(students.subSection, updated.subSection));
    }

    const sectionStudents = await db
      .select({
        id: students.id,
        fullName: students.fullName,
        academicNumber: students.academicNumber,
        academicYear: students.academicYear,
        specialization: students.specialization,
        subSection: students.subSection,
        telegramUserId: students.telegramUserId,
      })
      .from(students)
      .where(and(...studentConditions));

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://face-id-batu-hvk9.vercel.app";
    const subSectionText =
      updated.subSection === "A"
        ? " (قسم A فقط)"
        : updated.subSection === "B"
        ? " (قسم B فقط)"
        : " (قسمي A و B)";

    const subSecLabel =
      updated.subSection === "A"
        ? "قسم A فقط"
        : updated.subSection === "B"
        ? "قسم B فقط"
        : "قسمي A و B معاً";

    let queuedTelegramCount = 0;

    // 1. If opened, broadcast Telegram opening notification via reliable outbox queue
    if (parsed.data.status === "OPEN") {
      const openRows = [];
      for (const st of sectionStudents) {
        if (!st.telegramUserId) continue;

        const acadYear = sec?.academicYear || st.academicYear || "الفرقة الثالثة";
        const specText = (sec?.specialization || st.specialization)
          ? `\n📌 <b>الشعبة التخصصية:</b> ${sec?.specialization || st.specialization}`
          : "";

        const openMsg = `<b>🏛️ جامعة برج العرب التكنولوجية (BATU)</b>\n<b>نظام حجز بصمة الوجه وإدارة الطابور الذكي</b>\n\n📢 <b>تم فتح باب حجز دور البصمة للسكشن الخاص بك الآن!</b>\n\n👤 <b>عزيزي الطالب:</b> ${st.fullName}\n🆔 <b>الرقم الأكاديمي:</b> <code>${st.academicNumber}</code>\n🎓 <b>الفرقة الدراسية:</b> ${acadYear}${specText}\n👥 <b>المجموعة:</b> ${sec?.groupName || "المجموعة"}\n🔢 <b>السكشن:</b> ${sec?.sectionName || "السكشن الأكاديمي"}\n🎯 <b>القسم المسموح له بالحجز:</b> ${subSecLabel}\n\n📍 <b>المقر:</b> مبنى المعامل ب الواحة الدور الاول علوى يمين (شباك بصمة الوجه)\n\n🎟️ <b>احجز رقم دورك في الطابور الآن فوراً:</b>\n👉 <a href="${appUrl}/booking">${appUrl}/booking</a>\n\n<i>يرجى الدخول فوراً عبر الرابط أعلاه بالرقم الأكاديمي لحجز تذكرتك قبل اكتمال السعة المحددة.</i>`;

        const idempotencyKey = `window_open_${updated.id}_${st.id}_${Date.now()}`;
        openRows.push({
          eventType: "WINDOW_OPENED",
          recipientId: st.id,
          telegramChatId: st.telegramUserId,
          payload: {
            studentName: st.fullName,
            academicNumber: st.academicNumber,
            academicYear: acadYear,
            specialization: sec?.specialization || st.specialization,
            sectionName: `${sec?.sectionName || ""}${subSectionText} (${sec?.groupName || ""})`,
            bookingUrl: `${appUrl}/booking`,
            message: openMsg,
          },
          idempotencyKey,
          status: "PENDING",
        });
      }

      if (openRows.length > 0) {
        await db.insert(notificationOutbox).values(openRows).onConflictDoNothing();
        queuedTelegramCount = openRows.length;
        NotificationService.triggerBackgroundWorker();
      }
    }

    // 2. If paused or closed, broadcast Telegram close/pause notice via reliable outbox queue
    if (parsed.data.status === "PAUSED" || parsed.data.status === "CLOSED") {
      const isPaused = parsed.data.status === "PAUSED";
      const statusTitle = isPaused ? "⏸️ تنبيه إيقاف مؤقت لحجز دور البصمة" : "⛔ إغلاق باب حجز دور البصمة";
      const statusAction = isPaused ? "إيقاف حجز دور البصمة لسكشنكم مؤقتاً" : "إغلاق باب حجز دور البصمة لسكشنكم";

      const closeRows = [];
      for (const st of sectionStudents) {
        if (!st.telegramUserId) continue;

        const acadYear = sec?.academicYear || st.academicYear || "الفرقة الثالثة";
        const specText = (sec?.specialization || st.specialization)
          ? `\n📌 <b>الشعبة التخصصية:</b> ${sec?.specialization || st.specialization}`
          : "";

        const closeMsg = `<b>🏛️ جامعة برج العرب التكنولوجية (BATU)</b>\n<b>نظام حجز بصمة الوجه وإدارة الطابور الذكي</b>\n\n${statusTitle}\n\n👤 <b>عزيزي الطالب:</b> ${st.fullName}\n🆔 <b>الرقم الأكاديمي:</b> <code>${st.academicNumber}</code>\n🎓 <b>الفرقة الدراسية:</b> ${acadYear}${specText}\n👥 <b>المجموعة:</b> ${sec?.groupName || "المجموعة"}\n🔢 <b>السكشن:</b> ${sec?.sectionName || "السكشن الأكاديمي"}\n🎯 <b>القسم:</b> ${subSecLabel}\n\nنحيطكم علماً بأنه قد <b>تم ${statusAction}</b> في الوقت الحالي بناءً على تعليمات إدارة الكلية.\n\n🔔 <b>ستصلكم رسالة فورية عبر التيليجرام فور إعادة فتح الحجز لسكشنكم مرة أخرى.</b>`;

        const idempotencyKey = `window_${isPaused ? "pause" : "close"}_${updated.id}_${st.id}_${Date.now()}`;
        closeRows.push({
          eventType: isPaused ? "WINDOW_PAUSED" : "WINDOW_CLOSED",
          recipientId: st.id,
          telegramChatId: st.telegramUserId,
          payload: {
            studentName: st.fullName,
            academicNumber: st.academicNumber,
            academicYear: acadYear,
            specialization: sec?.specialization || st.specialization,
            sectionName: `${sec?.sectionName || ""}${subSectionText} (${sec?.groupName || ""})`,
            message: closeMsg,
          },
          idempotencyKey,
          status: "PENDING",
        });
      }

      if (closeRows.length > 0) {
        await db.insert(notificationOutbox).values(closeRows).onConflictDoNothing();
        queuedTelegramCount = closeRows.length;
        NotificationService.triggerBackgroundWorker();
      }
    }

    let successMsg = "تم تحديث حالة فترة الحجز بنجاح";
    if (parsed.data.status === "OPEN") {
      successMsg = `تم فتح فترة الحجز بنجاح لـ ${sec?.sectionName || "السكشن"}${subSectionText} وجدولة الإشعارات لـ ${queuedTelegramCount} طالب في طابور الإرسال التلقائي`;
    } else if (parsed.data.status === "PAUSED" || parsed.data.status === "CLOSED") {
      successMsg = `تم إيقاف حجز ${sec?.sectionName || "السكشن"}${subSectionText} بنجاح وجدولة إشعارات الإيقاف`;
    }

    return apiSuccess({ window: updated, notifiedCount: queuedTelegramCount }, successMsg);
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح: هذه العملية متاحة لمدير النظام فقط", 403);
    }
    return apiError(error.message || "فشل تحديث فترة الحجز", 400);
  }
}
