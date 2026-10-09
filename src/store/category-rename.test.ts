import { beforeEach, describe, expect, it, vi } from "vitest";

// Nothing here should light up the phone or touch storage.
vi.mock("@/lib/balance-celebration", () => ({ celebrateBalanceUpdate: vi.fn() }));
vi.mock("@/lib/reset-app-data", () => ({ clearPersistedAppData: vi.fn(), FINANCE_STORAGE_KEY: "test-finance" }));

import { useFinanceStore } from "./finance-store";
import type { Transaction } from "@/types";

/**
 * A transaction remembers its category by NAME. Renaming the category row on
 * its own therefore stranded every transaction that carried the old name:
 * still in the ledger, no longer in any category. The rename has to take its
 * rows with it.
 */

function expense(id: string, category: string, amount: number): Transaction {
  return {
    id,
    type: "expense",
    person: "kushvanth",
    amount,
    date: "2026-09-26",
    time: "12:00",
    category,
  } as Transaction;
}

function freshState() {
  useFinanceStore.setState({
    accounts: [],
    debts: [],
    settlementHistory: [],
    settlementBalance: 0,
    monthlyExpenses: [],
    deletedHistory: [],
    spendCategories: [
      { id: "c1", name: "Grishma Birthaday" },
      { id: "c2", name: "Food" },
    ],
    transactions: [
      expense("t1", "Grishma Birthaday", 257),
      expense("t2", "Grishma Birthaday", 1000),
      expense("t3", "Food", 12),
    ],
  });
}

describe("updateSpendCategory", () => {
  beforeEach(freshState);

  it("carries the transactions over when the category is renamed", () => {
    useFinanceStore.getState().updateSpendCategory("c1", { name: "G Birthday" });
    const { spendCategories, transactions } = useFinanceStore.getState();

    expect(spendCategories.find((c) => c.id === "c1")?.name).toBe("G Birthday");
    expect(transactions.filter((t) => t.category === "G Birthday").map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(transactions.some((t) => t.category === "Grishma Birthaday")).toBe(false);
    // Everything else stays exactly where it was.
    expect(transactions.find((t) => t.id === "t3")?.category).toBe("Food");
  });

  it("leaves the tags alone when the edit is not a rename", () => {
    useFinanceStore.getState().updateSpendCategory("c1", { budget: 400 });
    const { spendCategories, transactions } = useFinanceStore.getState();

    expect(spendCategories.find((c) => c.id === "c1")?.budget).toBe(400);
    expect(transactions.filter((t) => t.category === "Grishma Birthaday")).toHaveLength(2);
  });

  it("trims the new name, so the tag and the category still match", () => {
    useFinanceStore.getState().updateSpendCategory("c1", { name: "  G Birthday  " });
    const { spendCategories, transactions } = useFinanceStore.getState();

    expect(spendCategories.find((c) => c.id === "c1")?.name).toBe("G Birthday");
    expect(transactions.filter((t) => t.category === "G Birthday")).toHaveLength(2);
  });
});
