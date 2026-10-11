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
 *
 * Every repeat, simple or custom, reduces to one rule — a unit, an interval,
 * and which days — so there is one engine (`occursOn`) behind the calendar, the
 * due labels, the alarm ringer and the server's push.
 */

export type ReminderRepeat =
  | "once"
  | "daily"
  | "weekdays"
  | "weekends"
  | "weekly"
  | "biweekly"
  | "monthly"
  | "yearly"
  | "custom";

export type ReminderUnit = "day" | "week" | "month" | "year";

export type AlarmSound = "chime" | "bell" | "pulse" | "silent";

export interface Reminder {
  id: string;
  /** What to remind about, in the user's own words. */
  text: string;
  done: boolean;
  repeat: ReminderRepeat;
  /**
   * ISO yyyy-MM-dd. For once, the day itself. For anything recurring, the
   * first occurrence: every other week, every 3 days and "10 times" all count
   * from it.
   */
  date?: string;
  /** monthly / yearly / custom months — 1..31. 31 is the last day, whatever the month's length. */
  dayOfMonth?: number;
  /** yearly — 1..12 */
  month?: number;
  /** weekly — 0 = Sunday. Also the weekday of "the first Monday" (with `nth`). */
  weekday?: number;
  /** weekly / custom weeks on several days — 0 = Sunday. */
  weekdays?: number[];
  /** Monthly on a weekday: 1–4 for first to fourth, -1 for the last. */
  nth?: number;
  /** custom — every N units. */
  every?: number;
  /** custom — the unit `every` counts. */
  unit?: ReminderUnit;
  /** HH:mm, 24h. Optional: plenty of reminders have no time of day. The first of `times`. */
  time?: string;
  /** Every time of day it rings, when there is more than one. */
  times?: string[];
  /** How many days ahead to raise it. The workspace default is 5. */
  leadDays: number;
  /** Alarms: minutes before the ring to send a heads-up. */
  leadMinutes?: number;
  /**
   * The last occurrence that was actually completed: yyyy-MM-dd for a whole
   * day, or yyyy-MM-ddTHH:mm for one ring of an alarm.
   *
   * Recurring reminders are never "finished" — paying rent in March does not
   * mean rent is over. Marking one done records the occurrence it satisfied
   * and the reminder rolls to the next one. Only a one-off sets `done`.
   */
  doneThrough?: string;
  /**
   * "Not now". yyyy-MM-dd: nothing raises it before this day. yyyy-MM-ddTHH:mm:
   * an alarm snoozed to that minute, when it rings again.
   */
  snoozedUntil?: string;
  /** Whose reminder this is. Absent means the workspace's — both of you. */
  person?: "kushvanth" | "g";
  /** Dollars, when the reminder is a payment. Never recorded as spending by itself. */
  amount?: number;
  /** yyyy-MM-dd. Recurring only: the last day it can come due — the final EMI. */
  until?: string;
  /** Recurring only: it ends after this many times, counted from `date`. */
  count?: number;
  /** Rings full screen at its time, and keeps ringing until handled. */
  alarm?: boolean;
  /** Alarms: how long a snooze lasts. */
  snoozeMinutes?: number;
  sound?: AlarmSound;
  /** The ring starts soft and grows. */
  louder?: boolean;
  vibrate?: boolean;
  note?: string;
  /** Kept, but nothing comes due while paused. */
  paused?: boolean;
  /** yyyy-MM-dd: this one occurrence is skipped. */
  skip?: string;
  /** When this copy last changed, so two devices (or a notification button) can tell whose is newer. */
  updatedAt?: string;
}

export const DEFAULT_LEAD_DAYS = 5;
export const DEFAULT_SNOOZE_MINUTES = 10;
/** An alarm with no time set rings at this time. */
export const DEFAULT_ALARM_TIME = "09:00";

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

const NTH_WORDS: Record<number, string> = { 1: "first", 2: "second", 3: "third", 4: "fourth", [-1]: "last" };

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

/**
 * yyyy-MM-dd in LOCAL time. `toISOString` would shift to UTC and, for anyone
 * west of Greenwich, hand back yesterday.
 */
