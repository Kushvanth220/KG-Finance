import { describe, expect, it } from "vitest";
import { applyTransfer, buildTransferMessage, describeTransferEffect, reverseTransfer } from "./self-transfer";
import { applyTransactionDeletion } from "./transaction-reversal";
import { getGreenDotActivitySummary, transferDelta } from "./account-activity";
import type { Account, Debt, Transaction } from "@/types";

const cash: Account = { id: "cash", person: "kushvanth", name: "Cash", type: "cash", balance: 300 };
const bofa: Account = { id: "bofa", person: "kushvanth", name: "BofA", type: "debit", balance: 1000 };
const card: Account = { id: "card", person: "kushvanth", name: "Discover", type: "credit", balance: 450, creditLimit: 2000 };
const cardDebt: Debt = { id: "d1", person: "kushvanth", name: "Discover", amount: 450, linkedAccountId: "card" };
const accounts = [cash, bofa, card];

const balanceOf = (list: Account[], id: string) => list.find((a) => a.id === id)!.balance;

describe("applyTransfer", () => {
  it("moves cash into the bank", () => {
    const moved = applyTransfer(accounts, [], "cash", "bofa", 200)!;
    expect(balanceOf(moved.accounts, "cash")).toBe(100);
    expect(balanceOf(moved.accounts, "bofa")).toBe(1200);
    expect(balanceOf(moved.accounts, "card")).toBe(450);
  });

  it("pays a card down from the bank, and its debt follows", () => {
    const moved = applyTransfer(accounts, [cardDebt], "bofa", "card", 150)!;
    expect(balanceOf(moved.accounts, "bofa")).toBe(850);
    expect(balanceOf(moved.accounts, "card")).toBe(300);
    expect(moved.debts[0]!.amount).toBe(300);
  });

  it("takes a cash advance off a card", () => {
    const moved = applyTransfer(accounts, [cardDebt], "card", "cash", 60)!;
    expect(balanceOf(moved.accounts, "card")).toBe(510);
    expect(balanceOf(moved.accounts, "cash")).toBe(360);
    expect(moved.debts[0]!.amount).toBe(510);
  });

  it("keeps cents exact", () => {
    const moved = applyTransfer([{ ...cash, balance: 0.3 }, bofa], [], "cash", "bofa", 0.1)!;
    expect(balanceOf(moved.accounts, "cash")).toBe(0.2);
  });

  it("refuses a move to the same account, a missing account, or no money", () => {
    expect(applyTransfer(accounts, [], "cash", "cash", 10)).toBeNull();
    expect(applyTransfer(accounts, [], "cash", "nope", 10)).toBeNull();
    expect(applyTransfer(accounts, [], "cash", "bofa", 0)).toBeNull();
    expect(applyTransfer(accounts, [], "cash", "bofa", -5)).toBeNull();
  });

  it("is undone exactly by reverseTransfer", () => {
    const moved = applyTransfer(accounts, [cardDebt], "bofa", "card", 123.45)!;
    const back = reverseTransfer(moved.accounts, moved.debts, "bofa", "card", 123.45)!;
    expect(back.accounts).toEqual(accounts);
    expect(back.debts).toEqual([cardDebt]);
  });
});

describe("deleting a self transfer from History", () => {
  it("puts both balances back", () => {
    const moved = applyTransfer(accounts, [cardDebt], "bofa", "card", 100)!;
    const row: Transaction = {
      id: "t1",
      type: "transfer",
      person: "kushvanth",
      amount: 100,
      date: "2026-10-22",
      time: "10:00:00",
      accountId: "bofa",
      sourceAccountId: "bofa",
      targetAccountId: "card",
    };
    const result = applyTransactionDeletion({
      accounts: moved.accounts,
      debts: moved.debts,
      transactions: [row],
      incomeEntries: [],
      settlementHistory: [],
      settlementBalance: 0,
      monthlyExpenses: [],
      transactionId: "t1",
    })!;
    expect(result.accounts).toEqual(accounts);
    expect(result.debts).toEqual([cardDebt]);
    expect(result.transactions).toEqual([]);
  });
});

describe("words", () => {
  it("says who moved what where", () => {
    expect(buildTransferMessage({ person: "kushvanth", amount: 200, from: "Cash", to: "BofA" })).toMatch(
      /moved \$200 from Cash to BofA$/
    );
  });

  it("says what each side does", () => {
    expect(describeTransferEffect(bofa, card, 50)).toBe("BofA goes down $50; Discover owes $50 less.");
    expect(describeTransferEffect(card, cash, 20)).toBe("Discover owes $20 more; Cash goes up $20.");
  });
});

describe("shared account activity", () => {
  const greenDot: Account = { id: "shared-greendot", person: "kushvanth", name: "GreenDot", type: "debit", balance: 500, shared: true };
  const row = (from: string, to: string, amount: number): Transaction => ({
    id: `${from}-${to}`,
    type: "transfer",
    person: "kushvanth",
    amount,
    date: "2026-10-22",
    time: "10:00:00",
    accountId: from,
    sourceAccountId: from,
    targetAccountId: to,
    paymentMethod: `${from} → ${to}`,
  });

  it("counts money moved in and out, and nothing moved between its own accounts", () => {
    const ids = new Set(["shared-greendot"]);
    expect(transferDelta(row("bofa", "shared-greendot", 80), ids)).toBe(80);
    expect(transferDelta(row("shared-greendot", "cash", 30), ids)).toBe(-30);
    expect(transferDelta(row("bofa", "cash", 30), ids)).toBe(0);
  });

  it("folds a move into GreenDot into net without calling it earned", () => {
    const summary = getGreenDotActivitySummary(
      [greenDot, bofa, cash],
      [{ ...row("bofa", "shared-greendot", 80), paymentMethod: "BofA → GreenDot" }],
      new Date("2026-10-22T12:00:00")
    );
    expect(summary.kushvanth.earnedThisMonth).toBe(0);
    expect(summary.kushvanth.movedThisMonth).toBe(80);
    expect(summary.kushvanth.netThisMonth).toBe(80);
    expect(summary.kushvanth.spentThisMonth).toBe(0);
  });
});
