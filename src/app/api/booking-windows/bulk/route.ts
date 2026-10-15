import { NextRequest } from "next/server";
import { db } from "@/db";
import { bookingWindows, sections, groups, students, bookings } from "@/db/schema";
import { eq, inArray, and, sql } from "drizzle-orm";
import { requireRole } from "@/lib/security/auth";
import { USER_ROLES } from "@/lib/constants/statuses";
import { apiError, apiSuccess } from "@/lib/utils/response";
import { TelegramService } from "@/server/services/telegram.service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    await requireRole([USER_ROLES.SUPER_ADMIN]);

    const body = await req.json();
    const { windowIds, action } = body as {
      windowIds: string[];
      action: "OPEN" | "PAUSED" | "CLOSED" | "RESET_TICKETS";
    };

    if (!Array.isArray(windowIds) || windowIds.length === 0) {
      return apiError("يرجى تحديد فترة حجز واحدة على الأقل لتنفيذ العملية المجمعة", 400);
    }

    if (!["OPEN", "PAUSED", "CLOSED", "RESET_TICKETS"].includes(action)) {
      return apiError("العملية المحددة غير صالحة", 400);
    }

    // 1. Bulk Reset Tickets Counter back to 1
    if (action === "RESET_TICKETS") {
      await db.transaction(async (tx) => {
        // Clear queue bookings for selected windows to prevent queue index conflicts
        await tx.delete(bookings).where(inArray(bookings.bookingWindowId, windowIds));

        // Reset queue counters back to 1
        await tx
          .update(bookingWindows)
          .set({
            nextQueueNumber: 1,
            updatedAt: new Date(),
          })
          .where(inArray(bookingWindows.id, windowIds));
      });

      return apiSuccess(
        { count: windowIds.length },
        `تمت إعادة تعيين أرقام التذاكر لتبدأ من 1 بنجاح لجميع الفترات المحددة (${windowIds.length} فترات)، وأصبح الطابور جاهزاً لبدء العد من 001.`
      );
    }

    // 2. Bulk Status Change (OPEN, PAUSED, CLOSED)
    const updateData: Record<string, any> = {
      status: action,
      updatedAt: new Date(),
    };

    if (action === "OPEN") {
      updateData.startsAt = new Date(Date.now() - 60000);
      updateData.endsAt = new Date(Date.now() + 86400000 * 7);
    }

    const updatedList = await db
      .update(bookingWindows)
      .set(updateData)
      .where(inArray(bookingWindows.id, windowIds))
      .returning();

    // Fetch window section and student details for asynchronous Telegram broadcasting
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "https://face-id-batu-hvk9.vercel.app";

    for (const win of updatedList) {
      try {
        const [sec] = await db
          .select({
            sectionName: sections.name,
            groupName: groups.name,
          })
          .from(sections)
          .innerJoin(groups, eq(sections.groupId, groups.id))
          .where(eq(sections.id, win.sectionId));

        const studentConditions = [
          eq(students.sectionId, win.sectionId),
          sql`${students.telegramUserId} IS NOT NULL`,
        ];

        if (win.subSection && win.subSection !== "ALL") {
          studentConditions.push(eq(students.subSection, win.subSection));
        }

        const secStudents = await db
          .select({
            id: students.id,
            fullName: students.fullName,
            telegramUserId: students.telegramUserId,
          })
          .from(students)
          .where(and(...studentConditions));

        const subSectionText = win.subSection && win.subSection !== "ALL" ? ` (قسم ${win.subSection})` : "";

        if (action === "OPEN") {
          secStudents.forEach((st) => {
            if (!st.telegramUserId) return;
            const openMsg = `<b>جامعة برج العرب التكنولوجية (BATU)</b>\nقسم تكنولوجيا المعلومات — نظام بصمة الوجه\n\n<b>تم فتح حجز دور البصمة للسكشن الخاص بكم الآن!</b>\n\n<b>السكشن:</b> ${sec?.sectionName || "السكشن الأكاديمي"}${subSectionText} (${sec?.groupName || "المجموعة"})\n<b>عزيزي الطالب:</b> ${st.fullName}\n\n<b>يمكنك الآن الدخول إلى المنصة وحجز رقم دورك فوراً:</b>\n<a href="${appUrl}/booking">${appUrl}/booking</a>\n\nيرجى الدخول فوراً واختيار رقم دورك والتواجد بالموعد المحدد.`;

            TelegramService.sendMessage(Number(st.telegramUserId), openMsg).catch((err) => {
              console.error(`Failed to send bulk open notice to student ${st.id}:`, err.message);
            });
          });
        } else if (action === "PAUSED" || action === "CLOSED") {
          secStudents.forEach((st) => {
            if (!st.telegramUserId) return;
            const pauseMsg = `<b>جامعة برج العرب التكنولوجية (BATU)</b>\nقسم تكنولوجيا المعلومات — نظام بصمة الوجه\n\n<b>تنبيه إيقاف حجز دور البصمة:</b>\n\nأعزائنا طلاب <b>${sec?.sectionName || "السكشن الأكاديمي"}${subSectionText}</b> (${sec?.groupName || "المجموعة"})،\nنحيطكم علماً بأنه قد <b>تم إيقاف حجز دور البصمة لسكشنكم مؤقتاً لحين إشعار آخر بالفتح</b>.\n\nستصلكم رسالة فورية عبر التيليجرام فور استئناف وفتح الحجز لسكشنكم مرة أخرى.`;

            TelegramService.sendMessage(Number(st.telegramUserId), pauseMsg).catch((err) => {
              console.error(`Failed to send bulk pause notice to student ${st.id}:`, err.message);
            });
          });
        }
      } catch (err: any) {
        console.error(`Error broadcasting bulk update for window ${win.id}:`, err.message);
      }
    }

    let successMsg = `تم تحديث حالة (${updatedList.length}) فترة حجز بنجاح`;
    if (action === "OPEN") {
      successMsg = `تم فتح الحجز لـ (${updatedList.length}) فترة وإرسال الإشعارات على التيليجرام لجميع الطلاب المستهدفين`;
    } else if (action === "PAUSED") {
      successMsg = `تم الإيقاف المؤقت لـ (${updatedList.length}) فترة وإشعار الطلاب عبر التيليجرام بالإيقاف`;
    } else if (action === "CLOSED") {
      successMsg = `تم إغلاق (${updatedList.length}) فترة حجز بنجاح`;
    }

    return apiSuccess({ count: updatedList.length }, successMsg);
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED" || error.message === "FORBIDDEN") {
      return apiError("غير مصرح: هذه العملية متاحة لمدير النظام فقط", 403);
    }
    return apiError(error.message || "فشل تنفيذ العملية المجمعة", 500);
  }
}
