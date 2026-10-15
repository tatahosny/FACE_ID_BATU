export const USER_ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN",
  STAFF: "STAFF",
  STUDENT: "STUDENT",
} as const;

export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];

export const BOOKING_STATUSES = {
  WAITING: "WAITING",
  CALLED: "CALLED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  NO_SHOW: "NO_SHOW",
} as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[keyof typeof BOOKING_STATUSES];

export const BOOKING_WINDOW_STATUSES = {
  DRAFT: "DRAFT",
  OPEN: "OPEN",
  PAUSED: "PAUSED",
  CLOSED: "CLOSED",
} as const;

export type BookingWindowStatus =
  (typeof BOOKING_WINDOW_STATUSES)[keyof typeof BOOKING_WINDOW_STATUSES];

export const OUTBOX_STATUSES = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  DELIVERED: "DELIVERED",
  FAILED: "FAILED",
} as const;

export const CAMPAIGN_STATUSES = {
  DRAFT: "DRAFT",
  QUEUED: "QUEUED",
  RUNNING: "RUNNING",
  PAUSED: "PAUSED",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

export const ARABIC_LABELS = {
  WAITING: "في الانتظار",
  CALLED: "تم النداء",
  IN_PROGRESS: "قيد التسجيل",
  COMPLETED: "تم التفعيل بنجاح",
  CANCELLED: "ملغي",
  NO_SHOW: "لم يحضر",
  OPEN: "متاح للحجز",
  PAUSED: "موقوف مؤقتاً",
  CLOSED: "مغلق",
  SUPER_ADMIN: "مسؤول النظام العام",
  STAFF: "موظف بصمة",
  STUDENT: "طالب",
} as const;
