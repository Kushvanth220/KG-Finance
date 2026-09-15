import { beforeEach, describe, expect, it, vi } from "vitest";

// Nothing here should light up the phone or touch storage.
vi.mock("@/lib/balance-celebration", () => ({ celebrateBalanceUpdate: vi.fn() }));
vi.mock("@/lib/reset-app-data", () => ({ clearPersistedAppData: vi.fn(), FINANCE_STORAGE_KEY: "test-finance" }));

import { useFinanceStore } from "./finance-store";
import type { Account } from "@/types";

const bofa: Account = { id: "bofa", person: "kushvanth", name: "BofA Debit", type: "debit", balance: 500 };
const gCard: Account = { id: "gcard", person: "g", name: "G Card", type: "credit", balance: 100, creditLimit: 1000 };

function freshState() {
  useFinanceStore.setState({
    accounts: [bofa, gCard],
    debts: [],
    transactions: [],
    settlementHistory: [],
    settlementBalance: 0,
    monthlyExpenses: [],
    deletedHistory: [],
    spendCategories: [{ id: "c1", name: "Groceries" }],
  });
}

describe("spend", () => {
  beforeEach(freshState);

  it("returns the id of the row it wrote, and Undo takes the whole thing back", () => {
    const id = useFinanceStore.getState().spend({
      person: "kushvanth",
      amount: 42.5,
      accountId: "bofa",
      category: "Groceries",
      beneficiaryPerson: "g",
    });
    expect(id).toBeTruthy();
    let state = useFinanceStore.getState();
    expect(state.accounts.find((a) => a.id === "bofa")?.balance).toBe(457.5);
    expect(state.settlementBalance).toBe(42.5);

    useFinanceStore.getState().deleteTransaction(id!, "kushvanth");
    state = useFinanceStore.getState();
    expect(state.transactions).toHaveLength(0);
    expect(state.accounts.find((a) => a.id === "bofa")?.balance).toBe(500);
    expect(state.settlementBalance).toBe(0);
  });

  it("stamps a chosen day while keeping the clock time", () => {
    const id = useFinanceStore.getState().spend({
      person: "kushvanth",
      amount: 5,
      accountId: "bofa",
      category: "Groceries",
      date: "2026-09-10",
    });
    const tx = useFinanceStore.getState().transactions.find((t) => t.id === id)!;
    expect(tx.date).toBe("2026-09-10");
    expect(tx.time).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    expect(new Date(tx.timestamp!).getDate()).toBe(10);
  });

  it("records a refund as a negative expense that puts the money back", () => {
    const id = useFinanceStore.getState().spend({
      person: "g",
      amount: 30,
      accountId: "gcard",
      category: "Groceries",
      refund: true,
    });
    const state = useFinanceStore.getState();
    const tx = state.transactions.find((t) => t.id === id)!;
    expect(tx.amount).toBe(-30);
    expect(tx.refund).toBe(true);
    expect(tx.autoMessage).toContain("got $30 back");
    // A credit card balance is what is owed; a refund lowers it.
    expect(state.accounts.find((a) => a.id === "gcard")?.balance).toBe(70);
  });

  it("runs the settlement backwards on a refund for the other person", () => {
    const store = useFinanceStore.getState();
    store.spend({ person: "kushvanth", amount: 100, accountId: "bofa", category: "Groceries", beneficiaryPerson: "g" });
    expect(useFinanceStore.getState().settlementBalance).toBe(100);

    store.spend({ person: "kushvanth", amount: 40, accountId: "bofa", category: "Groceries", beneficiaryPerson: "g", refund: true });
    const state = useFinanceStore.getState();
    expect(state.settlementBalance).toBe(60);
    expect(state.accounts.find((a) => a.id === "bofa")?.balance).toBe(440);
    const entry = state.settlementHistory[0]!;
    expect(entry.amount).toBe(40);
    expect(entry.paidBy).toBe("g");
    expect(entry.autoMessage).toContain("Refund");
  });

  it("nets a shared refund out of both shares", () => {
    const store = useFinanceStore.getState();
    store.spend({
      person: "kushvanth",
      amount: 20,
      accountId: "bofa",
      category: "Groceries",
      expenseShares: { kushvanth: 10, g: 10 },
      refund: true,
    });
    const tx = useFinanceStore.getState().transactions[0]!;
    expect(tx.expenseShares).toEqual({ kushvanth: -10, g: -10 });
    expect(useFinanceStore.getState().settlementBalance).toBe(-10);
  });
});
