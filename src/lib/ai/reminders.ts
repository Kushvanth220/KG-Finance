/**
 * Structured reminders.
 *
 * Reminders used to be plain strings, so "when" only existed as words inside
 * the sentence — and `get_daily_briefing` had to guess what was due by
 * substring-matching the day number against the text. That is wrong the moment
 * an amount contains the same digits.
 *
 * A reminder now carries its schedule as data. The sentence the assistant reads
 * is DERIVED from that data (`renderReminderLine`), so there is one source of
 * truth and the model still gets something it can speak aloud.
 */

export type ReminderRepeat = "once" | "weekly" | "monthly" | "yearly";

export interface Reminder {
  id: string;
  /** What to remind about, in the user's own words. */
  text: string;
  done: boolean;
  repeat: ReminderRepeat;
  /** once — ISO yyyy-MM-dd */
  date?: string;
  /** monthly / yearly — 1..31 */
  dayOfMonth?: number;
  /** yearly — 1..12 */
  month?: number;
  /** weekly — 0 = Sunday */
  weekday?: number;
  /** HH:mm, 24h. Optional: plenty of reminders have no time of day. */
  time?: string;
  /** How many days ahead to raise it. The workspace default is 5. */
  leadDays: number;
  /**
   * The last occurrence that was actually completed, as yyyy-MM-dd.
   *
   * Recurring reminders are never "finished" — paying rent in March does not
   * mean rent is over. Marking one done records the occurrence it satisfied
   * and the reminder rolls to the next one. Only a one-off sets `done`.
   */
  doneThrough?: string;
  /**
   * yyyy-MM-dd. "Not now" — the reminder stays due on its date, but nothing
   * raises it before this day. Cleared automatically once the day has passed.
   */
  snoozedUntil?: string;
  /** Whose reminder this is. Absent means the workspace's — both of you. */
  person?: "kushvanth" | "g";
}

export const DEFAULT_LEAD_DAYS = 5;

/** True while a snooze is still in force. */
export function isSnoozed(reminder: Reminder, from: Date = new Date()): boolean {
  if (!reminder.snoozedUntil) return false;
  const until = new Date(`${reminder.snoozedUntil}T00:00:00`);
  return !Number.isNaN(until.getTime()) && until > atMidnight(from);
}

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

export function ordinal(n: number): string {
  const suffix = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${suffix[(v - 20) % 10] ?? suffix[v] ?? suffix[0]}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** "09:00" -> "9:00 AM". Returns null for anything unparseable. */
export function formatTime(time?: string): string | null {
  if (!time) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  const suffix = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${pad(m)} ${suffix}`;
}

/** Plain-English schedule, e.g. "the 3rd of each month at 9:00 AM". */
export function describeSchedule(reminder: Reminder): string {
  const at = formatTime(reminder.time);
  const time = at ? ` at ${at}` : "";

  switch (reminder.repeat) {
    case "weekly":
      return reminder.weekday != null
        ? `every ${WEEKDAYS[reminder.weekday]}${time}`
        : `every week${time}`;
    case "monthly":
      return reminder.dayOfMonth
        ? `the ${ordinal(reminder.dayOfMonth)} of each month${time}`
        : `every month${time}`;
    case "yearly":
      return reminder.dayOfMonth && reminder.month
        ? `every ${MONTHS[reminder.month - 1]} ${ordinal(reminder.dayOfMonth)}${time}`
        : `every year${time}`;
    case "once":
    default:
      return reminder.date ? `on ${reminder.date}${time}` : time.trim() || "no set date";
  }
}

/**
 * The line the assistant actually reads. Kept human — the model speaks these
 * aloud — and prefixed with [DONE] to match the convention the tools use.
 */
export function renderReminderLine(reminder: Reminder): string {
  const parts = [reminder.text.trim()];
  const schedule = describeSchedule(reminder);
  if (schedule && schedule !== "no set date") parts.push(`due ${schedule}`);
  if (reminder.leadDays > 0) parts.push(`remind ${reminder.leadDays} days before`);
  if (reminder.person) parts.push(`for ${reminder.person}`);
  // Only a live snooze is worth writing; an expired one would just be noise.
  if (isSnoozed(reminder)) parts.push(`snoozed until ${reminder.snoozedUntil}`);
  const line = parts.join(" — ");
  return reminder.done ? `[DONE] ${line}` : line;
}

/**
 * yyyy-MM-dd in LOCAL time. `toISOString` would shift to UTC and, for anyone
 * west of Greenwich, hand back yesterday.
 */
export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function atMidnight(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/**
 * The next time this reminder comes due, at or after `from`.
 * Returns null when there is nothing to compute (a once-off with no date, or a
 * past one-off), which the caller treats as "never due".
 */
export function nextDueDate(reminder: Reminder, from: Date = new Date()): Date | null {
  let today = atMidnight(from);

  // An occurrence already ticked off cannot be the next one due. Start the
  // search the day after it, so a rent paid on the 3rd points at next month.
  if (reminder.repeat !== "once" && reminder.doneThrough) {
    const settled = new Date(`${reminder.doneThrough}T00:00:00`);
    if (!Number.isNaN(settled.getTime()) && settled >= today) {
      today = new Date(settled);
      today.setDate(today.getDate() + 1);
    }
  }

  if (reminder.repeat === "once") {
    if (!reminder.date) return null;
    const parsed = new Date(`${reminder.date}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed < today ? null : parsed;
  }

  if (reminder.repeat === "weekly") {
    if (reminder.weekday == null) return null;
    const next = new Date(today);
    const delta = (reminder.weekday - today.getDay() + 7) % 7;
    next.setDate(today.getDate() + delta);
    return next;
  }

  if (reminder.repeat === "monthly") {
    if (!reminder.dayOfMonth) return null;
    // Clamp for short months: "the 31st" lands on the 30th in November.
    const inMonth = (year: number, monthIndex: number) => {
      const lastDay = new Date(year, monthIndex + 1, 0).getDate();
      return new Date(year, monthIndex, Math.min(reminder.dayOfMonth!, lastDay));
    };
    const thisMonth = inMonth(today.getFullYear(), today.getMonth());
    if (thisMonth >= today) return thisMonth;
    return inMonth(today.getFullYear(), today.getMonth() + 1);
  }

  // yearly
  if (!reminder.dayOfMonth || !reminder.month) return null;
  const monthIndex = reminder.month - 1;
  const inYear = (year: number) => {
    const lastDay = new Date(year, monthIndex + 1, 0).getDate();
    return new Date(year, monthIndex, Math.min(reminder.dayOfMonth!, lastDay));
  };
  const thisYear = inYear(today.getFullYear());
  return thisYear >= today ? thisYear : inYear(today.getFullYear() + 1);
}

