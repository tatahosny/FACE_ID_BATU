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
      updateFields.startsAt = new Date(Date.now() - 60000);
      updateFields.endsAt = new Date(Date.now() + 86400000 * 7);
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

    let queuedTelegramCount = 0;

    // 1. If opened, broadcast Telegram opening notification via reliable outbox queue
    if (parsed.data.status === "OPEN") {
      for (const st of sectionStudents) {
        if (!st.telegramUserId) continue;
        const openMsg = `<b>جامعة برج العرب التكنولوجية (BATU)</b>\nقسم تكنولوجيا المعلومات — نظام بصمة الوجه\n\n<b>تم فتح حجز دور البصمة للسكشن الخاص بكم الآن!</b>\n\n<b>السكشن:</b> ${sec?.sectionName || "السكشن الأكاديمي"}${subSectionText} (${sec?.groupName || "المجموعة"})\n<b>عزيزي الطالب:</b> ${st.fullName}\n\n<b>المقر:</b> الواحة — مبنى الشؤون (شباك بصمة الوجه)\n\n<b>يمكنك الآن الدخول إلى المنصة وحجز رقم دورك فوراً:</b>\n<a href="${appUrl}/booking">${appUrl}/booking</a>\n\nيرجى الدخول فوراً لحجز دورك (سيتم تخصيص شباك T أو شباك D لك تلقائياً بالتناوب).`;

        const idempotencyKey = `window_open_${updated.id}_${st.id}_${Date.now()}`;
        await db
          .insert(notificationOutbox)
          .values({
            eventType: "WINDOW_OPENED",
            recipientId: st.id,
            telegramChatId: st.telegramUserId,
            payload: {
              studentName: st.fullName,
              sectionName: `${sec?.sectionName || ""}${subSectionText} (${sec?.groupName || ""})`,
              bookingUrl: `${appUrl}/booking`,
              message: openMsg,
            },
            idempotencyKey,
            status: "PENDING",
          })
          .onConflictDoNothing();

        queuedTelegramCount++;
      }
      NotificationService.triggerBackgroundWorker();
    }

    // 2. If paused or stopped, broadcast Telegram pause notice via reliable outbox queue
    if (parsed.data.status === "PAUSED" || parsed.data.status === "CLOSED") {
      for (const st of sectionStudents) {
        if (!st.telegramUserId) continue;
        const pauseMsg = `<b>جامعة برج العرب التكنولوجية (BATU)</b>\nقسم تكنولوجيا المعلومات — نظام بصمة الوجه\n\n<b>تنبيه إيقاف حجز دور البصمة:</b>\n\nأعزائنا طلاب <b>${sec?.sectionName || "السكشن الأكاديمي"}${subSectionText}</b> (${sec?.groupName || "المجموعة"})،\nنحيطكم علماً بأنه قد <b>تم إيقاف حجز دور البصمة لسكشنكم مؤقتاً لحين إشعار آخر بالفتح</b>.\n\nستصلكم رسالة فورية عبر التيليجرام فور استئناف وفتح الحجز لسكشنكم مرة أخرى.`;

        const idempotencyKey = `window_pause_${updated.id}_${st.id}_${Date.now()}`;
        await db
          .insert(notificationOutbox)
          .values({
            eventType: "WINDOW_PAUSED",
            recipientId: st.id,
            telegramChatId: st.telegramUserId,
            payload: {
              studentName: st.fullName,
              sectionName: `${sec?.sectionName || ""}${subSectionText} (${sec?.groupName || ""})`,
              message: pauseMsg,
            },
            idempotencyKey,
            status: "PENDING",
          })
          .onConflictDoNothing();

        queuedTelegramCount++;
      }
      NotificationService.triggerBackgroundWorker();
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
