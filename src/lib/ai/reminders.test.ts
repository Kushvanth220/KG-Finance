import { describe, expect, it } from "vitest";
import {
  dueLabel,
  isDueSoon,
  isSnoozed,
  reminderFromLegacyLine,
  renderReminderLine,
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
