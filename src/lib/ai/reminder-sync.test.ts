import { describe, expect, it } from "vitest";
import {
  findDoubledReminders,
  mergeReminderLists,
  mergeTombstones,
  reminderFingerprint,
  REMINDER_TOMBSTONE_DAYS,
} from "@/lib/ai/reminder-sync";
import type { Reminder } from "@/lib/ai/reminders";

/**
 * Several devices save the same reminder list. Whatever order they save in,
 * none of them may erase another's new reminder, and a delete must stick.
 */

const make = (id: string, text: string, updatedAt?: string): Reminder => ({
  id,
  text,
  done: false,
  repeat: "monthly",
  leadDays: 5,
  dayOfMonth: 3,
  ...(updatedAt ? { updatedAt } : {}),
});

describe("mergeReminderLists", () => {
  it("keeps a reminder only the other device has", () => {
    const phone = [make("a", "Rent")];
    const laptop = [make("a", "Rent"), make("b", "Gym")];
    expect(mergeReminderLists(phone, laptop).map((r) => r.id)).toEqual(["a", "b"]);
    expect(mergeReminderLists(laptop, phone).map((r) => r.id)).toEqual(["a", "b"]);
  });

  it("takes the newer copy of one both devices hold", () => {
    const old = make("a", "Car Wash", "2026-10-01T00:00:00.000Z");
    const edited = make("a", "Car Wash - $36", "2026-10-02T00:00:00.000Z");
    expect(mergeReminderLists([old], [edited])[0]!.text).toBe("Car Wash - $36");
    expect(mergeReminderLists([edited], [old])[0]!.text).toBe("Car Wash - $36");
  });

  it("drops a deleted one, wherever it is still held", () => {
    const deleted = { b: "2026-10-03T00:00:00.000Z" };
    const stale = [make("a", "Rent"), make("b", "Gym")];
    expect(mergeReminderLists(stale, [make("a", "Rent")], deleted).map((r) => r.id)).toEqual(["a"]);
    expect(mergeReminderLists([make("a", "Rent")], stale, deleted).map((r) => r.id)).toEqual(["a"]);
  });

  it("keeps this device's order and puts the other's new ones after", () => {
    const mine = [make("c", "C"), make("a", "A")];
    const theirs = [make("a", "A"), make("b", "B"), make("c", "C")];
    expect(mergeReminderLists(mine, theirs).map((r) => r.id)).toEqual(["c", "a", "b"]);
  });

  it("never lists one id twice", () => {
    const mine = [make("a", "A"), make("a", "A again")];
    expect(mergeReminderLists(mine, [make("a", "A")])).toHaveLength(1);
  });

  it("arrives at the same list whichever device saves first", () => {
    const phone = [make("a", "Rent", "2026-10-05T00:00:00.000Z"), make("p", "Phone only")];
    const laptop = [make("a", "Rent - $900", "2026-10-06T00:00:00.000Z"), make("l", "Laptop only")];
    const one = mergeReminderLists(phone, laptop);
    const two = mergeReminderLists(laptop, phone);
    expect(reminderFingerprint(one)).toBe(reminderFingerprint(two));
  });
});

describe("mergeTombstones", () => {
  const now = Date.parse("2026-10-22T00:00:00.000Z");

  it("joins both sides and keeps the later time", () => {
    const merged = mergeTombstones(
      { a: "2026-10-01T00:00:00.000Z", b: "2026-10-02T00:00:00.000Z" },
      { b: "2026-10-05T00:00:00.000Z", c: "2026-10-06T00:00:00.000Z" },
      now
    );
    expect(merged).toEqual({
      a: "2026-10-01T00:00:00.000Z",
      b: "2026-10-05T00:00:00.000Z",
      c: "2026-10-06T00:00:00.000Z",
    });
  });

  it(`forgets headstones older than ${REMINDER_TOMBSTONE_DAYS} days`, () => {
    const old = new Date(now - (REMINDER_TOMBSTONE_DAYS + 1) * 86_400_000).toISOString();
    expect(mergeTombstones({ a: old }, undefined, now)).toEqual({});
  });
});

describe("findDoubledReminders", () => {
  it("pairs a bill saved with and without its amount, keeping the one with the amount", () => {
    const plain = make("a", "Car Wash");
    const priced = make("b", "Car Wash - $36");
    const groups = findDoubledReminders([plain, priced, make("c", "Rent")]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("keeps the most recently changed of two identical copies first", () => {
    const older = make("a", "India - $300");
    const newer = make("b", "India - $300", "2026-10-12T05:04:47.669Z");
    expect(findDoubledReminders([older, newer])[0]!.map((r) => r.id)).toEqual(["b", "a"]);
  });

  it("leaves alone same-named reminders on different days", () => {
    const first = make("a", "Car Bill");
    const second = { ...make("b", "Car Bill - $270"), dayOfMonth: 20 };
    expect(findDoubledReminders([first, second])).toEqual([]);
  });
});

describe("reminderFingerprint", () => {
  it("ignores order, key order, the stored sentence and empty fields", () => {
    const a = make("a", "Rent");
    const b = make("b", "Gym");
    const reordered = JSON.parse(
      JSON.stringify({ text: "Rent", id: "a", line: "Rent — due the 3rd", leadDays: 5, dayOfMonth: 3, repeat: "monthly", done: false })
    ) as Reminder;
    expect(reminderFingerprint([a, b])).toBe(reminderFingerprint([b, reordered]));
    expect(reminderFingerprint([{ ...a, snoozedUntil: undefined }])).toBe(reminderFingerprint([a]));
  });

  it("changes when a reminder does", () => {
    expect(reminderFingerprint([make("a", "Rent")])).not.toBe(reminderFingerprint([make("a", "Rent - $900")]));
  });
});
