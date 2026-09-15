import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/balance-celebration", () => ({ celebrateBalanceUpdate: vi.fn() }));
vi.mock("@/lib/reset-app-data", () => ({ clearPersistedAppData: vi.fn(), FINANCE_STORAGE_KEY: "test-finance" }));

import { useFinanceStore } from "@/store/finance-store";
import { confirmFlexDeposit, deleteFlexDeposit, reviseFlexDeposit } from "./flex-deposit-actions";
import type { Account } from "@/types";

const greendot: Account = { id: "gd", person: "kushvanth", name: "GreenDot", type: "debit", balance: 100, shared: true };

const parts = [
  { entryId: "a", part: "base" as const, amount: 60, blockDate: "2026-09-12" },
  { entryId: "a", part: "tip" as const, amount: 8, blockDate: "2026-09-12" },
  { entryId: "b", part: "base" as const, amount: 72, blockDate: "2026-09-14" },
];

describe("Flex deposit actions", () => {
  beforeEach(() => {
    useFinanceStore.setState({
      accounts: [greendot],
      debts: [],
      transactions: [],
      incomeEntries: [],
      incomeSources: [],
      settlementHistory: [],
      settlementBalance: 0,
      flexDeposits: [],
      deletedHistory: [],
    });
  });

  it("confirming writes the record, the two sources, and income into the account", () => {
    const deposit = confirmFlexDeposit({ date: "2026-09-15", accountId: "gd", actual: 140, parts });
    const state = useFinanceStore.getState();
    expect(deposit.id).toBe("flexdep-2026-09-15");
    expect(state.flexDeposits).toHaveLength(1);
    expect(state.incomeSources.map((s) => s.name).sort()).toEqual(["Flex Base Pay", "Flex Tip"]);
    expect(state.incomeEntries.map((e) => [e.id, e.amount, e.date])).toEqual([
      ["flex-dep-flexdep-2026-09-15-base", 132, "2026-09-15"],
      ["flex-dep-flexdep-2026-09-15-tip", 8, "2026-09-15"],
    ]);
    expect(state.accounts[0]?.balance).toBe(240);
  });

  it("revising to what the bank showed moves the balance by the difference", () => {
    const deposit = confirmFlexDeposit({ date: "2026-09-15", accountId: "gd", actual: 140, parts });
    reviseFlexDeposit(deposit.id, { actual: 135.5 });
    const state = useFinanceStore.getState();
    expect(state.flexDeposits?.[0]).toMatchObject({ actual: 135.5, expected: 140, auto: undefined });
    expect(state.incomeEntries.map((e) => e.amount)).toEqual([132, 3.5]);
    expect(state.accounts[0]?.balance).toBe(235.5);
  });

  it("removing takes the income back out and leaves the account where it was", () => {
    const deposit = confirmFlexDeposit({ date: "2026-09-15", accountId: "gd", actual: 140, parts });
    deleteFlexDeposit(deposit.id);
    const state = useFinanceStore.getState();
    expect(state.flexDeposits).toHaveLength(0);
    expect(state.incomeEntries).toHaveLength(0);
    expect(state.accounts[0]?.balance).toBe(100);
  });

  it("a second confirmation of the same payout day is a second record, not a double", () => {
    confirmFlexDeposit({ date: "2026-09-15", accountId: "gd", actual: 140, parts });
    const late = confirmFlexDeposit({
      date: "2026-09-15",
      accountId: "gd",
      actual: 11,
      parts: [{ entryId: "b", part: "tip", amount: 11, blockDate: "2026-09-14" }],
    });
    expect(late.id).toBe("flexdep-2026-09-15-2");
    expect(useFinanceStore.getState().accounts[0]?.balance).toBe(251);
  });
});
