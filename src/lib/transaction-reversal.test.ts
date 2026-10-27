import { describe, expect, it } from "vitest";
import { applyTransactionDeletion } from "./transaction-reversal";
import type { Account, Transaction } from "@/types";

const bofa: Account = { id: "bofa", person: "kushvanth", name: "BofA", type: "debit", balance: 80 };
const cash: Account = { id: "cash", person: "kushvanth", name: "Cash", type: "cash", balance: 30 };

function deleteRow(transactions: Transaction[], id: string) {
  return applyTransactionDeletion({
    accounts: [bofa, cash],
    debts: [],
    transactions,
    incomeEntries: [],
    settlementHistory: [],
    settlementBalance: 0,
    monthlyExpenses: [],
    transactionId: id,
  })!;
}

describe("undoing a cash spend paid with cash taken out of the bank", () => {
  // The spend took $20 out of BofA and the wallet passed it straight on.
  const withdrawal: Transaction = {
    id: "w", type: "cash_withdrawal", person: "kushvanth", amount: 20, date: "2026-10-20", time: "12:00",
    accountId: "cash", sourceAccountId: "bofa",
  };
  const spend: Transaction = {
    id: "s", type: "expense", person: "kushvanth", amount: 20, date: "2026-10-20", time: "12:00",
    accountId: "cash", sourceAccountId: "bofa", category: "Food",
  };

  it("gives the bank its money back and leaves the wallet as it was", () => {
    const after = deleteRow([withdrawal, spend], "s");
    expect(after.accounts.find((a) => a.id === "bofa")!.balance).toBe(100);
    expect(after.accounts.find((a) => a.id === "cash")!.balance).toBe(30);
    // The withdrawal row goes with its spend.
    expect(after.transactions).toEqual([]);
  });
});
