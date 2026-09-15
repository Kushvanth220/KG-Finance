import type { FinanceState, SpendCategory } from "@/types";

/**
 * What a brand-new workspace starts with: no accounts, no history, and a
 * handful of spend categories so the Spend page is usable straight away.
 * Everything else is created by the people using the app, then synced.
 */
export const DEFAULT_SPEND_CATEGORIES: SpendCategory[] = [
  { id: "cat-groceries", name: "Groceries" },
  { id: "cat-food", name: "Food & dining" },
  { id: "cat-gas", name: "Gas" },
  { id: "cat-rent", name: "Rent" },
  { id: "cat-utilities", name: "Utilities" },
  { id: "cat-subscriptions", name: "Subscriptions" },
  { id: "cat-shopping", name: "Shopping" },
  { id: "cat-transport", name: "Transport" },
  { id: "cat-health", name: "Health" },
  { id: "cat-entertainment", name: "Entertainment" },
  { id: "cat-cash", name: "Cash withdrawal" },
  { id: "cat-debt", name: "Debt payment" },
  { id: "cat-other", name: "Other" },
];

export function createEmptyFinanceState(): FinanceState {
  return {
    incomeSources: [],
    incomeEntries: [],
    spendCategories: DEFAULT_SPEND_CATEGORIES.map((category) => ({ ...category })),
    monthlyExpenses: [],
    accounts: [],
    debts: [],
    transactions: [],
    settlementHistory: [],
    settlementBalance: 0,
    deletedHistory: [],
    flexDeposits: [],
  };
}

/**
 * True when nothing has ever been recorded on this device: every collection is
 * empty and the only categories are the starter set above. Such a device must
 * adopt the cloud wholesale — merging it would push the starter categories into
 * the shared list, because a merge without a base cannot tell "new here" from
 * "never existed".
 */
export function isPristineFinanceState(state: FinanceState): boolean {
  const empty = (list: unknown[] | undefined) => !list || list.length === 0;
  return (
    empty(state.transactions) &&
    empty(state.incomeEntries) &&
    empty(state.incomeSources) &&
    empty(state.accounts) &&
    empty(state.debts) &&
    empty(state.monthlyExpenses) &&
    empty(state.settlementHistory) &&
    empty(state.deletedHistory) &&
    empty(state.flexDeposits) &&
    (state.spendCategories ?? []).every((category) => category.id.startsWith("cat-"))
  );
}

/** Fill in the collections that older records may lack, so every reader can assume they exist. */
export function normalizeFinanceState(state: FinanceState): FinanceState {
  return {
    ...state,
    deletedHistory: state.deletedHistory ?? [],
    spendCategories: state.spendCategories ?? [],
    greenDotTrackingStartDate: state.greenDotTrackingStartDate,
  };
}
