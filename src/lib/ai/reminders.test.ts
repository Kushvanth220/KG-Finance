import { describe, expect, it } from "vitest";
import {
  describeSchedule,
  dueLabel,
  isDueSoon,
  isSnoozed,
  newerReminder,
  nextDueDate,
  nextRing,
  occursOn,
  parseRepeat,
  pendingRing,
  reminderFromLegacyLine,
  renderReminderLine,
  ringsBetween,
  toIsoDate,
  toStamp,
  type Reminder,
} from "@/lib/ai/reminders";

/**
 * Reminder lines round-trip through the server as text. A suffix that grows
 * on every sync once corrupted every stored reminder — so every field
 * that renders into the line must parse back out exactly, and rendering the
 * parse must give the same line again.
 */

const base: Reminder = {
  id: "r1",
  text: "Car EMI",
  done: false,
  repeat: "monthly",
  dayOfMonth: 3,
  leadDays: 5,
};

const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

describe("reminder lines", () => {
  it("render → parse → render is stable", () => {
    const line = renderReminderLine(base);
    const parsed = reminderFromLegacyLine(line, "x");
    expect(renderReminderLine(parsed)).toBe(line);
  });

  it("carries a live snooze through the line, and only once", () => {
    const snoozed: Reminder = { ...base, snoozedUntil: tomorrow() };
    const line = renderReminderLine(snoozed);
    expect(line).toContain(`snoozed until ${tomorrow()}`);
    const parsed = reminderFromLegacyLine(line, "x");
    expect(parsed.snoozedUntil).toBe(tomorrow());
    expect(parsed.text).toBe("Car EMI");
    expect(parsed.leadDays).toBe(5);
    // A second render must not add a second suffix.
    expect(renderReminderLine(parsed)).toBe(line);
  });

  it("drops an expired snooze instead of writing it", () => {
    const stale: Reminder = { ...base, snoozedUntil: "2020-01-01" };
    expect(renderReminderLine(stale)).not.toContain("snoozed");
    expect(isSnoozed(stale)).toBe(false);
  });

  it("survives a line where the snooze suffix was written twice", () => {
    const line = `Car EMI — due the 3rd of each month — remind 5 days before — snoozed until ${tomorrow()} — snoozed until ${tomorrow()}`;
    const parsed = reminderFromLegacyLine(line, "x");
    expect(parsed.text).toBe("Car EMI");
    expect(parsed.snoozedUntil).toBe(tomorrow());
  });

  it("a snoozed reminder is not due soon, and says so", () => {
    const today = new Date();
    const dueToday: Reminder = { ...base, repeat: "once", date: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}` };
    expect(isDueSoon(dueToday)).toBe(true);
    const snoozed = { ...dueToday, snoozedUntil: tomorrow() };
    expect(isDueSoon(snoozed)).toBe(false);
    expect(dueLabel(snoozed)).toMatch(/^Snoozed until \d{2}\/\d{2}$/);
  });
});

describe("the newer options round-trip through the line", () => {
  const roundTrips = (reminder: Reminder) => {
    const line = renderReminderLine(reminder);
    const parsed = reminderFromLegacyLine(line, reminder.id);
    expect(parsed).toEqual(reminder);
    expect(renderReminderLine(parsed)).toBe(line);
    return line;
  };

  it("every day", () => {
    const line = roundTrips({ id: "d", text: "Log Flex tips", done: false, repeat: "daily", time: "21:00", leadDays: 0 });
    expect(line).toBe("Log Flex tips — due every day at 9:00 PM");
  });

  it("every other week, counted from its first day", () => {
    const line = roundTrips({ id: "b", text: "Payday", done: false, repeat: "biweekly", date: "2026-10-16", leadDays: 1 });
    expect(line).toBe("Payday — due every other Friday from 2026-10-16 — remind 1 days before");
  });

  it("the last day of the month", () => {
    const line = roundTrips({ id: "l", text: "Move savings", done: false, repeat: "monthly", dayOfMonth: 31, leadDays: 0 });
    expect(line).toBe("Move savings — due the last day of each month");
  });

  it("an amount and an end date", () => {
    const line = roundTrips({
      id: "a",
      text: "Car EMI",
      done: false,
      repeat: "monthly",
      dayOfMonth: 3,
      until: "2027-03-03",
      amount: 1450,
      leadDays: 5,
      person: "g",
    });
    expect(line).toBe("Car EMI — amount $1,450 — due the 3rd of each month until 2027-03-03 — remind 5 days before — for g");
  });

  it("cents, and an amount with no date", () => {
    roundTrips({ id: "c", text: "Phone", done: false, repeat: "once", amount: 45.5, leadDays: 0 });
    roundTrips({ id: "c2", text: "Phone", done: false, repeat: "once", amount: 45.5, leadDays: 5 });
  });

  it("a cycle marked done early, so the server's push stays quiet", () => {
    const paid = toIsoDate(new Date(Date.now() + 3 * 86_400_000));
    const line = roundTrips({ ...base, doneThrough: paid });
    expect(line).toContain(`done through ${paid}`);
    expect(renderReminderLine({ ...base, doneThrough: "2020-01-03" })).not.toContain("done through");
  });

  it("keeps a typed dollar figure as part of the text", () => {
    const parsed = reminderFromLegacyLine("Send $200 to Amma", "x");
    expect(parsed.text).toBe("Send $200 to Amma");
    expect(parsed.amount).toBeUndefined();
  });
});

describe("the newer schedules", () => {
  const at = (iso: string) => new Date(`${iso}T10:00:00`);

  it("a daily reminder is due today, and tomorrow once today is done", () => {
    const daily: Reminder = { id: "d", text: "Tips", done: false, repeat: "daily", leadDays: 0 };
    expect(toIsoDate(nextDueDate(daily, at("2026-10-10"))!)).toBe("2026-10-10");
    expect(toIsoDate(nextDueDate({ ...daily, doneThrough: "2026-10-10" }, at("2026-10-10"))!)).toBe("2026-10-11");
  });

  it("every other week lands on the right weeks, across a clock change", () => {
    const pay: Reminder = { id: "b", text: "Payday", done: false, repeat: "biweekly", date: "2026-10-16", leadDays: 0 };
    expect(toIsoDate(nextDueDate(pay, at("2026-10-01"))!)).toBe("2026-10-16");
    expect(toIsoDate(nextDueDate(pay, at("2026-10-16"))!)).toBe("2026-10-16");
    expect(toIsoDate(nextDueDate(pay, at("2026-10-17"))!)).toBe("2026-10-30");
    expect(toIsoDate(nextDueDate(pay, at("2026-11-02"))!)).toBe("2026-11-13");
    expect(toIsoDate(nextDueDate(pay, at("2027-03-20"))!)).toBe("2027-04-02");
    expect(describeSchedule(pay)).toBe("every other Friday from 2026-10-16");
  });

  it("the last day follows the month's length", () => {
    const last: Reminder = { id: "l", text: "Savings", done: false, repeat: "monthly", dayOfMonth: 31, leadDays: 0 };
    expect(toIsoDate(nextDueDate(last, at("2026-11-05"))!)).toBe("2026-11-30");
    expect(toIsoDate(nextDueDate(last, at("2027-02-05"))!)).toBe("2027-02-28");
    expect(toIsoDate(nextDueDate(last, at("2026-12-05"))!)).toBe("2026-12-31");
  });

  it("stops after its end date", () => {
    const emi: Reminder = { id: "e", text: "EMI", done: false, repeat: "monthly", dayOfMonth: 3, until: "2027-03-03", leadDays: 5 };
    expect(toIsoDate(nextDueDate(emi, at("2027-02-10"))!)).toBe("2027-03-03");
    expect(nextDueDate(emi, at("2027-03-04"))).toBeNull();
    expect(dueLabel(emi, at("2027-03-04"))).toBe("Ended");
    expect(isDueSoon(emi, at("2027-03-30"))).toBe(false);
  });
});

describe("every option, on the calendar", () => {
  const day = (iso: string) => new Date(`${iso}T00:00:00`);
  const r = (extra: Partial<Reminder>): Reminder => ({ id: "x", text: "X", done: false, repeat: "once", leadDays: 0, ...extra });
  const daysIn = (rem: Reminder, from: string, n: number) => {
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const d = new Date(day(from).getFullYear(), day(from).getMonth(), day(from).getDate() + i);
      if (occursOn(rem, d)) out.push(toIsoDate(d));
    }
    return out;
  };

  it("weekdays and weekends", () => {
    // 2026-10-12 is a Monday.
    expect(daysIn(r({ repeat: "weekdays" }), "2026-10-10", 7)).toEqual(["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"]);
    expect(daysIn(r({ repeat: "weekends" }), "2026-10-10", 7)).toEqual(["2026-10-10", "2026-10-11"]);
  });

  it("several days a week", () => {
    expect(daysIn(r({ repeat: "weekly", weekdays: [1, 3] }), "2026-10-12", 14)).toEqual(["2026-10-12", "2026-10-14", "2026-10-19", "2026-10-21"]);
  });

  it("the first Monday and the last Friday of each month", () => {
    expect(daysIn(r({ repeat: "monthly", nth: 1, weekday: 1 }), "2026-10-01", 62)).toEqual(["2026-10-05", "2026-11-02"]);
    expect(daysIn(r({ repeat: "monthly", nth: -1, weekday: 5 }), "2026-10-01", 62)).toEqual(["2026-10-30", "2026-11-27"]);
  });

  it("custom: every 3 days, every 2 weeks on two days, every 2 months", () => {
    expect(daysIn(r({ repeat: "custom", every: 3, unit: "day", date: "2026-10-11" }), "2026-10-10", 10)).toEqual(["2026-10-11", "2026-10-14", "2026-10-17"]);
    expect(daysIn(r({ repeat: "custom", every: 2, unit: "week", weekdays: [1, 4], date: "2026-10-11" }), "2026-10-11", 28)).toEqual(["2026-10-12", "2026-10-15", "2026-10-26", "2026-10-29"]);
    expect(daysIn(r({ repeat: "custom", every: 2, unit: "month", dayOfMonth: 3, date: "2026-10-03" }), "2026-10-01", 120)).toEqual(["2026-10-03", "2026-12-03"]);
  });

  it("ends after a number of times", () => {
    const emi = r({ repeat: "monthly", dayOfMonth: 3, date: "2026-10-03", count: 2 });
    expect(daysIn(emi, "2026-10-01", 120)).toEqual(["2026-10-03", "2026-11-03"]);
    expect(nextDueDate(emi, day("2026-11-10"))).toBeNull();
    expect(dueLabel(emi, day("2026-11-10"))).toBe("Ended");
  });

  it("skip one, and pause", () => {
    const weekly = r({ repeat: "weekly", weekday: 1, skip: "2026-10-12" });
    expect(toIsoDate(nextDueDate(weekly, day("2026-10-11"))!)).toBe("2026-10-19");
    expect(nextDueDate({ ...weekly, paused: true }, day("2026-10-11"))).toBeNull();
    expect(dueLabel({ ...weekly, paused: true })).toBe("Paused");
  });
});

describe("the newer options round-trip too", () => {
  const roundTrips = (reminder: Reminder) => {
    const line = renderReminderLine(reminder);
    const parsed = reminderFromLegacyLine(line, reminder.id);
    expect(parsed).toEqual(reminder);
    expect(renderReminderLine(parsed)).toBe(line);
    return line;
  };

  it("an alarm on two days, at two times, with a heads-up and a note", () => {
    const line = roundTrips({
      id: "a", text: "Flex block", done: false, repeat: "weekly", weekdays: [1, 3], time: "06:30", times: ["06:30", "18:00"],
      leadDays: 0, leadMinutes: 10, alarm: true, person: "kushvanth", note: "charge the phone",
    });
    expect(line).toBe("Flex block — due every Monday and Wednesday at 6:30 AM and 6:00 PM — warn 10 min before — alarm — for kushvanth — note: charge the phone");
  });

  it("weekdays, weekends, first Monday, last day, custom, count", () => {
    roundTrips({ id: "1", text: "Stand-up", done: false, repeat: "weekdays", time: "09:00", leadDays: 0 });
    roundTrips({ id: "2", text: "Groceries", done: false, repeat: "weekends", leadDays: 1 });
    roundTrips({ id: "3", text: "Review", done: false, repeat: "monthly", nth: 1, weekday: 1, leadDays: 0 });
    roundTrips({ id: "4", text: "Review", done: false, repeat: "monthly", nth: -1, weekday: 5, leadDays: 2 });
    roundTrips({ id: "5", text: "Water", done: false, repeat: "custom", every: 3, unit: "day", date: "2026-10-11", leadDays: 0 });
    roundTrips({ id: "6", text: "Gym", done: false, repeat: "custom", every: 2, unit: "week", weekdays: [1, 4], date: "2026-10-11", count: 10, leadDays: 0 });
    roundTrips({ id: "7", text: "Insurance", done: false, repeat: "custom", every: 2, unit: "month", dayOfMonth: 31, date: "2026-10-31", leadDays: 3 });
    roundTrips({ id: "8", text: "Licence", done: false, repeat: "custom", every: 5, unit: "year", month: 3, dayOfMonth: 5, date: "2027-03-05", leadDays: 14 });
    roundTrips({ id: "9", text: "Pills", done: false, repeat: "daily", date: "2026-10-11", until: "2026-12-31", leadDays: 0, paused: true });
  });
});

describe("alarms ring at their minute", () => {
  const t = (iso: string) => new Date(`${iso}:00`);
  const flex: Reminder = { id: "f", text: "Flex", done: false, repeat: "weekly", weekdays: [1, 3], time: "06:30", leadDays: 0, alarm: true, leadMinutes: 10 };

  it("finds the ring and its heads-up inside the minute window", () => {
    expect(ringsBetween(flex, t("2026-10-12T06:19"), t("2026-10-12T06:20")).map((r) => `${r.kind} ${toStamp(r.at)}`)).toEqual(["early 2026-10-12T06:20"]);
    expect(ringsBetween(flex, t("2026-10-12T06:29"), t("2026-10-12T06:30")).map((r) => `${r.kind} ${toStamp(r.at)}`)).toEqual(["ring 2026-10-12T06:30"]);
    expect(ringsBetween(flex, t("2026-10-13T06:29"), t("2026-10-13T06:30"))).toEqual([]);
  });

  it("is pending until handled, and a snooze rings again later", () => {
    const now = t("2026-10-12T06:33");
    expect(toStamp(pendingRing(flex, now)!)).toBe("2026-10-12T06:30");
    const done = { ...flex, doneThrough: "2026-10-12T06:33" };
    expect(pendingRing(done, now)).toBeNull();
    expect(toStamp(nextRing(done, now)!)).toBe("2026-10-14T06:30");
    const snoozed = { ...flex, snoozedUntil: "2026-10-12T06:43" };
    expect(pendingRing(snoozed, now)).toBeNull();
    expect(toStamp(pendingRing(snoozed, t("2026-10-12T06:44"))!)).toBe("2026-10-12T06:43");
    expect(ringsBetween(snoozed, t("2026-10-12T06:42"), t("2026-10-12T06:43")).map((r) => r.kind)).toEqual(["snooze"]);
  });

  it("two times a day: handling the morning leaves the evening", () => {
    const pills: Reminder = { id: "p", text: "Pills", done: false, repeat: "daily", time: "08:00", times: ["08:00", "20:00"], leadDays: 0, alarm: true };
    const after = { ...pills, doneThrough: "2026-10-12T08:02" };
    expect(toStamp(nextRing(after, t("2026-10-12T08:02"))!)).toBe("2026-10-12T20:00");
    expect(toIsoDate(nextDueDate(after, t("2026-10-12T08:02"))!)).toBe("2026-10-12");
  });

  it("a reminder without a time never rings; with one, it pops", () => {
    expect(ringsBetween({ ...flex, alarm: false, time: undefined }, t("2026-10-12T00:00"), t("2026-10-12T23:59"))).toEqual([]);
    expect(ringsBetween({ ...flex, alarm: false }, t("2026-10-12T06:29"), t("2026-10-12T06:30")).map((r) => r.kind)).toEqual(["ring"]);
  });
});

describe("two copies of one reminder", () => {
  it("the newer wins, but done-through never goes back", () => {
    const a: Reminder = { ...base, updatedAt: "2026-10-12T10:00:00Z", doneThrough: "2026-11-03" };
    const b: Reminder = { ...base, text: "Car EMI (new)", updatedAt: "2026-10-12T11:00:00Z" };
    const merged = newerReminder(a, b);
    expect(merged.text).toBe("Car EMI (new)");
    expect(merged.doneThrough).toBe("2026-11-03");
  });
});

describe("parseRepeat", () => {
  it("reads the ways a cycle is said", () => {
    expect(parseRepeat("Every other week")).toBe("biweekly");
    expect(parseRepeat("fortnightly")).toBe("biweekly");
    expect(parseRepeat("bi-weekly")).toBe("biweekly");
    expect(parseRepeat("daily")).toBe("daily");
    expect(parseRepeat("annually")).toBe("yearly");
    expect(parseRepeat("once")).toBe("once");
    expect(parseRepeat("sometimes")).toBeUndefined();
    expect(parseRepeat(undefined)).toBeUndefined();
  });
});