/** Whole days from `from` until the reminder is due. Null when never due. */
export function daysUntilDue(reminder: Reminder, from: Date = new Date()): number | null {
  const due = nextDueDate(reminder, from);
  if (!due) return null;
  const ms = due.getTime() - atMidnight(from).getTime();
  return Math.round(ms / 86_400_000);
}

/**
 * Should the assistant raise this now? True inside the lead window, which is
 * what "remind me 5 days before" actually means.
 */
export function isDueSoon(reminder: Reminder, from: Date = new Date()): boolean {
  if (reminder.done) return false;
  if (isSnoozed(reminder, from)) return false;
  const days = daysUntilDue(reminder, from);
  if (days == null) return false;
  return days >= 0 && days <= reminder.leadDays;
}

/** "Due today", "in 3 days", "overdue" — for the UI, not the model. */
export function dueLabel(reminder: Reminder, from: Date = new Date()): string {
  if (isSnoozed(reminder, from)) {
    const [, m, d] = reminder.snoozedUntil!.split("-");
    return `Snoozed until ${m}/${d}`;
  }
  const days = daysUntilDue(reminder, from);
  if (days == null) return "No date set";
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
}

/**
 * Parse a schedule phrase that `describeSchedule` produced.
 *
 * Only our own output is recognised. Freeform prose a person typed ("due
 * around the 24th-26th") deliberately does NOT match — guessing there would
 * invent data nobody entered.
 */
