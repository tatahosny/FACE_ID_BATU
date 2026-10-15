import { NextRequest } from "next/server";
import { db } from "@/db";
import { bookingWindows, sections, groups, students, bookings } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { requireRole } from "@/lib/security/auth";
import { USER_ROLES } from "@/lib/constants/statuses";
import { updateBookingWindowStatusSchema } from "@/lib/validation/booking";
import { apiError, apiSuccess } from "@/lib/utils/response";
import { TelegramService } from "@/server/services/telegram.service";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireRole([USER_ROLES.SUPER_ADMIN]);
    const windowId = params.id;

    const body = await req.json();
    const parsed = updateBookingWindowStatusSchema.safeParse(body);
    if (!parsed.success) {
      return apiError(parsed.error.errors[0].message, 400);
    }

    // 1. Reset Tickets Action
    if (parsed.data.action === "RESET_TICKETS" || body.resetTickets === true) {
      const [updated] = await db.transaction(async (tx) => {
        // Delete current bookings for this window to clear queue conflicts safely
        await tx.delete(bookings).where(eq(bookings.bookingWindowId, windowId));

        // Reset queue counter back to 1
        return await tx
          .update(bookingWindows)
          .set({
            nextQueueNumber: 1,
            updatedAt: new Date(),
          })
          .where(eq(bookingWindows.id, windowId))
          .returning();
      });

      if (!updated) {
        return apiError("فترة الحجز غير موجودة", 404);
      }

      return apiSuccess(
        { window: updated },
        "تمت إعادة تعيين أرقام التذاكر لتبدأ من 1 بنجاح، وأصبح الطابور فارغاً وجاهزاً لاستقبال الحجوزات بدءاً من رقم 001."
      );
    }

    // 2. Regular Status Update (OPEN, PAUSED, CLOSED, DRAFT)
    if (!parsed.data.status) {
      return apiError("حالة فترة الحجز مطلوبة", 400);
    }

    const [updated] = await db
      .update(bookingWindows)
      .set({
        status: parsed.data.status,
        ...(parsed.data.status === "OPEN"
          ? {
              startsAt: new Date(Date.now() - 60000),
              endsAt: new Date(Date.now() + 86400000 * 7),
            }
          : {}),
        updatedAt: new Date(),
      })
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
    const subSectionText = updated.subSection && updated.subSection !== "ALL" ? ` (قسم ${updated.subSection})` : "";

    // 1. If opened, broadcast Telegram opening notification
    if (parsed.data.status === "OPEN") {
      sectionStudents.forEach((st) => {
        if (!st.telegramUserId) return;
        const openMsg = `<b>جامعة برج العرب التكنولوجية (BATU)</b>\nقسم تكنولوجيا المعلومات — نظام بصمة الوجه\n\n<b>تم فتح حجز دور البصمة للسكشن الخاص بكم الآن!</b>\n\n<b>السكشن:</b> ${sec?.sectionName || "السكشن الأكاديمي"}${subSectionText} (${sec?.groupName || "المجموعة"})\n<b>عزيزي الطالب:</b> ${st.fullName}\n\n<b>يمكنك الآن الدخول إلى المنصة وحجز رقم دورك فوراً:</b>\n<a href="${appUrl}/booking">${appUrl}/booking</a>\n\nيرجى الدخول فوراً واختيار رقم دورك والتواجد بالموعد المحدد.`;

        TelegramService.sendMessage(Number(st.telegramUserId), openMsg).catch((err) => {
          console.error(`Failed to send window open alert to student ${st.id}:`, err.message);
        });
      });
    }

    // 2. If paused or stopped, broadcast Telegram pause notice to students
    if (parsed.data.status === "PAUSED" || parsed.data.status === "CLOSED") {
      sectionStudents.forEach((st) => {
        if (!st.telegramUserId) return;
        const pauseMsg = `<b>جامعة برج العرب التكنولوجية (BATU)</b>\nقسم تكنولوجيا المعلومات — نظام بصمة الوجه\n\n<b>تنبيه إيقاف حجز دور البصمة:</b>\n\nأعزائنا طلاب <b>${sec?.sectionName || "السكشن الأكاديمي"}${subSectionText}</b> (${sec?.groupName || "المجموعة"})،\nنحيطكم علماً بأنه قد <b>تم إيقاف حجز دور البصمة لسكشنكم مؤقتاً لحين إشعار آخر بالفتح</b>.\n\nستصلكم رسالة فورية عبر التيليجرام فور استئناف وفتح الحجز لسكشنكم مرة أخرى.`;

        TelegramService.sendMessage(Number(st.telegramUserId), pauseMsg).catch((err) => {
          console.error(`Failed to send window pause alert to student ${st.id}:`, err.message);
        });
      });
    }

    let successMsg = "تم تحديث حالة فترة الحجز بنجاح";
    if (parsed.data.status === "OPEN") {
      successMsg = `تم فتح فترة الحجز بنجاح وإرسال إشعار فوري لطلاب ${sec?.sectionName || "السكشن"}${subSectionText} على التيليجرام`;
    } else if (parsed.data.status === "PAUSED" || parsed.data.status === "CLOSED") {
      successMsg = `تم إيقاف حجز ${sec?.sectionName || "السكشن"}${subSectionText} بنجاح وإشعار الطلاب بالإيقاف`;
    }

    return apiSuccess({ window: updated }, successMsg);
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح: هذه العملية متاحة لمدير النظام فقط", 403);
    }
    return apiError(error.message || "فشل تحديث فترة الحجز", 400);
  }
}
