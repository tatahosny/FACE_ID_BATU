import { db } from "@/db";
import {
  students,
  bookings,
  fingerprintActivations,
  users,
  auditLogs,
  notificationOutbox,
} from "@/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { BOOKING_STATUSES } from "@/lib/constants/statuses";
import { formatCairoDateTime } from "@/lib/utils/datetime";
import { TelegramService } from "@/server/services/telegram.service";

export class StaffService {
  /**
   * Search student by academic number for operational verification.
   * Strips all sensitive personal information (National ID).
   */
  static async searchStudent(academicNumber: string) {
    const [student] = await db
      .select({
        id: students.id,
        fullName: students.fullName,
        academicNumber: students.academicNumber,
        groupId: students.groupId,
        sectionId: students.sectionId,
        telegramUserId: students.telegramUserId,
        telegramLinkedAt: students.telegramLinkedAt,
        isActive: students.isActive,
      })
      .from(students)
      .where(eq(students.academicNumber, academicNumber.trim()));

    if (!student) return null;

    // Fetch student's latest booking and activation status
    const [latestBooking] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.studentId, student.id))
      .orderBy(desc(bookings.bookedAt))
      .limit(1);

    const [latestActivation] = await db
      .select()
      .from(fingerprintActivations)
      .where(eq(fingerprintActivations.studentId, student.id))
      .orderBy(desc(fingerprintActivations.activatedAt))
      .limit(1);

    return {
      student,
      latestBooking,
      isActivated: latestActivation?.status === "ACTIVATED",
      activationDetails: latestActivation || null,
    };
  }

  /**
   * Record fingerprint activation performed by an authenticated staff member.
   * Ensures staff identity is strictly taken from the authenticated server session.
   */
  static async recordActivation(params: {
    studentId: string;
    bookingId?: string;
    staffUserId: string;
    notes?: string;
  }) {
    const { studentId, bookingId, staffUserId, notes } = params;

    return await db.transaction(async (tx) => {
      // 1. Verify staff account
      const [staff] = await tx
        .select()
        .from(users)
        .where(eq(users.id, staffUserId));

      if (!staff || (staff.role !== "STAFF" && staff.role !== "SUPER_ADMIN")) {
        throw new Error("غير مصرح: حساب الموظف غير صالح");
      }

      // 2. Verify student exists
      const [student] = await tx
        .select()
        .from(students)
        .where(eq(students.id, studentId));

      if (!student) {
        throw new Error("سجل الطالب غير موجود");
      }

      // 3. Insert fingerprint activation record
      const [activation] = await tx
        .insert(fingerprintActivations)
        .values({
          studentId,
          bookingId: bookingId || null,
          activatedBy: staff.id,
          status: "ACTIVATED",
          notes: notes || null,
        })
        .returning();

      // 4. Update booking as COMPLETED
      let resolvedBookingId = bookingId;
      if (resolvedBookingId) {
        await tx
          .update(bookings)
          .set({
            status: BOOKING_STATUSES.COMPLETED,
            completedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(bookings.id, resolvedBookingId));
      } else {
        // Automatically find and complete any active booking for this student
        const [activeBooking] = await tx
          .select()
          .from(bookings)
          .where(
            and(
              eq(bookings.studentId, studentId),
              sql`${bookings.status} IN ('WAITING', 'CALLED', 'IN_PROGRESS')`
            )
          )
          .limit(1);

        if (activeBooking) {
          resolvedBookingId = activeBooking.id;
          await tx
            .update(bookings)
            .set({
              status: BOOKING_STATUSES.COMPLETED,
              completedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(bookings.id, activeBooking.id));
        }
      }

      // 5. Create durable notification event in notification_outbox & dispatch directly to Telegram
      let notificationQueued = false;
      let telegramSent = false;

      if (student.telegramUserId) {
        const idempotencyKey = `activation_notify_${activation.id}`;
        await tx
          .insert(notificationOutbox)
          .values({
            eventType: "ACTIVATION_SUCCESS",
            recipientId: student.id,
            telegramChatId: student.telegramUserId,
            payload: {
              studentName: student.fullName,
              academicNumber: student.academicNumber,
              staffName: staff.fullName,
              activatedAt: formatCairoDateTime(activation.activatedAt),
            },
            idempotencyKey,
          })
          .onConflictDoNothing();

        notificationQueued = true;

        // Dispatch Telegram message immediately to student
        const activationMsg = `<b>جامعة برج العرب التكنولوجية (BATU)</b>
قسم تكنولوجيا المعلومات — كلية تكنولوجيا الصناعة والطاقة

<b>تم تفعيل بصمة الوجه بنجاح!</b>

عزيزي الطالب: <b>${student.fullName}</b>
<b>الرقم الأكاديمي:</b> <code>${student.academicNumber}</code>

نحيطكم علماً بأنه قد تم تسجيل وتوثيق بصمة الوجه الخاصة بك رسمياً بنجاح تام، وتأكيد حضورك لدى شؤون الطلاب.

<b>المسؤول المعتمد:</b> ${staff.fullName}
<b>توقيت الاعتماد:</b> ${formatCairoDateTime(activation.activatedAt)}
<b>المقر:</b> معمل الحاسب الآلي الرئيسي (شباك بصمة الوجه)

نتمنى لك دوام التوفيق والنجاح!`;

        try {
          await TelegramService.sendMessage(Number(student.telegramUserId), activationMsg);
          telegramSent = true;
        } catch (err: any) {
          console.error("[RecordActivation] Failed to send Telegram activation message:", err?.message || err);
        }
      }

      // 6. Immutable audit log
      await tx.insert(auditLogs).values({
        actorId: staff.id,
        action: "FINGERPRINT_ACTIVATED",
        entityType: "STUDENT",
        entityId: student.id,
        safeMetadata: {
          activationId: activation.id,
          bookingId: resolvedBookingId,
          staffName: staff.fullName,
          notificationQueued,
          telegramSent,
        },
      });

      return {
        activation,
        resolvedBookingId,
        notificationQueued,
        telegramSent,
      };
    });
  }

  /**
   * Fetch recent activations with pagination
   */
  static async listActivations(page = 1, limit = 20) {
    const offset = (page - 1) * limit;

    const items = await db
      .select({
        id: fingerprintActivations.id,
        studentId: fingerprintActivations.studentId,
        studentName: students.fullName,
        academicNumber: students.academicNumber,
        staffName: users.fullName,
        status: fingerprintActivations.status,
        notes: fingerprintActivations.notes,
        activatedAt: fingerprintActivations.activatedAt,
      })
      .from(fingerprintActivations)
      .innerJoin(students, eq(fingerprintActivations.studentId, students.id))
      .innerJoin(users, eq(fingerprintActivations.activatedBy, users.id))
      .orderBy(desc(fingerprintActivations.activatedAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(fingerprintActivations);

    return {
      items,
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit),
    };
  }

  /**
   * Revoke/cancel fingerprint activation for a student and reset bookings so they can book again cleanly.
   */
  static async revokeActivation(params: {
    studentId: string;
    staffUserId: string;
    reason?: string;
  }) {
    const { studentId, staffUserId, reason } = params;

    return await db.transaction(async (tx) => {
      // 1. Verify staff account
      const [staff] = await tx
        .select()
        .from(users)
        .where(eq(users.id, staffUserId));

      if (!staff || (staff.role !== "STAFF" && staff.role !== "SUPER_ADMIN")) {
        throw new Error("غير مصرح: حساب الموظف غير صالح");
      }

      // 2. Verify student exists
      const [student] = await tx
        .select()
        .from(students)
        .where(eq(students.id, studentId));

      if (!student) {
        throw new Error("سجل الطالب غير موجود");
      }

      // 3. Delete from fingerprint_activations
      await tx
        .delete(fingerprintActivations)
        .where(eq(fingerprintActivations.studentId, studentId));

      // 4. Cancel all student's bookings so student has no active or completed booking
      await tx
        .update(bookings)
        .set({
          status: BOOKING_STATUSES.CANCELLED,
          notes: reason ? `تم إلغاء البصمة وإعادة إتاحة الحجز: ${reason}` : "تم إلغاء البصمة وإعادة إتاحة الحجز بواسطة المشرف",
          updatedAt: new Date(),
        })
        .where(eq(bookings.studentId, studentId));

      // 5. Send notification to student via Telegram if linked
      let telegramSent = false;
      if (student.telegramUserId) {
        const revokeMsg = `🏛️ <b>جامعة برج العرب التكنولوجية (BATU)</b>
قسم تكنولوجيا المعلومات — نظام بصمة الوجه

🔄 <b>إشعار إلغاء اعتماد البصمة وإعادة إتاحة الحجز</b>

عزيزي الطالب: <b>${student.fullName}</b>
🆔 <b>الرقم الأكاديمي:</b> <code>${student.academicNumber}</code>

نحيطكم علماً بأنه قد تم <b>إلغاء اعتماد بصمة الوجه السابقة وإعادة فتح إمكانية الحجز لك</b>.
يمكنك الآن التوجه لصفحة الحجز وحجز دور جديد عند فتح فترة سكشنك.

👨‍💼 <b>المسؤول:</b> ${staff.fullName}
${reason ? `📝 <b>السبب:</b> ${reason}` : ""}`;

        try {
          await TelegramService.sendMessage(Number(student.telegramUserId), revokeMsg);
          telegramSent = true;
        } catch (err: any) {
          console.error("[RevokeActivation] Failed to send Telegram message:", err?.message || err);
        }
      }

      // 6. Audit log
      await tx.insert(auditLogs).values({
        actorId: staff.id,
        action: "FINGERPRINT_REVOKED",
        entityType: "STUDENT",
        entityId: student.id,
        safeMetadata: {
          studentName: student.fullName,
          academicNumber: student.academicNumber,
          staffName: staff.fullName,
          reason,
          telegramSent,
        },
      });

      return {
        success: true,
        telegramSent,
      };
    });
  }
}