function parseRenderedSchedule(
  phrase: string
): Pick<Reminder, "repeat" | "date" | "dayOfMonth" | "month" | "weekday" | "time"> | null {
  let rest = phrase.trim();
  let time: string | undefined;

  const at = /\s+at\s+(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(rest);
  if (at) {
    let hour = Number(at[1]);
    const minute = Number(at[2]);
    const suffix = at[3]?.toUpperCase();
    if (suffix === "PM" && hour < 12) hour += 12;
    if (suffix === "AM" && hour === 12) hour = 0;
    if (hour <= 23 && minute <= 59) {
      time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      rest = rest.slice(0, at.index).trim();
    }
  }

  const withTime = time ? { time } : {};

  const weekly = new RegExp(`^every (${WEEKDAYS.join("|")})$`, "i").exec(rest);
  if (weekly) {
    const weekday = WEEKDAYS.findIndex(
      (day) => day.toLowerCase() === weekly[1]!.toLowerCase()
    );
    return { repeat: "weekly", weekday, ...withTime };
  }
  if (/^every week$/i.test(rest)) return { repeat: "weekly", ...withTime };

  const monthly = /^the (\d{1,2})(?:st|nd|rd|th) of each month$/i.exec(rest);
  if (monthly) {
    const dayOfMonth = Number(monthly[1]);
    if (dayOfMonth >= 1 && dayOfMonth <= 31) {
      return { repeat: "monthly", dayOfMonth, ...withTime };
    }
  }
  if (/^every month$/i.test(rest)) return { repeat: "monthly", ...withTime };

  const yearly = new RegExp(
    `^every (${MONTHS.join("|")}) (\\d{1,2})(?:st|nd|rd|th)$`,
    "i"
  ).exec(rest);
  if (yearly) {
    const month =
      MONTHS.findIndex((name) => name.toLowerCase() === yearly[1]!.toLowerCase()) + 1;
    const dayOfMonth = Number(yearly[2]);
    if (month >= 1 && dayOfMonth >= 1 && dayOfMonth <= 31) {
      return { repeat: "yearly", month, dayOfMonth, ...withTime };
    }
  }
  if (/^every year$/i.test(rest)) return { repeat: "yearly", ...withTime };

  const once = /^on (\d{4}-\d{2}-\d{2})$/i.exec(rest);
  if (once) return { repeat: "once", date: once[1], ...withTime };

  return null;
}

/**
 * Adopt a plain-string reminder.
 *
 * This is the exact inverse of `renderReminderLine`, and it has to be: the
 * rendered line is what gets synced, so anything this function fails to peel
 * back off becomes part of the stored text and gets rendered AGAIN next time.
 * That is how live reminders ended up reading
 *   "Room rent — due the 3rd of each month — remind 5 days before
 *    — remind 5 days before — remind 5 days before"
 * with a fresh suffix accumulating on every sync.
 *
 * Freeform prose a person wrote is still kept verbatim as the text, with no
 * schedule guessed from it.
 */
export function reminderFromLegacyLine(line: string, id: string): Reminder {
  const done = /^\[DONE\]\s*/i.test(line);
  let rest = line.replace(/^\[DONE\]\s*/i, "").trim();

  // A snooze suffix sits last; strip it (and any repeats) before the rest.
  let snoozedUntil: string | undefined;
  for (;;) {
    const match = /\s*—\s*snoozed until (\d{4}-\d{2}-\d{2})\s*$/i.exec(rest);
    if (!match) break;
    snoozedUntil = match[1]!;
    rest = rest.slice(0, match.index).trim();
  }

  // Then whose it is.
  let person: "kushvanth" | "g" | undefined;
  for (;;) {
    const match = /\s*—\s*for (kushvanth|g)\s*$/i.exec(rest);
    if (!match) break;
    person = match[1]!.toLowerCase() as "kushvanth" | "g";
    rest = rest.slice(0, match.index).trim();
  }

  // Strip every trailing lead-time suffix, however many have piled up, and
  // keep the FIRST one written — that was the real value before the repeats.
  let leadDays: number | undefined;
  for (;;) {
    const match = /\s*—\s*remind (\d+) days? before\s*$/i.exec(rest);
    if (!match) break;
    leadDays = Number(match[1]);
    rest = rest.slice(0, match.index).trim();
  }

  // Then the schedule, likewise possibly repeated.
  let schedule: ReturnType<typeof parseRenderedSchedule> = null;
  for (;;) {
    const match = /\s*—\s*due\s+(.+?)\s*$/i.exec(rest);
    if (!match) break;
    const parsed = parseRenderedSchedule(match[1]!);
    if (!parsed) break;
    schedule = parsed;
    rest = rest.slice(0, match.index).trim();
  }

  return {
    id,
    text: rest,
    done,
    repeat: schedule?.repeat ?? "once",
    ...(schedule?.date ? { date: schedule.date } : {}),
    ...(schedule?.dayOfMonth ? { dayOfMonth: schedule.dayOfMonth } : {}),
    ...(schedule?.month ? { month: schedule.month } : {}),
    ...(schedule?.weekday != null ? { weekday: schedule.weekday } : {}),
    ...(schedule?.time ? { time: schedule.time } : {}),
    ...(snoozedUntil ? { snoozedUntil } : {}),
    ...(person ? { person } : {}),
    // A recognised schedule means this line is our own rendered output, where
    // no lead suffix means a lead of zero ("on the day") — not "unspecified".
    // Only genuine freeform prose falls back to the workspace default.
    leadDays: leadDays ?? (schedule ? 0 : DEFAULT_LEAD_DAYS),
  };
}
