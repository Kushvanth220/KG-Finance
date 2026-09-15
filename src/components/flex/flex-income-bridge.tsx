"use client";

import { useEffect } from "react";
import { useRulesStore } from "@/store/rules-store";
import { useFinanceStore } from "@/store/finance-store";
import { findFlexRule } from "@/lib/flex";
import { expectedPayouts } from "@/lib/flex-deposits";
import { confirmFlexDeposit } from "@/lib/flex-deposit-actions";
import { zonedToday } from "@/lib/zoned-date";

/**
 * Confirms Flex payouts on their day, when the rule asks for it.
 *
 * Income used to be written the moment a block was logged, which put the
 * bank balance in the app days ahead of the real one. Now a payout is only
 * written on its Tuesday or Friday — for the expected amount, marked as
 * automatic — and can be corrected to what actually landed afterwards.
 *
 * Mounted once in the shell so it runs whichever page is open. Deposit ids
 * are derived from the payout day, so two phones doing this at once still
 * make one record.
 */
export function FlexIncomeBridge() {
  const rules = useRulesStore((state) => state.rules);
  const entries = useRulesStore((state) => state.entries);
  const incomeEntries = useFinanceStore((state) => state.incomeEntries);
  const flexDeposits = useFinanceStore((state) => state.flexDeposits);
  const accounts = useFinanceStore((state) => state.accounts);

  useEffect(() => {
    const rule = findFlexRule(rules);
    if (!rule?.payout.autoPost || !rule.payout.accountId || !rule.payout.postFrom) return;
    if (!accounts.some((a) => a.id === rule.payout.accountId)) return;

    const today = zonedToday();
    const due = expectedPayouts(rule, entries, flexDeposits ?? [], incomeEntries, rule.payout.postFrom, today).filter(
      (payout) => payout.status === "due"
    );
    // One at a time: each confirmation changes the store, and the effect
    // runs again for the next.
    const next = due[0];
    if (!next) return;
    confirmFlexDeposit({
      date: next.date,
      accountId: rule.payout.accountId,
      actual: next.total,
      parts: next.parts,
      auto: true,
    });
  }, [rules, entries, incomeEntries, flexDeposits, accounts]);

  return null;
}
