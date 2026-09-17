import type { Rule, RuleEntry } from "@/lib/rules/types";
import type { FlexDeposit, FlexDepositPart, IncomeEntry, IncomeSource } from "@/types";
import { resolveEntry } from "@/lib/rules/engine";
import { roundMoney } from "@/lib/money";
import { flexIncomeIds, isFlexSource } from "@/lib/flex-income";

/**
 * Flex payouts: what the blocks say was earned, against what was actually
 * recorded as Flex income.
 *
 * A block is EARNED the day it is driven and lands in the bank a day or two
 * later; the driver records the money as Flex income when it shows up. This
 * module matches those two streams so nothing is counted twice and nothing
 * is forgotten:
 *  - every block splits into parts (base pay; tips once they are known);
 *  - the Flex income recorded on a day is matched, in order, to the driven
 *    days it pays for — the money for Monday arrives before Tuesday's does;
 *  - whatever the income does not cover is still pending, shown under the
 *    day it was driven with the day it will probably land, learned from how
 *    long the earlier ones took;
 *  - anything recorded beyond what the blocks add up to is called out, so a
 *    day entered twice is visible rather than silently inflating the total.
 *
 * A payout can also be recorded from here ("Landed"): that writes a deposit
 * record plus the income entries, which then cover their parts directly.
 */

/**
 * Amazon's standard payout days, Tuesday and Friday, as `Date.getDay()`
 * counts. Only a reference: the ledger learns the real lag from the records.
 */
export const PAYOUT_WEEKDAYS: readonly number[] = [2, 5];