export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** yyyy-MM-ddTHH:mm in local time: one ring of an alarm. */
export function toStamp(date: Date): string {
  return `${toIsoDate(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** A day (yyyy-MM-dd, midnight) or a minute (yyyy-MM-ddTHH:mm), as local time. */
export function parseStamp(value?: string): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value);
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    match[4] ? Number(match[4]) : 0,
    match[5] ? Number(match[5]) : 0
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

const isMinuteStamp = (value?: string) => !!value && value.length > 10;

function atMidnight(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

/** Whole days from a to b, rounded, because a clock change makes one day 23 or 25 hours. */
function dayDiff(a: Date, b: Date): number {
  return Math.round((atMidnight(b).getTime() - atMidnight(a).getTime()) / 86_400_000);
}

const mod = (a: number, n: number) => ((a % n) + n) % n;

function at(day: Date, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h ?? 0, m ?? 0);
}

/** The times of day it rings, sorted. Empty for a reminder with no time. */
export function ringTimes(reminder: Reminder): string[] {
  const all = reminder.times?.length ? reminder.times : reminder.time ? [reminder.time] : [];
  return [...new Set(all.filter((t) => formatTime(t) !== null).map((t) => {
    const [h, m] = t.split(":").map(Number);
    return `${pad(h!)}:${pad(m!)}`;
  }))].sort();
}

/* ------------------------------------------------------------------ */
/* The schedule engine                                                  */
/* ------------------------------------------------------------------ */

interface Rule {
  unit: ReminderUnit;
  every: number;
  weekdays?: number[];
  dayOfMonth?: number;
  nth?: number;
  weekday?: number;
  month?: number;
  start: Date | null;
}

/** Every repeat as a unit, an interval and which days. Null when the schedule is incomplete. */
function ruleOf(reminder: Reminder): Rule | null {
  const start = parseStamp(reminder.date);
  const days = (reminder.weekdays ?? []).filter((d) => d >= 0 && d <= 6);
  const monthDay = (): Pick<Rule, "dayOfMonth" | "nth" | "weekday"> | null =>
    reminder.nth && reminder.weekday != null
      ? { nth: reminder.nth, weekday: reminder.weekday }
      : reminder.dayOfMonth
        ? { dayOfMonth: reminder.dayOfMonth }
        : start
          ? { dayOfMonth: start.getDate() }
          : null;

  switch (reminder.repeat) {
    case "once":
      return null;
    case "daily":
      return { unit: "day", every: 1, start };
    case "weekdays":
      return { unit: "week", every: 1, weekdays: [1, 2, 3, 4, 5], start };
    case "weekends":
      return { unit: "week", every: 1, weekdays: [0, 6], start };
    case "weekly": {
      const list = days.length ? days : reminder.weekday != null ? [reminder.weekday] : null;
      return list ? { unit: "week", every: 1, weekdays: list, start } : null;
    }
    case "biweekly":
      return start ? { unit: "week", every: 2, weekdays: [start.getDay()], start } : null;
    case "monthly": {
      // Monthly reads only its own day fields: no start date means "the 3rd", not "the day it began".
      const which =
        reminder.nth && reminder.weekday != null
          ? { nth: reminder.nth, weekday: reminder.weekday }
          : reminder.dayOfMonth
            ? { dayOfMonth: reminder.dayOfMonth }
            : null;
      return which ? { unit: "month", every: 1, ...which, start } : null;
    }
    case "yearly":
      return reminder.month && reminder.dayOfMonth
        ? { unit: "year", every: 1, month: reminder.month, dayOfMonth: reminder.dayOfMonth, start }
        : null;
    case "custom": {
      const every = Math.max(1, Math.floor(reminder.every ?? 1));
      const unit = reminder.unit ?? "day";
      if (unit === "day") return { unit, every, start };
      if (unit === "week") {
        const list = days.length ? days : start ? [start.getDay()] : null;
        return list ? { unit, every, weekdays: list, start } : null;
      }
      if (unit === "month") {
        const which = monthDay();
        return which ? { unit, every, ...which, start } : null;
      }
      const month = reminder.month ?? (start ? start.getMonth() + 1 : undefined);
      const dayOfMonth = reminder.dayOfMonth ?? start?.getDate();
      return month && dayOfMonth ? { unit, every, month, dayOfMonth, start } : null;
    }
  }
}

function matchesRule(rule: Rule, day: Date): boolean {
  const start = rule.start;
  if (start && day < start) return false;
  switch (rule.unit) {
    case "day":
      return rule.every === 1 || !start || dayDiff(start, day) % rule.every === 0;
    case "week": {
      if (!rule.weekdays!.includes(day.getDay())) return false;
      if (rule.every === 1 || !start) return true;
      const weekOf = addDays(start, -start.getDay());
      return mod(Math.floor(dayDiff(weekOf, day) / 7), rule.every) === 0;
    }
    case "month": {
      if (rule.every > 1 && start) {
        const months = (day.getFullYear() - start.getFullYear()) * 12 + day.getMonth() - start.getMonth();
        if (mod(months, rule.every) !== 0) return false;
      }
      const last = daysInMonth(day);
      if (rule.nth) {
        if (day.getDay() !== rule.weekday) return false;
        return rule.nth === -1 ? day.getDate() + 7 > last : Math.ceil(day.getDate() / 7) === rule.nth;
      }
      // Clamp for short months: "the 31st" lands on the 30th in November.
      return day.getDate() === Math.min(rule.dayOfMonth!, last);
    }
    case "year": {
      if (rule.every > 1 && start && mod(day.getFullYear() - start.getFullYear(), rule.every) !== 0) return false;
      if (day.getMonth() !== rule.month! - 1) return false;
      return day.getDate() === Math.min(rule.dayOfMonth!, daysInMonth(day));
    }
  }
}

/** Which time this is, counting from the first: for "ends after 10 times". */
function occurrenceNumber(rule: Rule, day: Date): number {
  if (!rule.start) return 0;
  let n = 0;
  for (let d = new Date(rule.start); d <= day; d = addDays(d, 1)) if (matchesRule(rule, d)) n++;
  return n;
}

/**
 * Whether the schedule lands on this day — its rule, inside its start and end,
 * not paused or skipped. Done and snoozed are NOT considered: a paid rent still
 * happened on the 1st, and the calendar should say so.
 */
export function occursOn(reminder: Reminder, day: Date): boolean {
  if (reminder.paused) return false;
  const d = atMidnight(day);
  if (reminder.skip && toIsoDate(d) === reminder.skip) return false;
  if (reminder.repeat === "once") {
    const on = parseStamp(reminder.date);
    return !!on && dayDiff(on, d) === 0;
  }
  const rule = ruleOf(reminder);
  if (!rule || !matchesRule(rule, d)) return false;
  const last = parseStamp(reminder.until);
  if (last && d > last) return false;
  if (reminder.count && rule.start && occurrenceNumber(rule, d) > reminder.count) return false;
  return true;
}

/** Whether the schedule can ever come due: false for a once with no date, or a rule missing its day. */
export function hasSchedule(reminder: Reminder): boolean {
  return reminder.repeat === "once" ? !!parseStamp(reminder.date) : ruleOf(reminder) !== null;
}

/* ------------------------------------------------------------------ */
/* Words                                                               */
/* ------------------------------------------------------------------ */

function listWords(words: string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

const sortWeek = (days: number[]) => [...new Set(days)].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));

function monthDayWords(reminder: Reminder): string | null {
  if (reminder.nth && reminder.weekday != null) {
    return `the ${NTH_WORDS[reminder.nth]} ${WEEKDAYS[reminder.weekday]}`;
  }
  if (reminder.dayOfMonth === 31) return "the last day";
  if (reminder.dayOfMonth) return `the ${ordinal(reminder.dayOfMonth)}`;
  return null;
}

/** The repeat alone, e.g. "every Monday and Thursday" or "the first Monday of each month". */
function describeBase(reminder: Reminder): string {
  switch (reminder.repeat) {
    case "daily":
      return "every day";
    case "weekdays":
      return "every weekday";
    case "weekends":
      return "every weekend day";
    case "weekly": {
      const days = reminder.weekdays?.length ? reminder.weekdays : reminder.weekday != null ? [reminder.weekday] : [];
      return days.length ? `every ${listWords(sortWeek(days).map((d) => WEEKDAYS[d]!))}` : "every week";
    }
    case "biweekly": {
      const start = parseStamp(reminder.date);
      return start ? `every other ${WEEKDAYS[start.getDay()]}` : "every 2 weeks";
    }
    case "monthly": {
      const which = monthDayWords(reminder);
      return which ? `${which} of each month` : "every month";
    }
    case "yearly":
      return reminder.dayOfMonth && reminder.month
        ? `every ${MONTHS[reminder.month - 1]} ${ordinal(reminder.dayOfMonth)}`
        : "every year";
    case "custom": {
      const every = Math.max(1, Math.floor(reminder.every ?? 1));
      const unit = reminder.unit ?? "day";
      const base = `every ${every} ${unit}s`;
      if (unit === "week" && reminder.weekdays?.length) {
        return `${base} on ${listWords(sortWeek(reminder.weekdays).map((d) => WEEKDAYS[d]!))}`;
      }
      if (unit === "month") {
        const which = monthDayWords(reminder);
        return which ? `${base} on ${which}` : base;
      }
      if (unit === "year" && reminder.month && reminder.dayOfMonth) {
        return `${base} on ${MONTHS[reminder.month - 1]} ${ordinal(reminder.dayOfMonth)}`;
      }
      return base;
    }
    case "once":
    default:
      return "";
  }
}

/** Plain-English schedule, e.g. "the 3rd of each month at 9:00 AM until 2027-03-03". */
export function describeSchedule(reminder: Reminder): string {
  const times = ringTimes(reminder).map((t) => formatTime(t)!);
  const time = times.length ? ` at ${listWords(times)}` : "";

  if (reminder.repeat === "once") {
    return reminder.date ? `on ${reminder.date}${time}` : time.trim() || "no set date";
  }
  const from = reminder.date ? ` from ${reminder.date}` : "";
  const until = reminder.until ? ` until ${reminder.until}` : "";
  const count = reminder.count ? `, ${reminder.count} times` : "";
  return `${describeBase(reminder)}${from}${time}${until}${count}`;
}

/** True while a snooze is still in force. */
export function isSnoozed(reminder: Reminder, from: Date = new Date()): boolean {
  const until = parseStamp(reminder.snoozedUntil);
  if (!until) return false;
  return isMinuteStamp(reminder.snoozedUntil) ? until > from : until > atMidnight(from);
}

/**
 * Whether a recurring reminder is ticked off for its current cycle: its
 * `doneThrough` covers today or later. Older ones change nothing, so they are
 * not written into the line either.
 */
export function doneForThisCycle(reminder: Reminder, from: Date = new Date()): boolean {
  if (reminder.repeat === "once" || !reminder.doneThrough) return false;
  const settled = parseStamp(reminder.doneThrough);
  return !!settled && atMidnight(settled) >= atMidnight(from);
}

/**
 * The line the assistant actually reads. Kept human — the model speaks these
 * aloud — and prefixed with [DONE] to match the convention the tools use.
 */
export function renderReminderLine(reminder: Reminder): string {
  const parts = [reminder.text.trim()];
  if (reminder.amount != null && reminder.amount > 0) {
    parts.push(`amount ${formatReminderAmount(reminder.amount)}`);
  }
  const schedule = describeSchedule(reminder);
  if (schedule && schedule !== "no set date") parts.push(`due ${schedule}`);
  if (reminder.leadDays > 0) parts.push(`remind ${reminder.leadDays} days before`);
  if (reminder.leadMinutes && reminder.leadMinutes > 0) parts.push(`warn ${reminder.leadMinutes} min before`);
  if (reminder.alarm) parts.push("alarm");
  if (reminder.person) parts.push(`for ${reminder.person}`);
  if (reminder.note?.trim()) parts.push(`note: ${reminder.note.trim().replace(/\s*—\s*/g, " - ")}`);
  if (reminder.paused) parts.push("paused");
  if (reminder.skip && parseStamp(reminder.skip)! >= atMidnight(new Date())) parts.push(`skipping ${reminder.skip}`);
  // The server's daily push reads these lines, so a cycle already paid has to
  // say so here, or rent paid early keeps being announced until its due day.
  if (doneForThisCycle(reminder)) parts.push(`done through ${reminder.doneThrough}`);
  // Only a live snooze is worth writing; an expired one would just be noise.
  if (isSnoozed(reminder)) parts.push(`snoozed until ${reminder.snoozedUntil}`);
  const line = parts.join(" — ");
  return reminder.done ? `[DONE] ${line}` : line;
}

/* ------------------------------------------------------------------ */
/* When it is due                                                       */
/* ------------------------------------------------------------------ */

/** How far ahead to look for the next occurrence: past a yearly one, with room. */
const HORIZON_DAYS = 800;

/**
 * The next day this reminder comes due, at or after `from`.
 * Returns null when there is nothing to compute (a once-off with no date, a
 * past one-off, a finished or paused one), which the caller treats as "never due".
 */
export function nextDueDate(reminder: Reminder, from: Date = new Date()): Date | null {
  if (reminder.paused) return null;
  let today = atMidnight(from);

  // An occurrence already ticked off cannot be the next one due. Start the
  // search after it, so a rent paid on the 3rd points at next month — unless
  // only one ring of the day was handled and a later one is still to come.
  if (reminder.repeat !== "once" && reminder.doneThrough) {
    const settled = parseStamp(reminder.doneThrough);
    if (settled && atMidnight(settled) >= today) {
      const day = atMidnight(settled);
      const laterToday =
        isMinuteStamp(reminder.doneThrough) && ringTimes(reminder).some((t) => at(day, t) > settled);
      today = laterToday ? day : addDays(day, 1);
    }
  }

  if (reminder.repeat === "once") {
    const on = parseStamp(reminder.date);
    if (!on) return null;
    const day = atMidnight(on);
    return day < today ? null : day;
  }

  const last = parseStamp(reminder.until);
  for (let i = 0; i < HORIZON_DAYS; i++) {
    const day = addDays(today, i);
    if (last && day > last) return null;
    if (occursOn(reminder, day)) return day;
  }
  return null;
}

/** Whole days from `from` until the reminder is due. Null when never due. */
export function daysUntilDue(reminder: Reminder, from: Date = new Date()): number | null {
  const due = nextDueDate(reminder, from);
  if (!due) return null;
  return dayDiff(from, due);
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
  if (reminder.paused) return "Paused";
  if (isSnoozed(reminder, from)) {
    const until = parseStamp(reminder.snoozedUntil)!;
    if (isMinuteStamp(reminder.snoozedUntil)) return `Snoozed until ${formatTime(toStamp(until).slice(11))}`;
    return `Snoozed until ${pad(until.getMonth() + 1)}/${pad(until.getDate())}`;
  }
  const days = daysUntilDue(reminder, from);
  if (days == null) {
    return (reminder.until || reminder.count) && reminder.repeat !== "once" ? "Ended" : "No date set";
  }
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due in ${days} days`;
}

