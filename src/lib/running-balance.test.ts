import { describe, expect, it } from "vitest";
import { accountMovesSince, balancesAfter, balancesAtStartOf } from "./running-balance";
import type { Account, Transaction } from "@/types";

const bofa: Account = { id: "bofa", person: "kushvanth", name: "BofA", type: "debit", balance: 0 };
const cash: Account = { id: "cash", person: "kushvanth", name: "Cash", type: "cash", balance: 0 };
const card: Account = { id: "card", person: "kushvanth", name: "Discover", type: "credit", balance: 0 };

let n = 0;
const row = (day: number, type: Transaction["type"], amount: number, extra: Partial<Transaction> = {}): Transaction => ({
  id: `t${++n}`,
  type,
  person: "kushvanth",
  amount,
  date: `2026-10-${String(day).padStart(2, "0")}`,
  time: "12:00",
  ...extra,
});

/** The balances left after each row, in the order the rows were given. */
function leftAfter(accounts: Account[], rows: Transaction[]) {
  const after = balancesAfter(accounts, rows);
  return rows.map((r) => after.get(r.id)?.map((a) => [a.accountId, a.balance]) ?? null);
}

describe("what was left after each row", () => {
  it("walks back from today's balance through pay and spends", () => {
    const rows = [
      row(1, "income", 50, { accountId: "bofa" }),
      row(2, "expense", 30, { accountId: "bofa" }),
      row(3, "expense", 20.1, { accountId: "bofa" }),
    ];
    expect(leftAfter([{ ...bofa, balance: 99.9 }], rows)).toEqual([
      [["bofa", 150]],
      [["bofa", 120]],
      [["bofa", 99.9]],
    ]);
  });

  it("reads a card as what is owed: a spend adds to it, a payment takes it down", () => {
    const rows = [
      row(1, "expense", 40, { accountId: "card" }),
      row(2, "credit_payment", 25, { accountId: "bofa", targetAccountId: "card" }),
    ];
    expect(leftAfter([{ ...bofa, balance: 75 }, { ...card, balance: 15 }], rows)).toEqual([
      [["card", 40]],
      [["bofa", 75], ["card", 15]],
    ]);
  });

  it("gives both ends of a self transfer", () => {
    const rows = [row(1, "transfer", 60, { sourceAccountId: "cash", targetAccountId: "bofa" })];
    expect(leftAfter([{ ...bofa, balance: 160 }, { ...cash, balance: 40 }], rows)).toEqual([
      [["cash", 40], ["bofa", 160]],
    ]);
  });

  it("takes cash bought for a spend out of the bank, not the wallet", () => {
    const rows = [
      row(1, "expense", 10, { accountId: "cash" }),
      row(2, "cash_withdrawal", 20, { accountId: "cash", sourceAccountId: "bofa" }),
      row(2, "expense", 20, { accountId: "cash", sourceAccountId: "bofa" }),
    ];
    expect(leftAfter([{ ...bofa, balance: 80 }, { ...cash, balance: 30 }], rows)).toEqual([
      [["cash", 30]],
      null,
      [["bofa", 80]],
    ]);
  });

  it("counts a refund as money back", () => {
    const rows = [row(1, "expense", 30, { accountId: "bofa" }), row(2, "expense", -12, { accountId: "bofa", refund: true })];
    expect(leftAfter([{ ...bofa, balance: 82 }], rows)).toEqual([[["bofa", 70]], [["bofa", 82]]]);
  });

  it("starts again from a balance fix's own before-figure", () => {
    // The fix took BofA from 500 to 200; whatever happened before it is read from 500.
    const rows = [
      row(1, "expense", 100, { accountId: "bofa" }),
      row(2, "balance_adjustment", 300, { accountId: "bofa", previousBalance: 500 }),
      row(3, "expense", 50, { accountId: "bofa" }),
    ];
    expect(leftAfter([{ ...bofa, balance: 150 }], rows)).toEqual([[["bofa", 500]], [["bofa", 200]], [["bofa", 150]]]);
  });

  it("orders by when it happened, not when it was typed in", () => {
    const late = row(1, "expense", 5, { accountId: "bofa" });
    const today = row(5, "expense", 10, { accountId: "bofa" });
    expect(leftAfter([{ ...bofa, balance: 85 }], [today, late])).toEqual([[["bofa", 85]], [["bofa", 95]]]);
  });

  it("gives each balance as it stood at the start of a day", () => {
    const rows = [
      row(1, "income", 50, { accountId: "bofa" }),
      row(3, "expense", 30, { accountId: "bofa" }),
      row(3, "transfer", 10, { sourceAccountId: "bofa", targetAccountId: "cash" }),
      row(5, "expense", 5, { accountId: "cash" }),
    ];
    const accounts = [{ ...bofa, balance: 110 }, { ...cash, balance: 15 }];
    const startOf = (day: string) => Object.fromEntries(balancesAtStartOf(day, accounts, rows));
    expect(startOf("2026-10-06")).toEqual({ bofa: 110, cash: 15 });
    expect(startOf("2026-10-05")).toEqual({ bofa: 110, cash: 20 });
    expect(startOf("2026-10-03")).toEqual({ bofa: 150, cash: 10 });
    expect(startOf("2026-10-01")).toEqual({ bofa: 100, cash: 10 });
  });

  it("lists each move on chosen accounts since a day, newest first, with what was left", () => {
    const rows = [
      row(1, "expense", 40, { accountId: "bofa" }), // before the day: left out
      row(3, "income", 200, { accountId: "bofa" }),
      row(3, "expense", 30, { accountId: "cash" }), // another account: left out
      row(4, "transfer", 20, { sourceAccountId: "cash", targetAccountId: "bofa" }),
      row(5, "balance_adjustment", 15, { accountId: "bofa", previousBalance: 320 }),
    ];
    // BofA: 100 on the morning of the 3rd, +200, +20 = 320, then fixed down to 305.
    const moves = accountMovesSince("2026-10-03", ["bofa"], [{ ...bofa, balance: 305 }, cash], rows);
    expect(moves.map(({ transaction, move }) => [transaction.type, move.change, move.balance])).toEqual([
      ["balance_adjustment", -15, 305],
      ["transfer", 20, 320],
      ["income", 200, 300],
    ]);
  });

  it("never reports −0, which prints as \"-$0\"", () => {
    // Sub-cent dust below zero rounds to −0.
    const start = balancesAtStartOf("2026-10-01", [{ ...bofa, balance: -0.001 }], []);
    expect(Object.is(start.get("bofa"), 0)).toBe(true);
  });

  it("skips rows with no account, or one since deleted", () => {
    const rows = [
      row(1, "settlement", 40),
      row(1, "debt_payment", 40, { category: "Loan" }),
      row(2, "expense", 10, { accountId: "gone" }),
    ];
    expect(leftAfter([bofa], rows)).toEqual([null, null, null]);
  });
});
