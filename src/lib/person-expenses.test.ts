import { describe, expect, it } from "vitest";
import { sumPersonExpenses } from "./calculations";
import { buildLearnedCategorySpending } from "./learn-spending-categories";
import type { SpendCategory, Transaction } from "@/types";

/**
 * The dashboard once showed two different totals for the same month because
 * one of them summed the face value of shared rows. These lock the rule: a
 * person's spending is their share.
 */

const start = new Date("2026-10-01T00:00:00");
const end = new Date("2026-10-31T23:59:59");

function expense(partial: Partial<Transaction> & { amount: number; date: string }): Transaction {
  return {
    id: partial.date + partial.amount,
    type: "expense",
    person: "kushvanth",
    time: "12:00",
    ...partial,
  } as Transaction;
}

describe("sumPersonExpenses", () => {
  it("counts only this person's half of a shared row", () => {
    const rows = [
      expense({ amount: 12, date: "2026-10-06", expenseShares: { kushvanth: 6, g: 6 } }),
      expense({ amount: 33, date: "2026-10-06", expenseShares: { kushvanth: 16.5, g: 16.5 } }),
    ];
    expect(sumPersonExpenses(rows, "kushvanth", start, end)).toBe(22.5);
    expect(sumPersonExpenses(rows, "g", start, end)).toBe(22.5);
  });

  it("counts the whole row when it belongs to one person", () => {
    const rows = [expense({ amount: 60, date: "2026-10-06" })];
    expect(sumPersonExpenses(rows, "kushvanth", start, end)).toBe(60);
    expect(sumPersonExpenses(rows, "g", start, end)).toBe(0);
  });

  it("leaves rows outside the period alone", () => {
    const rows = [
      expense({ amount: 60, date: "2026-09-30" }),
      expense({ amount: 40, date: "2026-10-02" }),
      expense({ amount: 25, date: "2026-11-01" }),
    ];
    expect(sumPersonExpenses(rows, "kushvanth", start, end)).toBe(40);
  });

  it("lets a refund pull the total back down", () => {
    const rows = [
      expense({ amount: 100, date: "2026-10-03" }),
      expense({ amount: -30, date: "2026-10-04", refund: true }),
    ];
    expect(sumPersonExpenses(rows, "kushvanth", start, end)).toBe(70);
  });

  it("agrees with the sum of the same rows grouped by category", () => {
    // The invariant the dashboard broke: the headline figure and the category
    // breakdown are the same rows, so they must add to the same number.
    const rows = [
      expense({ amount: 12, date: "2026-10-06", category: "Food", expenseShares: { kushvanth: 6, g: 6 } }),
      expense({ amount: 60, date: "2026-10-06", category: "Gas" }),
      expense({ amount: 29.02, date: "2026-10-04", category: "Groceries", expenseShares: { kushvanth: 14.51, g: 14.51 } }),
    ];
    const headline = sumPersonExpenses(rows, "kushvanth", start, end);
    const byCategory = 6 + 60 + 14.51;
    expect(headline).toBeCloseTo(byCategory, 2);
  });
});

/**
 * The dashboard built its headline from the category breakdown, and the
 * breakdown could only hold categories with money IN them. A category that
 * came out negative — refunded more than it was spent — was dropped, and the
 * figure above it silently gained that much spending. One real refund of $115
 * made October read as $4,280.46 against a ledger of $4,165.46.
 */
describe("buildLearnedCategorySpending", () => {
  const categories = [
    { id: "1", name: "Food" },
    { id: "2", name: "Settlement" },
  ] as SpendCategory[];

  function total(rows: Transaction[], cats: SpendCategory[] = categories) {
    const { spent, offsets, unmapped } = buildLearnedCategorySpending(
      rows,
      "kushvanth",
      cats,
      rows,
      start,
      end
    );
    const sum = (list: { amount: number }[]) => list.reduce((acc, item) => acc + item.amount, 0);
    return { headline: sum(spent) + sum(offsets) + unmapped, spent, offsets, unmapped };
  }

  it("still counts a category the refunds pushed negative", () => {
    const rows = [
      expense({ amount: 400, date: "2026-10-03", category: "Food" }),
      expense({ amount: -115, date: "2026-10-05", category: "Settlement", refund: true }),
    ];
    const { headline, spent, offsets } = total(rows);

    // Not drawable as a slice, so it is kept apart — but it is still in the sum.
    expect(spent.map((row) => row.name)).toEqual(["Food"]);
    expect(offsets).toEqual([expect.objectContaining({ name: "Settlement", amount: -115 })]);
    expect(headline).toBeCloseTo(285, 2);
    expect(headline).toBeCloseTo(sumPersonExpenses(rows, "kushvanth", start, end), 2);
  });

  it("still counts a row whose category matches nothing", () => {
    const rows = [
      expense({ amount: 400, date: "2026-10-03", category: "Food" }),
      expense({ amount: 60, date: "2026-10-04", category: "Zzyzx" }),
    ];
    const { headline, unmapped } = total(rows);

    expect(unmapped).toBeCloseTo(60, 2);
    expect(headline).toBeCloseTo(sumPersonExpenses(rows, "kushvanth", start, end), 2);
  });

  it("adds up to the ledger when a shared row is refunded in part", () => {
    const rows = [
      expense({ amount: 12, date: "2026-10-06", category: "Food", expenseShares: { kushvanth: 6, g: 6 } }),
      expense({
        amount: -40,
        date: "2026-10-07",
        category: "Settlement",
        refund: true,
        expenseShares: { kushvanth: -20, g: -20 },
      }),
    ];
    expect(total(rows).headline).toBeCloseTo(sumPersonExpenses(rows, "kushvanth", start, end), 2);
  });
});
