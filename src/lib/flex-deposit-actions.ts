import { useFinanceStore } from "@/store/finance-store";
import { FLEX_BASE_SOURCE, FLEX_TIP_SOURCE, isFlexSource } from "@/lib/flex-income";
import { depositIdFor, depositIncomeEntries, depositIncomeIds } from "@/lib/flex-deposits";
import { roundMoney } from "@/lib/money";
import type { FlexDeposit, FlexDepositPart } from "@/types";

/**
 * The three things that can happen to a Flex deposit — confirmed, revised,
 * removed — each done as one unit against the finance store: the record and
 * the income it implies, together. The page and the payout-day bridge both
 * go through here, so a tap and an automatic confirmation write the same
 * thing.
 */

/** The two Flex income sources, made if missing. */
export function ensureFlexSources(): { baseId: string; tipId: string } {
  const store = useFinanceStore.getState();
  const find = () => {
    const sources = useFinanceStore.getState().incomeSources;
    return {
      base: sources.find((s) => isFlexSource(s) && /base/i.test(s.name)),
      tip: sources.find((s) => isFlexSource(s) && /tip/i.test(s.name)),
    };
  };
  let { base, tip } = find();
  if (!base) {
    store.addIncomeSource("kushvanth", FLEX_BASE_SOURCE);
    base = find().base;
  }
  if (!tip) {
    store.addIncomeSource("kushvanth", FLEX_TIP_SOURCE);
    tip = find().tip;
  }
  return { baseId: base!.id, tipId: tip!.id };
}

export interface ConfirmDepositInput {
  date: string;
  accountId: string;
  actual: number;
  parts: FlexDepositPart[];
  note?: string;
  auto?: boolean;
}

/** Records the payout as landed and writes its income. Returns the record. */
export function confirmFlexDeposit(input: ConfirmDepositInput): FlexDeposit {
  const store = useFinanceStore.getState();
  const expected = roundMoney(input.parts.reduce((sum, part) => sum + part.amount, 0));
  const deposit: FlexDeposit = {
    id: depositIdFor(input.date, store.flexDeposits ?? []),
    date: input.date,
    accountId: input.accountId,
    expected,
    actual: roundMoney(input.actual),
    parts: input.parts,
    note: input.note?.trim() || undefined,
    createdAt: new Date().toISOString(),
    auto: input.auto || undefined,
  };
  store.addFlexDeposit(deposit);
  const sources = ensureFlexSources();
  const add = useFinanceStore.getState().addIncome;
  for (const entry of depositIncomeEntries(deposit, sources)) add(entry);
  return deposit;
}

/** Changes what landed (or when, or where); the income follows. */
export function reviseFlexDeposit(
  id: string,
  updates: Partial<Pick<FlexDeposit, "date" | "actual" | "accountId" | "note">>
): void {
  const store = useFinanceStore.getState();
  const current = (store.flexDeposits ?? []).find((d) => d.id === id);
  if (!current) return;
  const next: FlexDeposit = {
    ...current,
    ...updates,
    actual: updates.actual === undefined ? current.actual : roundMoney(updates.actual),
    auto: undefined,
  };
  const ids = depositIncomeIds(id);
  store.deleteIncome(ids.base, "kushvanth");
  store.deleteIncome(ids.tip, "kushvanth");
  store.updateFlexDeposit(id, next);
  const sources = ensureFlexSources();
  const add = useFinanceStore.getState().addIncome;
  for (const entry of depositIncomeEntries(next, sources)) add(entry);
}

/** Takes the deposit back out; its blocks become owed again. */
export function deleteFlexDeposit(id: string): void {
  const store = useFinanceStore.getState();
  const ids = depositIncomeIds(id);
  store.deleteIncome(ids.base, "kushvanth");
  store.deleteIncome(ids.tip, "kushvanth");
  store.removeFlexDeposit(id);
}
