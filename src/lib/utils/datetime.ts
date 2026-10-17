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
