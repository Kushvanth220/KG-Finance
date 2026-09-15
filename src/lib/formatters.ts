/**
 * Parse stored date/time fields in the user's local timezone.
 * Avoids the JS pitfall where `new Date("yyyy-MM-dd")` is treated as UTC midnight.
 */
export function parseAppDateTime(
  date: string,
  time?: string,
  timestamp?: string
): Date {
  if (timestamp) {
    const parsed = new Date(timestamp);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return new Date();

  if (time) {
    const [hours = 0, minutes = 0, seconds = 0] = time.split(":").map(Number);
    return new Date(year, month - 1, day, hours, minutes, seconds);
  }

  // Noon local avoids DST edge cases when displaying date-only values
  return new Date(year, month - 1, day, 12, 0, 0);
}

export function formatCurrency(amount: number): string {
  // Whole dollars stay compact ("$4,000"), but anything with cents shows BOTH
  // digits. minimumFractionDigits: 0 alone rendered 12.10 as "$12.1", which is
  // not a currency amount.
  const hasCents = Math.round(Math.abs(amount) * 100) % 100 !== 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/**
 * One date shape and one clock shape for the whole app: MM/DD/YYYY and
 * hh:mm AM/PM. Mixed formats made two screens showing the same moment look
 * like two different records.
 */
const DATE_PARTS = { month: "2-digit", day: "2-digit", year: "numeric" } as const;
const TIME_PARTS = { hour: "2-digit", minute: "2-digit", hour12: true } as const;

export function formatDate(date: string, time?: string, timestamp?: string): string {
  return new Intl.DateTimeFormat("en-US", DATE_PARTS).format(
    parseAppDateTime(date, time, timestamp)
  );
}

export function formatTime(date: string, time: string, timestamp?: string): string {
  return new Intl.DateTimeFormat("en-US", TIME_PARTS).format(
    parseAppDateTime(date, time, timestamp)
  );
}

export function formatDateTime(date: string, time?: string, timestamp?: string): string {
  const at = parseAppDateTime(date, time ?? "00:00:00", timestamp);
  return new Intl.DateTimeFormat("en-US", { ...DATE_PARTS, ...TIME_PARTS }).format(at);
}

/**
 * A stored 24-hour "HH:MM" clock string shown as 12-hour time.
 *
 * Time fields are kept as typed so they stay sortable and computable; only the
 * reading of them changes here.
 */
export function formatClock(clock: string): string {
  const [rawHour, rawMinute] = String(clock).split(":");
  const hour = Number(rawHour);
  const minute = Number(rawMinute);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return clock;
  const suffix = hour >= 12 ? "PM" : "AM";
  const shown = hour % 12 === 0 ? 12 : hour % 12;
  return `${String(shown).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${suffix}`;
}

/** MM/DD, for chart axes and ranges where the year is already established. */
export function formatShortDate(date: string): string {
  const [, month, day] = date.split("-");
  return month && day ? `${month}/${day}` : date;
}

/** Compare two stored records for sorting (newest first) */
export function compareByDateTime(
  a: { date: string; time?: string; timestamp?: string },
  b: { date: string; time?: string; timestamp?: string }
): number {
  return (
    parseAppDateTime(b.date, b.time, b.timestamp).getTime() -
    parseAppDateTime(a.date, a.time, a.timestamp).getTime()
  );
}

/** Compare two stored records for sorting (oldest first) */
export function compareByDateTimeAsc(
  a: { date: string; time?: string; timestamp?: string },
  b: { date: string; time?: string; timestamp?: string }
): number {
  return -compareByDateTime(a, b);
}

/** True when a record falls within optional yyyy-MM-dd bounds (inclusive, local time). */
export function isWithinDateRange(
  record: { date: string; time?: string; timestamp?: string },
  startDate?: string,
  endDate?: string
): boolean {
  if (!startDate && !endDate) return true;

  const when = parseAppDateTime(record.date, record.time, record.timestamp);

  if (startDate) {
    const start = parseAppDateTime(startDate, "00:00:00");
    if (when < start) return false;
  }

  if (endDate) {
    const end = parseAppDateTime(endDate, "23:59:59");
    if (when > end) return false;
  }

  return true;
}
