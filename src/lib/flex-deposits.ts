import type { Rule, RuleEntry } from "@/lib/rules/types";
import type { FlexDeposit, FlexDepositPart, IncomeEntry } from "@/types";
import { resolveEntry } from "@/lib/rules/engine";
import { roundMoney } from "@/lib/money";
import { flexIncomeIds } from "@/lib/flex-income";

/**
 * Flex payouts: when the money actually lands, and whether it did.
 *
 * Amazon pays Flex drivers twice a week — Tuesday and Friday — for the blocks
 * finished before the cut-off. So a block is EARNED the day it is driven and
 * DEPOSITED days later. Writing the income the moment a block was logged put
 * the bank balance in the app ahead of the real one for up to four days.
 *
 * This module keeps the two apart:
 *  - every block splits into parts (base pay; tips once they are known);
 *  - parts not yet covered by a confirmed deposit are grouped under the
 *    payout day they belong to — the expected payouts;
 *  - a deposit record says a payout landed, for how much, and which parts it
 *    covered. Only then is income written, dated the day it landed.
 *
 * Tips that arrive after their block's payout was already confirmed roll
 * forward to the next payout, the way Amazon does it.
 */

/** Tuesday and Friday, as `Date.getDay()` counts. */
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
  date: string;
  parts: FlexDepositPart[];
  base: number;
  tips: number;
  total: number;
  /** Distinct blocks with something in this payout. */
  blocks: number;
  /** Days past the payout day, 0 when it is today or still ahead. */
  overdueDays: number;
  status: "upcoming" | "due";
}

function partKey(part: Pick<FlexDepositPart, "entryId" | "part">): string {
  return `${part.part}:${part.entryId}`;
}

/** Every part of every block from `postFrom` on, whether covered or not. */
export function blockParts(rule: Rule, entries: RuleEntry[], postFrom: string): FlexDepositPart[] {
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

export function expectedPayouts(
  rule: Rule,
  entries: RuleEntry[],
  deposits: FlexDeposit[],
  incomeEntries: IncomeEntry[],
  postFrom: string,
  today: string
): ExpectedPayout[] {
  const covered = coveredParts(deposits, incomeEntries);
  const latest = deposits.reduce<string | null>((max, d) => (max === null || d.date > max ? d.date : max), null);

  const byDate = new Map<string, FlexDepositPart[]>();
  for (const part of blockParts(rule, entries, postFrom)) {
    if (covered.has(partKey(part))) continue;
    const date = payoutDateFor(part.blockDate, latest);
    byDate.set(date, [...(byDate.get(date) ?? []), part]);
  }

  const todayAt = fromIso(today).getTime();
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, parts]) => {
      const base = roundMoney(parts.filter((p) => p.part === "base").reduce((s, p) => s + p.amount, 0));
      const tips = roundMoney(parts.filter((p) => p.part === "tip").reduce((s, p) => s + p.amount, 0));
      const overdueDays = Math.max(0, Math.round((todayAt - fromIso(date).getTime()) / 86_400_000));
      return {
        date,
        parts,
        base,
        tips,
        total: roundMoney(base + tips),
        blocks: new Set(parts.map((p) => p.entryId)).size,
        overdueDays,
        status: date <= today ? "due" : "upcoming",
      };
    });
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
