import { compareByDateTimeAsc, parseAppDateTime } from "@/lib/formatters";
import { roundMoney } from "@/lib/money";
import { isExternalBalanceTransaction, resolveLinkedTransactionId } from "@/lib/settlement";
import type { SettlementEntry, Person, Transaction } from "@/types";

/**
 * Readings of the Balance ledger that turn one number into a story: how
 * the balance moved over the last month, when it started building, and who
 * has been paying for whom lately. All pure; the page just draws them.
 *
 * Entries are expected with their running balances already recomputed
 * (`getDisplaySettlementHistory`), in either order.
 */

const DAY_MS = 86_400_000;

function ascending(history: SettlementEntry[]): SettlementEntry[] {
  return [...history].sort(compareByDateTimeAsc);
}

function endOfDayMs(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999).getTime();
}

function at(entry: SettlementEntry): number {
  return parseAppDateTime(entry.date, entry.time, entry.timestamp).getTime();
}

export interface TimelinePoint {
  date: Date;
  balance: number;
}

/** The balance at the end of each of the last `days` days, oldest first. */
export function balanceTimeline(
  history: SettlementEntry[],
  days = 30,
  now: Date = new Date()
): TimelinePoint[] {
  const sorted = ascending(history);
  const points: TimelinePoint[] = [];
  let cursor = 0;
  let balance = 0;
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const limit = endOfDayMs(date);
    while (cursor < sorted.length && at(sorted[cursor]!) <= limit) {
      balance = sorted[cursor]!.runningBalance;
      cursor += 1;
    }
    points.push({ date, balance: roundMoney(balance) });
  }
  return points;
}

/** How much the balance moved since the month began (positive = more owed to Kushvanth). */
export function monthDelta(history: SettlementEntry[], now: Date = new Date()): number {
  const sorted = ascending(history);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  let before = 0;
  let current = 0;
  for (const entry of sorted) {
    if (at(entry) < monthStart) before = entry.runningBalance;
    current = entry.runningBalance;
  }
  return roundMoney(current - before);
}

/**
 * When the current debt started: the first entry after the balance was last
 * on the other side (or at zero). Null when settled or empty.
 */
export function owedSince(history: SettlementEntry[]): Date | null {
  const sorted = ascending(history);
  if (sorted.length === 0) return null;
  const current = sorted[sorted.length - 1]!.runningBalance;
  if (Math.abs(current) < 0.005) return null;
  const sign = Math.sign(current);
  let since = sorted[0]!;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const bal = sorted[i]!.runningBalance;
    if (Math.abs(bal) < 0.005 || Math.sign(bal) !== sign) {
      since = sorted[i + 1] ?? sorted[i]!;
      break;
    }
    since = sorted[i]!;
  }
  return parseAppDateTime(since.date, since.time, since.timestamp);
}

/** What each person paid for the other in the month of `now`. */
export function monthPaid(
  history: SettlementEntry[],
  now: Date = new Date()
): Record<Person, number> {
  const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();
  const totals: Record<Person, number> = { kushvanth: 0, g: 0 };
  for (const entry of history) {
    const when = at(entry);
    if (when < start || when >= end) continue;
    if (entry.amount <= 0) continue;
    totals[entry.paidBy] = roundMoney(totals[entry.paidBy] + entry.amount);
  }
  return totals;
}

export type EntryKind = "spend" | "outside" | "other";

/** Whether an entry came from a spend, from money outside the accounts, or elsewhere. */
export function classifyEntry(entry: SettlementEntry, transactions: Transaction[]): {
  kind: EntryKind;
  linkedTransactionId?: string;
} {
  const linkedTransactionId = resolveLinkedTransactionId(entry, transactions);
  const linked = linkedTransactionId ? transactions.find((t) => t.id === linkedTransactionId) : undefined;
  if (!linked) return { kind: "other", linkedTransactionId };
  if (isExternalBalanceTransaction(linked)) return { kind: "outside", linkedTransactionId };
  if (linked.type === "settlement") return { kind: "other", linkedTransactionId };
  return { kind: "spend", linkedTransactionId };
}

/** Days between two dates, whole. */
export function daysBetween(a: Date, b: Date): number {
  return Math.round(Math.abs(b.getTime() - a.getTime()) / DAY_MS);
}
