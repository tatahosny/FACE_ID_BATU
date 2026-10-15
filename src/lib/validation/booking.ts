import { z } from "zod";
import { BOOKING_STATUSES, BOOKING_WINDOW_STATUSES } from "../constants/statuses";

export const createBookingSchema = z.object({
  studentId: z.string().uuid("معرف الطالب غير صالح").optional(),
  academicNumber: z.string().min(1, "الرقم الأكاديمي مطلوب").optional(),
  bookingWindowId: z.string().uuid("معرف نافذة الحجز غير صالح").optional(),
  idempotencyKey: z.string().optional(),
});

export const updateBookingStatusSchema = z.object({
  status: z.enum([
    BOOKING_STATUSES.WAITING,
    BOOKING_STATUSES.CALLED,
    BOOKING_STATUSES.IN_PROGRESS,
    BOOKING_STATUSES.COMPLETED,
    BOOKING_STATUSES.CANCELLED,
    BOOKING_STATUSES.NO_SHOW,
  ]),
  notes: z.string().max(500).optional(),
});

export const createBookingWindowSchema = z.object({
  groupId: z.string().uuid("معرف المجموعة غير صالح"),
  sectionId: z.string().uuid("معرف السكشن غير صالح"),
  startsAt: z.string().datetime("تاريخ وتوقيت البدء غير صالح"),
  endsAt: z.string().datetime("تاريخ وتوقيت الانتهاء غير صالح"),
  capacity: z.number().int().min(1, "السعة يجب أن تكون 1 على الأقل").max(500, "السعة القصوى 500"),
  status: z.enum([
    BOOKING_WINDOW_STATUSES.DRAFT,
    BOOKING_WINDOW_STATUSES.OPEN,
    BOOKING_WINDOW_STATUSES.PAUSED,
    BOOKING_WINDOW_STATUSES.CLOSED,
  ]).default(BOOKING_WINDOW_STATUSES.DRAFT),
});

export const updateBookingWindowStatusSchema = z.object({
  status: z.enum([
    BOOKING_WINDOW_STATUSES.DRAFT,
    BOOKING_WINDOW_STATUSES.OPEN,
    BOOKING_WINDOW_STATUSES.PAUSED,
    BOOKING_WINDOW_STATUSES.CLOSED,
  ]),
});

export const recordActivationSchema = z.object({
  studentId: z.string().uuid("معرف الطالب غير صالح"),
  bookingId: z.string().uuid("معرف الحجز غير صالح").optional(),
  status: z.enum(["ACTIVATED", "FAILED"]).default("ACTIVATED"),
  notes: z.string().max(500, "الملاحظات يجب ألا تتجاوز 500 حرف").optional(),
});