function fromIso(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

function toIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** The first payout day strictly after `dateIso`. */
export function nextPayoutDate(dateIso: string): string {
  const at = fromIso(dateIso);
  for (let i = 1; i <= 7; i++) {
    const candidate = new Date(at.getFullYear(), at.getMonth(), at.getDate() + i);
    if (PAYOUT_WEEKDAYS.includes(candidate.getDay())) return toIso(candidate);
  }
  return dateIso;
}

/**
 * Which payout a block part belongs to. Its natural payout is the first
 * payout day after the block; anything that would have landed on or before
 * the latest confirmed deposit missed that payout and rolls to the next.
 */
export function payoutDateFor(blockDate: string, latestDepositDate: string | null): string {
  const natural = nextPayoutDate(blockDate);
  if (latestDepositDate && natural <= latestDepositDate) return nextPayoutDate(latestDepositDate);
  return natural;
}

export interface ExpectedPayout {
  /** The day the blocks were driven. */
  date: string;
  /** When the money will probably show up, from how long earlier ones took. */
  expectedOn: string;
  parts: FlexDepositPart[];
  base: number;
  tips: number;
  total: number;
  /** Distinct blocks with something in this payout. */
  blocks: number;
  /** Days past `expectedOn`, 0 when it is today or still ahead. */
  overdueDays: number;
  status: "upcoming" | "due";
}

function partKey(part: Pick<FlexDepositPart, "entryId" | "part">): string {
  return `${part.part}:${part.entryId}`;
}

/** Every part of every block from `postFrom` on (`ALL_TIME` for all of them), covered or not. */
export const ALL_TIME = "0000-01-01";

export function blockParts(rule: Rule, entries: RuleEntry[], postFrom: string = ALL_TIME): FlexDepositPart[] {
  const parts: FlexDepositPart[] = [];
  for (const entry of entries) {
    if (entry.ruleId !== rule.id || entry.date < postFrom) continue;
    const values = resolveEntry(rule, entry);
    const base = roundMoney(Number(values.base_pay ?? 0));
    if (base > 0) parts.push({ entryId: entry.id, part: "base", amount: base, blockDate: entry.date });
    const tips = values.tips === undefined || values.tips === "" ? null : roundMoney(Number(values.tips));
    if (tips !== null && tips > 0) parts.push({ entryId: entry.id, part: "tip", amount: tips, blockDate: entry.date });
  }
  return parts;
}

/**
 * Parts already accounted for: by a confirmed deposit, or by the older
 * per-block income entries the app used to write the moment a block was
 * logged (ids `flex-base-<block>` / `flex-tip-<block>`). Those stay as they
 * are; they just never show up as owed again.
 */
export function coveredParts(deposits: FlexDeposit[], incomeEntries: IncomeEntry[]): Set<string> {
  const covered = new Set<string>();
  for (const deposit of deposits) for (const part of deposit.parts) covered.add(partKey(part));
  for (const income of incomeEntries) {
    if (income.id.startsWith("flex-base-")) covered.add(`base:${income.id.slice("flex-base-".length)}`);
    else if (income.id.startsWith("flex-tip-")) covered.add(`tip:${income.id.slice("flex-tip-".length)}`);
  }
  return covered;
}

/** One recorded day of Flex income and the driven days it paid for. */
export interface RecordedMatch {
  /** The day the money was recorded. */
  date: string;
  /** All Flex income recorded that day. */
  amount: number;
  /** Driven days this record paid for, oldest first. */
  covers: Array<{ blockDate: string; total: number }>;
  /** Recorded beyond what the covered days add up to — a day entered twice, usually. */
  excess: number;
  /** Recorded a little under the covered days — bank rounding or a tip adjustment. */
  shortfall: number;
}

export interface FlexLedger {
  /** Driven days whose money has not been recorded yet, oldest first. */
  pending: ExpectedPayout[];
  matches: RecordedMatch[];
  /** Sum of every record's excess. */
  excess: number;
  /** Sum of every record's shortfall. */
  shortfall: number;
  /** Typical days from driving to the money being recorded. */
  lagDays: number;
  /** Whether `lagDays` was learned from this driver's records or is the default. */
  lagLearned: boolean;
}

/** A day of driving counts as paid by a record that is within this much of it. */
const MATCH_TOLERANCE = 1;
/** Until enough records exist to learn from: Flex money usually shows up two days later. */
const DEFAULT_LAG_DAYS = 2;

function isAppWrittenFlexIncome(id: string): boolean {
  return id.startsWith("flex-base-") || id.startsWith("flex-tip-") || id.startsWith("flex-dep-");
}

function addDays(dateIso: string, days: number): string {
  const at = fromIso(dateIso);
  return toIso(new Date(at.getFullYear(), at.getMonth(), at.getDate() + days));
}

function daysBetween(fromDate: string, toDate: string): number {
  return Math.round((fromIso(toDate).getTime() - fromIso(fromDate).getTime()) / 86_400_000);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/**
 * Match recorded Flex income to driven days and list what is still pending.
 *
 * Records are walked oldest first; each one pays for the oldest unpaid driven
 * days, in order, for as long as its amount lasts (within the tolerance). Money
 * cannot pay for a day driven after it was recorded. What a record has left
 * over is its excess; what it fell short by is its shortfall.
 */
export function matchRecordedIncome(
  rule: Rule,
  entries: RuleEntry[],
  deposits: FlexDeposit[],
  incomeEntries: IncomeEntry[],
  incomeSources: IncomeSource[],
  today: string
): FlexLedger {
  const covered = coveredParts(deposits, incomeEntries);

  const byDay = new Map<string, FlexDepositPart[]>();
  for (const part of blockParts(rule, entries)) {
    if (covered.has(partKey(part))) continue;
    byDay.set(part.blockDate, [...(byDay.get(part.blockDate) ?? []), part]);
  }
  const days = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, parts]) => ({ date, parts, total: roundMoney(parts.reduce((sum, p) => sum + p.amount, 0)) }));

  const flexSources = new Set(incomeSources.filter(isFlexSource).map((source) => source.id));
  const recordedByDay = new Map<string, number>();
  for (const income of incomeEntries) {
    if (!flexSources.has(income.sourceId) || isAppWrittenFlexIncome(income.id)) continue;
    recordedByDay.set(income.date, roundMoney((recordedByDay.get(income.date) ?? 0) + income.amount));
  }
  const records = [...recordedByDay.entries()].sort(([a], [b]) => a.localeCompare(b));

  const matches: RecordedMatch[] = [];
  const lags: number[] = [];
  let next = 0;
  for (const [date, amount] of records) {
    let remaining = amount;
    const covers: RecordedMatch["covers"] = [];
    while (next < days.length && days[next]!.date <= date && remaining >= days[next]!.total - MATCH_TOLERANCE) {
      const day = days[next]!;
      covers.push({ blockDate: day.date, total: day.total });
      remaining = roundMoney(remaining - day.total);
      next += 1;
    }
    const excess = remaining > MATCH_TOLERANCE ? remaining : 0;
    const shortfall = remaining < 0 ? roundMoney(-remaining) : 0;
    if (covers.length > 0) lags.push(daysBetween(covers[covers.length - 1]!.blockDate, date));
    matches.push({ date, amount, covers, excess, shortfall });
  }

  const lagLearned = lags.length >= 2;
  const lagDays = lagLearned ? Math.max(0, Math.round(median(lags))) : DEFAULT_LAG_DAYS;
  const todayAt = fromIso(today).getTime();

  const pending: ExpectedPayout[] = days.slice(next).map((day) => {
    const base = roundMoney(day.parts.filter((p) => p.part === "base").reduce((sum, p) => sum + p.amount, 0));
    const tips = roundMoney(day.parts.filter((p) => p.part === "tip").reduce((sum, p) => sum + p.amount, 0));
    const expectedOn = addDays(day.date, lagDays);
    const overdueDays = Math.max(0, Math.round((todayAt - fromIso(expectedOn).getTime()) / 86_400_000));
    return {
      date: day.date,
      expectedOn,
      parts: day.parts,
      base,
      tips,
      total: day.total,
      blocks: new Set(day.parts.map((p) => p.entryId)).size,
      overdueDays,
      status: expectedOn <= today ? "due" : "upcoming",
    };
  });

  return {
    pending,
    matches,
    excess: roundMoney(matches.reduce((sum, m) => sum + m.excess, 0)),
    shortfall: roundMoney(matches.reduce((sum, m) => sum + m.shortfall, 0)),
    lagDays,
    lagLearned,
  };
}