/* ------------------------------------------------------------------ */
/* Rings: the minute-level side, for alarms and timed reminders         */
/* ------------------------------------------------------------------ */

/** Everything handled up to this moment: a ring's minute, or the whole of a done day. */
function handledThrough(reminder: Reminder): Date | null {
  const settled = parseStamp(reminder.doneThrough);
  if (!settled) return null;
  if (isMinuteStamp(reminder.doneThrough)) return settled;
  return new Date(addDays(settled, 1).getTime() - 1);
}

/** Whether this reminder rings at a time: an alarm, or any reminder given a time. */
export function rings(reminder: Reminder): boolean {
  return !!reminder.alarm || ringTimes(reminder).length > 0;
}

function timesFor(reminder: Reminder): string[] {
  const times = ringTimes(reminder);
  return times.length ? times : reminder.alarm ? [DEFAULT_ALARM_TIME] : [];
}

export interface Ring {
  /** The minute it rings (or rang). */
  at: Date;
  /** ring: its time came. snooze: a snooze ran out. early: the heads-up before a ring. */
  kind: "ring" | "snooze" | "early";
}

/**
 * Every ring in (from, to]: occurrences at their times, a snooze running out,
 * and heads-ups before a ring. Rings already handled are left out. This is
 * what the server's every-minute check sends.
 */
