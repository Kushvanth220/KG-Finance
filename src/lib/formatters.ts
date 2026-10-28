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

// Made once: building a formatter costs far more than using one, and a page
// formats hundreds of amounts and dates every time it is opened.
const DOLLARS = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});
const DOLLARS_AND_CENTS = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(amount: number): string {
  // Whole dollars stay compact ("$4,000"), but anything with cents shows BOTH
  // digits. minimumFractionDigits: 0 alone rendered 12.10 as "$12.1", which is
  // not a currency amount.
  const hasCents = Math.round(Math.abs(amount) * 100) % 100 !== 0;
  return (hasCents ? DOLLARS_AND_CENTS : DOLLARS).format(amount);
}

/**
 * An amount in a list: always with its cents. "$15" above "$19.67" leaves the
 * column ragged and the eye hunting; "$15.00" lines up. Headline figures keep
 * formatCurrency's compact whole dollars.
 */
export function formatAmount(amount: number): string {
  return DOLLARS_AND_CENTS.format(Math.abs(amount) < 0.005 ? 0 : amount);
}

/** How late something is, the way a person says it: "5h late", "1 day late", "12 days late". */
export function formatLateness(hours: number): string {
  if (hours < 1) return "due now";
  if (hours < 24) return `${Math.floor(hours)}h late`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} late`;
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
const DATE_FORMAT = new Intl.DateTimeFormat("en-US", DATE_PARTS);
const TIME_FORMAT = new Intl.DateTimeFormat("en-US", TIME_PARTS);
const DATE_TIME_FORMAT = new Intl.DateTimeFormat("en-US", { ...DATE_PARTS, ...TIME_PARTS });

export function formatDate(date: string, time?: string, timestamp?: string): string {
  return DATE_FORMAT.format(parseAppDateTime(date, time, timestamp));
}

export function formatTime(date: string, time: string, timestamp?: string): string {
  return TIME_FORMAT.format(parseAppDateTime(date, time, timestamp));
}

export function formatDateTime(date: string, time?: string, timestamp?: string): string {
  const at = parseAppDateTime(date, time ?? "00:00:00", timestamp);
  return DATE_TIME_FORMAT.format(at);
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
