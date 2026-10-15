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
