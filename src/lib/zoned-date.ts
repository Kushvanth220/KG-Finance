/**
 * The app's own idea of "today".
 *
 * `new Date().toISOString()` is UTC, which late in the evening is already
 * tomorrow for anyone west of it — so the app reported the wrong day's
 * spending, month totals rolled over early on the last of the month, and the
 * assistant argued about the date. Everything that means a calendar day to a
 * person goes through here, in one configured zone.
 *
 * Set NEXT_PUBLIC_TIME_ZONE (an IANA zone such as "Europe/London") to change it.
 */

export const APP_TIME_ZONE = process.env.NEXT_PUBLIC_TIME_ZONE || "America/Chicago";

/** yyyy-MM-dd in the workspace's timezone. */
/** The workspace's wall clock right now, as "HH:MM" (24h), for time fields. */
export function zonedClockNow(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hour === "24" ? "00" : hour}:${minute}`;
}

export function zonedToday(now: Date = new Date()): string {
  // en-CA formats as yyyy-MM-dd, which is exactly the shape stored on records.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** yyyy-MM-dd for the day before, in the workspace's timezone. */
export function zonedYesterday(now: Date = new Date()): string {
  return zonedToday(new Date(now.getTime() - 24 * 60 * 60 * 1000));
}

/** yyyy-MM in the workspace's timezone. */
export function zonedMonth(now: Date = new Date()): string {
  return zonedToday(now).slice(0, 7);
}

/**
 * The workspace's wall clock as a Date whose LOCAL fields read that time.
 *
 * Schedules say "6:30 AM" with no zone. A server running in UTC compares them
 * against this, so 6:30 means 6:30 here rather than 6:30 in London.
 */
export function zonedWallClock(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return new Date(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
}

/** "Wednesday, September 2, 2026" — for reading aloud. */
export function zonedLongDate(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(now);
}
