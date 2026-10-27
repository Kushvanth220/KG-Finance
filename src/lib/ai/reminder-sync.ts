import { newerReminder, type Reminder } from "@/lib/ai/reminders";

/**
 * Reminders kept level across any number of devices.
 *
 * Every save used to send the device's whole list, and the server took it as
 * the list: a phone that had not seen the laptop's new reminder erased it, and
 * a delete on one phone came straight back from the other. Now both sides
 * union by id (the newer copy of each wins) and a delete leaves a headstone —
 * the id and when it went — so it travels like any other change.
 */

/** Deleted reminder id → when it was deleted. */
export type ReminderTombstones = Record<string, string>;

/** Headstones older than this have reached every device that matters. */
export const REMINDER_TOMBSTONE_DAYS = 90;

/** Both sides' headstones, minus the ones old enough to forget. */
export function mergeTombstones(
  a: ReminderTombstones | undefined,
  b: ReminderTombstones | undefined,
  now = Date.now()
): ReminderTombstones {
  const cutoff = new Date(now - REMINDER_TOMBSTONE_DAYS * 86_400_000).toISOString();
  const merged: ReminderTombstones = {};
  for (const source of [a ?? {}, b ?? {}]) {
    for (const [id, at] of Object.entries(source)) {
      if (typeof at !== "string" || at <= cutoff) continue;
      if (!merged[id] || at > merged[id]) merged[id] = at;
    }
  }
  return merged;
}

/**
 * Union by id: each reminder both sides hold is settled by `newerReminder`,
 * one only a side holds is kept, and a deleted one is dropped. `mine` keeps
 * its order, with the other side's new ones after it.
 */
export function mergeReminderLists(
  mine: Reminder[],
  theirs: Reminder[],
  deleted: ReminderTombstones = {}
): Reminder[] {
  const theirsById = new Map(theirs.map((item) => [item.id, item]));
  const seen = new Set<string>();
  const merged: Reminder[] = [];
  for (const item of mine) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    const other = theirsById.get(item.id);
    merged.push(other ? newerReminder(item, other) : item);
  }
  for (const item of theirs) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }
  return merged.filter((item) => !deleted[item.id]);
}

/** The words without a trailing amount: "Car Wash - $36" and "Car Wash" are one bill. */
function baseText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s\-–—:·,]*\$?\s*\d[\d,]*(\.\d+)?\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** When it comes due, so two different bills that share a name are not taken for one. */
function scheduleKey(reminder: Reminder): string {
  return JSON.stringify([
    reminder.repeat,
    reminder.date ?? null,
    reminder.dayOfMonth ?? null,
    reminder.month ?? null,
    reminder.weekday ?? null,
    reminder.nth ?? null,
    reminder.every ?? null,
    reminder.unit ?? null,
    reminder.time ?? null,
    reminder.person ?? null,
  ]);
}

/**
 * Reminders that look like the same one saved twice: the same words (give or
 * take an amount at the end) on the same schedule for the same person. Each
 * group lists the copy worth keeping first — the one that names an amount,
 * then the most recently changed.
 */
export function findDoubledReminders(list: Reminder[]): Reminder[][] {
  const groups = new Map<string, Reminder[]>();
  for (const reminder of list) {
    if (reminder.done) continue;
    const key = `${baseText(reminder.text)}|${scheduleKey(reminder)}`;
    groups.set(key, [...(groups.get(key) ?? []), reminder]);
  }
  const hasAmount = (r: Reminder) => (r.amount ? 1 : 0) + (/\$\s*\d/.test(r.text) ? 1 : 0);
  return [...groups.values()]
    .filter((group) => group.length > 1)
    .map((group) =>
      [...group].sort(
        (a, b) => hasAmount(b) - hasAmount(a) || (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")
      )
    );
}

/** One reminder as text with its keys in order: the server's JSON comes back reordered. */
function stableText(reminder: Reminder): string {
  const record = reminder as unknown as Record<string, unknown>;
  return JSON.stringify(
    Object.keys(record)
      .filter((key) => key !== "line" && record[key] !== undefined)
      .sort()
      .map((key) => [key, record[key]])
  );
}

/**
 * The same text for the same reminders in any order. Two devices that list
 * them differently must not keep correcting each other.
 */
export function reminderFingerprint(list: Reminder[]): string {
  return list
    .map(stableText)
    .sort()
    .join("\n");
}
