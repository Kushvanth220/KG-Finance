import type { Rule, RuleEntry } from "@/lib/rules/types";
import type { IncomeEntry, IncomeSource } from "@/types";
import { resolveEntry } from "@/lib/rules/engine";
import { roundMoney } from "@/lib/money";

/**
 * Flex blocks and Flex income, kept in step.
 *
 * Blocks say what was EARNED; income entries say what was DEPOSITED. They are
 * different facts a week apart, and both were already being kept — blocks on
 * the Flex page, deposits by hand under "Flex Base Pay" and "Flex Tip". So
 * posting every block as income would have counted the money twice.
 *
 * This module lines the two totals up, so "earned but not yet deposited" is
 * a number rather than a feeling. Writing the income itself happens per
 * payout, in flex-deposits — blocks are never posted the day they are logged.
 *
 * `flexIncomeIds` names the per-block entries an earlier version wrote the
 * moment a block was logged; they are kept so those blocks still count as
 * deposited.
 */

export const FLEX_BASE_SOURCE = "Flex Base Pay";
export const FLEX_TIP_SOURCE = "Flex Tip";

/** Any income source that is about Flex, however it was named. */
export function isFlexSource(source: IncomeSource): boolean {
  return /flex/i.test(source.name);
}

export function flexIncomeIds(entryId: string) {
  return { base: `flex-base-${entryId}`, tip: `flex-tip-${entryId}` };
}

export interface FlexReconciliation {
  earnedBase: number;
  earnedTips: number;
  earned: number;
  depositedBase: number;
  depositedTips: number;
  deposited: number;
  /** Earned minus deposited; positive means money still on its way. */
  outstanding: number;
  blocksAwaitingTips: number;
}

export function reconcileFlex(
  rule: Rule,
  entries: RuleEntry[],
  incomeEntries: IncomeEntry[],
  incomeSources: IncomeSource[]
): FlexReconciliation {
  let earnedBase = 0;
  let earnedTips = 0;
  let blocksAwaitingTips = 0;
  for (const entry of entries) {
    if (entry.ruleId !== rule.id) continue;
    const values = resolveEntry(rule, entry);
    earnedBase += Number(values.base_pay ?? 0);
    if (values.tips === undefined || values.tips === "") blocksAwaitingTips += 1;
    else earnedTips += Number(values.tips ?? 0);
  }

  const baseIds = new Set(
    incomeSources.filter((s) => isFlexSource(s) && /base/i.test(s.name)).map((s) => s.id)
  );
  const tipIds = new Set(
    incomeSources.filter((s) => isFlexSource(s) && /tip/i.test(s.name)).map((s) => s.id)
  );
  const otherFlex = new Set(
    incomeSources.filter((s) => isFlexSource(s) && !baseIds.has(s.id) && !tipIds.has(s.id)).map((s) => s.id)
  );

  let depositedBase = 0;
  let depositedTips = 0;
  for (const income of incomeEntries) {
    if (baseIds.has(income.sourceId) || otherFlex.has(income.sourceId)) depositedBase += income.amount;
    else if (tipIds.has(income.sourceId)) depositedTips += income.amount;
  }

  const earned = roundMoney(earnedBase + earnedTips);
  const deposited = roundMoney(depositedBase + depositedTips);
  return {
    earnedBase: roundMoney(earnedBase),
    earnedTips: roundMoney(earnedTips),
    earned,
    depositedBase: roundMoney(depositedBase),
    depositedTips: roundMoney(depositedTips),
    deposited,
    outstanding: roundMoney(earned - deposited),
    blocksAwaitingTips,
  };
}