/** The pending days only — for callers that act on what is due. */
export function expectedPayouts(
  rule: Rule,
  entries: RuleEntry[],
  deposits: FlexDeposit[],
  incomeEntries: IncomeEntry[],
  incomeSources: IncomeSource[],
  today: string
): ExpectedPayout[] {
  return matchRecordedIncome(rule, entries, deposits, incomeEntries, incomeSources, today).pending;
}

/**
 * How a landed amount splits into base and tips. Base is what Amazon quoted
 * and never moves; the tips absorb any difference, because tips are the part
 * Amazon adjusts. Short of the base and it is all base.
 */
export function splitLanded(actual: number, expectedBase: number, expectedTips: number) {
  const base = roundMoney(Math.min(Math.max(actual, 0), expectedBase));
  const tips = roundMoney(Math.max(0, actual - base));
  return { base, tips, difference: roundMoney(actual - (expectedBase + expectedTips)) };
}

export function depositIncomeIds(depositId: string) {
  return { base: `flex-dep-${depositId}-base`, tip: `flex-dep-${depositId}-tip` };
}

/** A deposit id that two phones confirming the same payout will both arrive at. */
export function depositIdFor(date: string, existing: FlexDeposit[]): string {
  const sameDay = existing.filter((d) => d.date === date).length;
  return sameDay === 0 ? `flexdep-${date}` : `flexdep-${date}-${sameDay + 1}`;
}

/**
 * The income a confirmed deposit writes: one entry for base pay, one for
 * tips, both dated the day the money landed. Ids come from the deposit, so
 * confirming from two phones still makes one pair.
 */
export function depositIncomeEntries(
  deposit: FlexDeposit,
  sources: { baseId: string; tipId: string }
): Array<Omit<IncomeEntry, "id"> & { id: string }> {
  const ids = depositIncomeIds(deposit.id);
  const expectedBase = roundMoney(deposit.parts.filter((p) => p.part === "base").reduce((s, p) => s + p.amount, 0));
  const expectedTips = roundMoney(deposit.parts.filter((p) => p.part === "tip").reduce((s, p) => s + p.amount, 0));
  const { base, tips } = splitLanded(deposit.actual, expectedBase, expectedTips);
  const blocks = new Set(deposit.parts.map((p) => p.entryId)).size;
  const label = `Flex payout ${deposit.date.slice(5, 7)}/${deposit.date.slice(8, 10)} · ${blocks} ${blocks === 1 ? "block" : "blocks"}`;
  const out: Array<Omit<IncomeEntry, "id"> & { id: string }> = [];
  if (base > 0) {
    out.push({
      id: ids.base,
      person: "kushvanth",
      sourceId: sources.baseId,
      amount: base,
      date: deposit.date,
      depositType: "debit",
      depositAccountId: deposit.accountId,
      notes: `${label} — base pay`,
    });
  }
  if (tips > 0) {
    out.push({
      id: ids.tip,
      person: "kushvanth",
      sourceId: sources.tipId,
      amount: tips,
      date: deposit.date,
      depositType: "debit",
      depositAccountId: deposit.accountId,
      notes: `${label} — tips${deposit.actual !== expectedBase + expectedTips ? " (adjusted)" : ""}`,
    });
  }
  return out;
}

/** Blocks whose tips are still blank after `hours` — the ones worth chasing. */
export function blocksAwaitingTips(rule: Rule, entries: RuleEntry[], hours: number, now: Date = new Date()): RuleEntry[] {
  const limit = now.getTime() - hours * 3_600_000;
  return entries.filter((entry) => {
    if (entry.ruleId !== rule.id) return false;
    const values = resolveEntry(rule, entry);
    if (values.tips !== undefined && values.tips !== "") return false;
    const finish = String(values.finish_time ?? "23:59");
    const finishedAt = new Date(`${entry.date}T${finish.length === 5 ? finish : "23:59"}:00`).getTime();
    return Number.isFinite(finishedAt) && finishedAt <= limit;
  });
}

/** Keeps the old per-block ids importable from one place. */
export { flexIncomeIds };
