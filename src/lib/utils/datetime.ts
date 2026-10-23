const CAIRO_TIMEZONE = "Africa/Cairo";

/**
 * Format a Date or ISO string into an Arabic Cairo timezone representation
 */
export function formatCairoDateTime(
  dateInput: Date | string | number,
  options?: Intl.DateTimeFormatOptions
): string {
  const date = typeof dateInput === "object" ? dateInput : new Date(dateInput);
  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: CAIRO_TIMEZONE,
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    ...options,
  };

  return new Intl.DateTimeFormat("ar-EG", defaultOptions).format(date);
}

/**
 * Format time in 12-hour Cairo time (e.g. 10:30 ص)
 */
export function formatCairoTime(dateInput: Date | string | number): string {
  const date = typeof dateInput === "object" ? dateInput : new Date(dateInput);
  return new Intl.DateTimeFormat("ar-EG", {
    timeZone: CAIRO_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

/**
 * Formats a sequential queue number to 3-digit padded string: 1 -> "001", 12 -> "012"
 */
export function formatQueueNumber(num: number): string {
  return String(num).padStart(3, "0");
}

/**
 * Validates whether the current Cairo server time falls between startsAt and endsAt
 */
export function isCurrentlyOpen(startsAt: Date | string, endsAt: Date | string): boolean {
  const now = new Date();
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  return now >= start && now <= end;
}

/**
 * Returns the Arabic day of the week for a given date (e.g. "الأحد", "الإثنين", "الثلاثاء", etc.)
 */
export function getArabicDayName(dateInput: Date | string | number): string {
  if (!dateInput) return "";
  let d: Date;
  if (typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    const [y, m, day] = dateInput.split("-").map(Number);
    d = new Date(y, m - 1, day, 12, 0, 0);
  } else {
    d = new Date(dateInput);
  }
  if (isNaN(d.getTime())) return "";

  return new Intl.DateTimeFormat("ar-EG", {
    timeZone: CAIRO_TIMEZONE,
    weekday: "long",
  }).format(d);
}

/**
 * Returns formatted Arabic date with day name (e.g. "الأحد، 18 أكتوبر 2026")
 */
export function formatArabicDateWithDay(dateInput: Date | string | number): string {
  if (!dateInput) return "";
  let d: Date;
  if (typeof dateInput === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
    const [y, m, day] = dateInput.split("-").map(Number);
    d = new Date(y, m - 1, day, 12, 0, 0);
  } else {
    d = new Date(dateInput);
  }
  if (isNaN(d.getTime())) return String(dateInput);

  return new Intl.DateTimeFormat("ar-EG", {
    timeZone: CAIRO_TIMEZONE,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(d);
}

/**
 * Converts a time string (e.g. "10:20:00", "01:00:00", "13:30", "11:40") to 12-hour Arabic format:
 * - "10:20" -> "10:20 ص"
 * - "01:00" -> "01:00 م" (afternoon academic slot)
 * - "13:30" -> "01:30 م"
 */
export function format12HourTime(timeStr?: string | null): string {
  if (!timeStr) return "";
  const parts = timeStr.trim().split(":");
  let h = parseInt(parts[0], 10);
  const m = parseInt(parts[1] || "0", 10);

  if (isNaN(h)) return timeStr;

  let period = "ص";

  // Academic schedule convention:
  // Slots like 1:00, 1:40, 2:00 are afternoon slots (مساءً)
  // Slots like 8:00, 9:00, 10:00, 11:00 are morning slots (صباحاً)
  if (h >= 12 && h < 24) {
    period = "م";
    if (h > 12) h -= 12;
  } else if (h === 0) {
    // 00:20 is actually 12:20 PM in academic slots
    h = 12;
    period = "م";
  } else if (h >= 1 && h <= 7) {
    // Academic hours 1 to 7 are PM (ظهر / عصر)
    period = "م";
  } else {
    // 8, 9, 10, 11 AM
    period = "ص";
  }

  const paddedH = String(h).padStart(2, "0");
  const paddedM = String(m).padStart(2, "0");
  return `${paddedH}:${paddedM} ${period}`;
}

/**
 * Computes minutes from 00:00 in chronological university order (Morning first!):
 * University day starts around 08:00 AM (8, 9, 10, 11 AM)
 * then 12:00 PM, 01:00 PM (13:00), 02:00 PM (14:00), etc.
 *
 * Example:
 * 10:20 AM -> 10 * 60 + 20 = 620
 * 11:00 AM -> 11 * 60 = 660
 * 01:00 PM (written as 01:00 or 13:00) -> 13 * 60 = 780
 *
 * This ensures that 10:20 AM correctly sorts BEFORE 01:00 PM!
 */
export function getAcademicTimeMinutes(timeStr?: string | null): number {
  if (!timeStr) return 9999;
  const parts = timeStr.trim().split(":");
  let h = parseInt(parts[0], 10);
  const m = parseInt(parts[1] || "0", 10);

  if (isNaN(h)) return 9999;

  // Normalize: If h is entered as 1..7 (e.g. 1 PM, 2 PM), treat as 13..19
  if (h >= 1 && h <= 7) {
    h += 12;
  } else if (h === 0) {
    // 00:20 entered instead of 12:20
    h = 12;
  }

  return h * 60 + m;
}
