import { describe, expect, it } from "vitest";
import { findRecentDuplicate, noteSuggestions, recentCategoryNames } from "./spend-assist";
import type { Transaction } from "@/types";

function expense(over: Partial<Transaction> & { at: Date }): Transaction {
  const { at, ...rest } = over;
  return {
    id: rest.id ?? Math.random().toString(36).slice(2),
    type: "expense",
    person: "kushvanth",
    amount: 10,
    date: at.toISOString().slice(0, 10),
    time: at.toISOString().slice(11, 19),
    timestamp: at.toISOString(),
    ...rest,
  };
}

const now = new Date("2026-09-13T15:00:00.000Z");
const daysAgo = (n: number, hours = 0) => new Date(now.getTime() - n * 86_400_000 - hours * 3_600_000);

describe("recentCategoryNames", () => {
  it("ranks this week's categories by use, newest breaking ties", () => {
    const tx = [
      expense({ category: "Gas", at: daysAgo(1) }),
      expense({ category: "Groceries", at: daysAgo(2) }),
      expense({ category: "Groceries", at: daysAgo(3) }),
      expense({ category: "Food", at: daysAgo(0, 2) }),
      expense({ category: "Rent", at: daysAgo(20) }),
    ];
    expect(recentCategoryNames(tx, 7, 3, now)).toEqual(["Groceries", "Food", "Gas"]);
  });

  it("ignores income and anything older than the window", () => {
    const tx = [
      { ...expense({ category: "Salary", at: daysAgo(1) }), type: "income" as const },
      expense({ category: "Rent", at: daysAgo(8) }),
    ];
    expect(recentCategoryNames(tx, 7, 3, now)).toEqual([]);
  });
});

describe("noteSuggestions", () => {
  const tx = [
    expense({ notes: "Groceries at Costco", category: "Groceries", at: daysAgo(1) }),
    expense({ notes: "groceries at costco", category: "Groceries", at: daysAgo(5) }),
    expense({ notes: "Gas at Shell", category: "Gas", at: daysAgo(2) }),
    expense({ notes: "Lunch at Costco food court", category: "Food", at: daysAgo(3) }),
  ];

  it("offers prefix matches first, then word matches, without repeats", () => {
    expect(noteSuggestions(tx, "gr").map((s) => s.note)).toEqual(["Groceries at Costco"]);
    expect(noteSuggestions(tx, "cos").map((s) => s.note)).toEqual([
      "Groceries at Costco",
      "Lunch at Costco food court",
    ]);
  });

  it("carries the category along and never echoes what was typed", () => {
    expect(noteSuggestions(tx, "gas")[0]).toEqual({ note: "Gas at Shell", category: "Gas" });
    expect(noteSuggestions(tx, "Gas at Shell")).toEqual([]);
    expect(noteSuggestions(tx, "g")).toEqual([]);
  });
});

describe("findRecentDuplicate", () => {
  it("finds the same amount and category inside two minutes", () => {
    const prior = expense({ id: "p", amount: 42.5, category: "Gas", at: new Date(now.getTime() - 30_000) });
    expect(findRecentDuplicate([prior], 42.5, "gas", 120_000, now.getTime())?.id).toBe("p");
    expect(findRecentDuplicate([prior], 42.5, "Food", 120_000, now.getTime())).toBeNull();
    expect(findRecentDuplicate([prior], 42.49, "Gas", 120_000, now.getTime())).toBeNull();
  });

  it("lets an older one through", () => {
    const prior = expense({ amount: 42.5, category: "Gas", at: new Date(now.getTime() - 10 * 60_000) });
    expect(findRecentDuplicate([prior], 42.5, "Gas", 120_000, now.getTime())).toBeNull();
  });
});