export function ringsBetween(reminder: Reminder, from: Date, to: Date): Ring[] {
  if (reminder.done || reminder.paused || !rings(reminder)) return [];
  const handled = handledThrough(reminder);
  const snooze = isMinuteStamp(reminder.snoozedUntil) ? parseStamp(reminder.snoozedUntil) : null;
  const lead = reminder.alarm ? reminder.leadMinutes ?? 0 : 0;
  const out: Ring[] = [];
  const times = timesFor(reminder);

  const scanFrom = atMidnight(from);
  const scanTo = atMidnight(new Date(to.getTime() + lead * 60_000));
  for (let day = scanFrom; day <= scanTo; day = addDays(day, 1)) {
    if (!occursOn(reminder, day)) continue;
    for (const time of times) {
      const ring = at(day, time);
      if (handled && ring <= handled) continue;
      // While a snooze runs, it stands in for the rings it covers.
      if (snooze && ring <= snooze && snooze > from) continue;
      if (ring > from && ring <= to) out.push({ at: ring, kind: "ring" });
      if (lead > 0) {
        const early = new Date(ring.getTime() - lead * 60_000);
        if (early > from && early <= to) out.push({ at: early, kind: "early" });
      }
    }
  }
  if (snooze && snooze > from && snooze <= to && (!handled || snooze > handled)) {
    out.push({ at: snooze, kind: "snooze" });
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/**
 * The ring that should be on screen now, if any: the latest one that has
 * come within `windowMs` and not been handled. Heads-ups don't count — they
 * are only ever a notification.
 */
export function pendingRing(reminder: Reminder, now: Date = new Date(), windowMs = 2 * 3_600_000): Date | null {
  if (isSnoozed(reminder, now) && isMinuteStamp(reminder.snoozedUntil)) return null;
  const found = ringsBetween(reminder, new Date(now.getTime() - windowMs), now).filter((r) => r.kind !== "early");
  return found.length ? found[found.length - 1]!.at : null;
}

/** The next ring after `now`, for "Rings Mon at 6:30 AM". */
export function nextRing(reminder: Reminder, now: Date = new Date()): Date | null {
  if (reminder.done || reminder.paused || !rings(reminder)) return null;
  const snooze = isMinuteStamp(reminder.snoozedUntil) ? parseStamp(reminder.snoozedUntil) : null;
  if (snooze && snooze > now) return snooze;
  const handled = handledThrough(reminder);
  const times = timesFor(reminder);
  const today = atMidnight(now);
  for (let i = 0; i < HORIZON_DAYS; i++) {
    const day = addDays(today, i);
    if (!occursOn(reminder, day)) continue;
    for (const time of times) {
      const ring = at(day, time);
      if (ring > now && (!handled || ring > handled)) return ring;
    }
  }
  return null;
}

/** "Rings today at 6:30 AM", "Rings Mon at 6:30 AM", "Rings Oct 30 at 9:00 AM". */
export function ringLabel(reminder: Reminder, now: Date = new Date()): string | null {
  const next = nextRing(reminder, now);
  if (!next) return null;
  const time = formatTime(toStamp(next).slice(11));
  const days = dayDiff(now, next);
  const verb = reminder.alarm ? "Rings" : "Pops up";
  if (days === 0) return `${verb} today at ${time}`;
  if (days === 1) return `${verb} tomorrow at ${time}`;
  if (days < 7) return `${verb} ${WEEKDAYS[next.getDay()]!.slice(0, 3)} at ${time}`;
  return `${verb} ${next.toLocaleDateString("en-US", { month: "short", day: "numeric" })} at ${time}`;
}

/* ------------------------------------------------------------------ */
/* Reading lines back                                                   */
/* ------------------------------------------------------------------ */

const TIME_RE = String.raw`\d{1,2}:\d{2}\s*(?:AM|PM)?`;

function parseClock(raw: string): string | null {
  const match = /^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i.exec(raw.trim());
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const suffix = match[3]?.toUpperCase();
  if (suffix === "PM" && hour < 12) hour += 12;
  if (suffix === "AM" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return `${pad(hour)}:${pad(minute)}`;
}

function parseDayList(words: string): number[] | null {
  const names = words.split(/,\s*|\s+and\s+/).map((w) => w.trim()).filter(Boolean);
  const days = names.map((name) => WEEKDAYS.findIndex((d) => d.toLowerCase() === name.toLowerCase()));
  return days.length && days.every((d) => d >= 0) ? days : null;
}

/** "the 3rd", "the last day", "the first Monday" -> the month fields. */
function parseMonthDay(words: string): Pick<Reminder, "dayOfMonth" | "nth" | "weekday"> | null {
  if (/^the last day$/i.test(words)) return { dayOfMonth: 31 };
  const day = /^the (\d{1,2})(?:st|nd|rd|th)$/i.exec(words);
  if (day) {
    const n = Number(day[1]);
    return n >= 1 && n <= 31 ? { dayOfMonth: n } : null;
  }
  const nth = new RegExp(`^the (first|second|third|fourth|last) (${WEEKDAYS.join("|")})$`, "i").exec(words);
  if (nth) {
    const which = Object.entries(NTH_WORDS).find(([, w]) => w === nth[1]!.toLowerCase())!;
    return { nth: Number(which[0]), weekday: WEEKDAYS.findIndex((d) => d.toLowerCase() === nth[2]!.toLowerCase()) };
  }
  return null;
}

type ParsedSchedule = Partial<
  Pick<
    Reminder,
    | "repeat" | "date" | "dayOfMonth" | "month" | "weekday" | "weekdays" | "nth" | "every" | "unit"
    | "time" | "times" | "until" | "count"
  >
> & { repeat: ReminderRepeat };

/**
 * Parse a schedule phrase that `describeSchedule` produced.
 *
 * Only our own output is recognised. Freeform prose a person typed ("due
 * around the 24th-26th") deliberately does NOT match — guessing there would
 * invent data nobody entered.
 */
function parseRenderedSchedule(phrase: string): ParsedSchedule | null {
  let rest = phrase.trim();
  const extra: Partial<ParsedSchedule> = {};

  const count = /,\s*(\d+) times$/i.exec(rest);
  if (count) {
    extra.count = Number(count[1]);
    rest = rest.slice(0, count.index).trim();
  }
  const ends = /\s+until (\d{4}-\d{2}-\d{2})$/i.exec(rest);
  if (ends) {
    extra.until = ends[1]!;
    rest = rest.slice(0, ends.index).trim();
  }
  const clock = new RegExp(`\\s+at\\s+(${TIME_RE}(?:(?:,\\s*|\\s+and\\s+)${TIME_RE})*)$`, "i").exec(rest);
  if (clock) {
    const times = clock[1]!.split(/,\s*|\s+and\s+/).map(parseClock);
    if (times.every(Boolean)) {
      const list = times as string[];
      extra.time = list[0];
      if (list.length > 1) extra.times = list;
      rest = rest.slice(0, clock.index).trim();
    }
  }
  const from = /\s+from (\d{4}-\d{2}-\d{2})$/i.exec(rest);
  if (from) {
    extra.date = from[1]!;
    rest = rest.slice(0, from.index).trim();
  }

  const done = (base: ParsedSchedule): ParsedSchedule => ({ ...base, ...extra, repeat: base.repeat });

  if (/^every day$/i.test(rest)) return done({ repeat: "daily" });
  if (/^every weekday$/i.test(rest)) return done({ repeat: "weekdays" });
  if (/^every weekend day$/i.test(rest)) return done({ repeat: "weekends" });
  if (/^every week$/i.test(rest)) return done({ repeat: "weekly" });
  if (/^every 2 weeks$/i.test(rest)) return done({ repeat: "biweekly" });
  if (/^every month$/i.test(rest)) return done({ repeat: "monthly" });
  if (/^every year$/i.test(rest)) return done({ repeat: "yearly" });

  // The weekday is said for the listener; the start date alone fixes it.
  if (new RegExp(`^every other (?:${WEEKDAYS.join("|")})$`, "i").test(rest)) return done({ repeat: "biweekly" });

  const custom = /^every (\d+) (day|week|month|year)s(?: on (.+))?$/i.exec(rest);
  if (custom) {
    const unit = custom[2]!.toLowerCase() as ReminderUnit;
    const base: ParsedSchedule = { repeat: "custom", every: Number(custom[1]), unit };
    const on = custom[3];
    if (on) {
      if (unit === "week") {
        const days = parseDayList(on);
        if (!days) return null;
        base.weekdays = days;
      } else if (unit === "month") {
        const which = parseMonthDay(on);
        if (!which) return null;
        Object.assign(base, which);
      } else if (unit === "year") {
        const md = new RegExp(`^(${MONTHS.join("|")}) (\\d{1,2})(?:st|nd|rd|th)$`, "i").exec(on);
        if (!md) return null;
        base.month = MONTHS.findIndex((m) => m.toLowerCase() === md[1]!.toLowerCase()) + 1;
        base.dayOfMonth = Number(md[2]);
      } else return null;
    }
    return done(base);
  }

  const weekly = /^every (.+)$/i.exec(rest);
  if (weekly) {
    const days = parseDayList(weekly[1]!);
    if (days) return done(days.length === 1 ? { repeat: "weekly", weekday: days[0] } : { repeat: "weekly", weekdays: days });
  }

  const monthly = /^(.+) of each month$/i.exec(rest);
  if (monthly) {
    const which = parseMonthDay(monthly[1]!);
    if (which) return done({ repeat: "monthly", ...which });
  }

  const yearly = new RegExp(`^every (${MONTHS.join("|")}) (\\d{1,2})(?:st|nd|rd|th)$`, "i").exec(rest);
  if (yearly) {
    const month = MONTHS.findIndex((name) => name.toLowerCase() === yearly[1]!.toLowerCase()) + 1;
    const dayOfMonth = Number(yearly[2]);
    if (month >= 1 && dayOfMonth >= 1 && dayOfMonth <= 31) return done({ repeat: "yearly", month, dayOfMonth });
  }

  const once = /^on (\d{4}-\d{2}-\d{2})$/i.exec(rest);
  if (once) return { repeat: "once", date: once[1], ...(extra.time ? { time: extra.time } : {}), ...(extra.times ? { times: extra.times } : {}) };

  return null;
}

/** Peel every trailing copy of one suffix off `rest`; returns the first match written (the innermost). */
function peel(state: { rest: string }, re: RegExp): RegExpExecArray | null {
  let first: RegExpExecArray | null = null;
  for (;;) {
    const match = re.exec(state.rest);
    if (!match) break;
    first = match;
    state.rest = state.rest.slice(0, match.index).trim();
  }
  return first;
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
  const state = { rest: line.replace(/^\[DONE\]\s*/i, "").trim() };

  // Suffixes come off in the reverse of the order they are written.
  const snoozedUntil = peel(state, /\s*—\s*snoozed until (\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?)\s*$/i)?.[1];
  const doneThrough = peel(state, /\s*—\s*done through (\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?)\s*$/i)?.[1];
  const skip = peel(state, /\s*—\s*skipping (\d{4}-\d{2}-\d{2})\s*$/i)?.[1];
  const paused = !!peel(state, /\s*—\s*paused\s*$/i);
  const note = peel(state, /\s*—\s*note: (.*)$/i)?.[1]?.trim();
  const personMatch = peel(state, /\s*—\s*for (kushvanth|g)\s*$/i);
  const person = personMatch ? (personMatch[1]!.toLowerCase() as "kushvanth" | "g") : undefined;
  const alarm = !!peel(state, /\s*—\s*alarm\s*$/i);
  const warn = peel(state, /\s*—\s*warn (\d+) min before\s*$/i);
  const leadMatch = peel(state, /\s*—\s*remind (\d+) days? before\s*$/i);
  // Keep the FIRST lead written — that was the real value before the repeats.
  const leadDays = leadMatch ? Number(leadMatch[1]) : undefined;

  // Then the schedule, likewise possibly repeated.
  let schedule: ParsedSchedule | null = null;
  for (;;) {
    const match = /\s*—\s*due\s+(.+?)\s*$/i.exec(state.rest);
    if (!match) break;
    const parsed = parseRenderedSchedule(match[1]!);
    if (!parsed) break;
    schedule = parsed;
    state.rest = state.rest.slice(0, match.index).trim();
  }

  // And the amount, which sits right after the text. Only the labelled form
  // counts: a "$50" someone typed into the sentence stays part of it.
  let amount: number | undefined;
  for (;;) {
    const match = /\s*—\s*amount \$([\d,]+(?:\.\d{1,2})?)\s*$/i.exec(state.rest);
    if (!match) break;
    const value = Number(match[1]!.replace(/,/g, ""));
    if (!Number.isFinite(value) || value <= 0) break;
    amount = value;
    state.rest = state.rest.slice(0, match.index).trim();
  }

  const fields: Partial<Reminder> = {};
  if (schedule) {
    for (const [key, value] of Object.entries(schedule)) {
      if (key === "repeat" || value === undefined) continue;
      (fields as Record<string, unknown>)[key] = value;
    }
  }

  return {
    id,
    text: state.rest,
    done,
    repeat: schedule?.repeat ?? "once",
    ...fields,
    ...(amount != null ? { amount } : {}),
    ...(doneThrough ? { doneThrough } : {}),
    ...(snoozedUntil ? { snoozedUntil } : {}),
    ...(person ? { person } : {}),
    ...(alarm ? { alarm } : {}),
    ...(warn ? { leadMinutes: Number(warn[1]) } : {}),
    ...(note ? { note } : {}),
    ...(paused ? { paused } : {}),
    ...(skip ? { skip } : {}),
    // A recognised schedule or amount means this line is our own rendered
    // output, where no lead suffix means a lead of zero ("on the day") — not
    // "unspecified". Only genuine freeform prose falls back to the default.
    leadDays: leadDays ?? (schedule || amount != null || alarm ? 0 : DEFAULT_LEAD_DAYS),
  };
}

/* ------------------------------------------------------------------ */
/* Input from people and the model                                      */
/* ------------------------------------------------------------------ */

/**
 * Read a cycle the way people (and the model) say it. Returns undefined for
 * anything unrecognised, so a caller can tell "not given" from "once".
 */
export function parseRepeat(value: unknown): ReminderRepeat | undefined {
  const raw = String(value ?? "").toLowerCase().replace(/[\s_-]+/g, " ").trim();
  if (raw === "once" || raw === "one time" || raw === "one off") return "once";
  if (raw === "daily" || raw === "every day") return "daily";
  if (raw === "weekdays" || raw === "every weekday" || raw === "weekday") return "weekdays";
  if (raw === "weekends" || raw === "every weekend" || raw === "weekend") return "weekends";
  if (raw === "weekly" || raw === "every week") return "weekly";
  if (
    raw === "biweekly" ||
    raw === "bi weekly" ||
    raw === "fortnightly" ||
    raw === "every 2 weeks" ||
    raw === "every two weeks" ||
    raw === "every other week"
  ) {
    return "biweekly";
  }
  if (raw === "monthly" || raw === "every month") return "monthly";
  if (raw === "yearly" || raw === "annually" || raw === "every year") return "yearly";
  if (raw === "custom") return "custom";
  return undefined;
}

/**
 * A new reminder from save_reminder's arguments. The confirmation card and the
 * save both build from this, so the card shows exactly what will be kept.
 * `person` is left to the caller, which knows the workspace's people.
 */
export function reminderDraftFromArgs(
  args: Record<string, unknown>,
  text: string,
  from: Date = new Date()
): Omit<Reminder, "id"> {
  const inRange = (value: unknown, min: number, max: number) => {
    const n = Number(value);
    return value != null && value !== "" && Number.isFinite(n) && n >= min && n <= max ? n : undefined;
  };
  const isoDate = (value: unknown) => {
    const raw = String(value ?? "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : undefined;
  };
  const clock = (value: unknown) => {
    const raw = String(value ?? "").trim();
    return /^\d{1,2}:\d{2}$/.test(raw) && formatTime(raw) ? raw : undefined;
  };

  let repeat = parseRepeat(args.repeat) ?? "once";
  const weekday = inRange(args.weekday, 0, 6);
  const weekdays = Array.isArray(args.weekdays)
    ? [...new Set(args.weekdays.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))]
    : [];
  const dayOfMonth = inRange(args.day_of_month, 1, 31);
  const month = inRange(args.month, 1, 12);
  const nthRaw = inRange(args.nth, -1, 4);
  const nth = nthRaw && nthRaw !== 0 ? nthRaw : undefined;
  const every = inRange(args.every, 1, 365);
  const unit = ["day", "week", "month", "year"].includes(String(args.unit)) ? (String(args.unit) as ReminderUnit) : undefined;
  const times = [
    ...(Array.isArray(args.times) ? args.times.map(clock) : []),
    clock(args.time),
  ].filter((t): t is string => !!t);
  const until = isoDate(args.until);
  const count = inRange(args.count, 1, 999);
  const amount = inRange(args.amount, 0.01, 10_000_000);
  const alarm = args.alarm === true || args.alarm === "true";

  if (repeat === "custom" && !unit) repeat = "once";

  let date = isoDate(args.date);
  const needsStart = repeat === "biweekly" || repeat === "custom" || !!count;
  if (needsStart && !date) {
    // No first day given: the next of the named weekday starts it, else today.
    const start = atMidnight(from);
    const first = weekday ?? (weekdays.length ? weekdays[0] : undefined);
    if (first != null) start.setDate(start.getDate() + ((first - start.getDay() + 7) % 7));
    date = toIsoDate(start);
  }
  const sortedTimes = [...new Set(times)].sort();
  const monthly = repeat === "monthly" || repeat === "yearly" || (repeat === "custom" && unit !== "day" && unit !== "week");

  return {
    text,
    done: false,
    repeat,
    leadDays: inRange(args.lead_days, 0, 60) ?? (repeat === "daily" || alarm ? 0 : DEFAULT_LEAD_DAYS),
    ...(date ? { date } : {}),
    ...((repeat === "weekly" || (repeat === "custom" && unit === "week")) && weekdays.length
      ? { weekdays }
      : repeat === "weekly" && weekday != null
        ? { weekday }
        : {}),
    ...(monthly && nth && weekday != null ? { nth, weekday } : {}),
    ...(monthly && !nth && dayOfMonth != null ? { dayOfMonth } : {}),
    ...((repeat === "yearly" || (repeat === "custom" && unit === "year")) && month != null ? { month } : {}),
    ...(repeat === "custom" ? { every: every ?? 1, unit } : {}),
    ...(sortedTimes.length ? { time: sortedTimes[0] } : {}),
    ...(sortedTimes.length > 1 ? { times: sortedTimes } : {}),
    ...(amount != null ? { amount: Math.round(amount * 100) / 100 } : {}),
    ...(repeat !== "once" && until ? { until } : {}),
    ...(repeat !== "once" && count ? { count } : {}),
    ...(alarm ? { alarm: true, snoozeMinutes: inRange(args.snooze_minutes, 1, 120) ?? DEFAULT_SNOOZE_MINUTES } : {}),
    ...(alarm && inRange(args.lead_minutes, 1, 1440) ? { leadMinutes: inRange(args.lead_minutes, 1, 1440) } : {}),
    ...(typeof args.note === "string" && args.note.trim() ? { note: args.note.trim().slice(0, 300) } : {}),
  };
}

/** "$1,450" or "$12.50" — stable across locales, because it round-trips as text. */
export function formatReminderAmount(amount: number): string {
  const whole = Number.isInteger(amount);
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Two copies of one reminder: the newer wins, except that "done through" only
 * ever moves forward — a stale copy must not un-pay the rent.
 */
export function newerReminder(a: Reminder, b: Reminder): Reminder {
  const aTime = a.updatedAt ?? "";
  const bTime = b.updatedAt ?? "";
  const winner = bTime > aTime ? b : a;
  const loser = winner === a ? b : a;
  const wd = parseStamp(winner.doneThrough);
  const ld = parseStamp(loser.doneThrough);
  if (ld && (!wd || ld > wd) && winner.repeat === loser.repeat) {
    return { ...winner, doneThrough: loser.doneThrough };
  }
  return winner;
}
