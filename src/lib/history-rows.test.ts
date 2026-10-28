import { describe, expect, it } from "vitest";
import { groupByDay, historyTitle, matchesSearch } from "./history-rows";
import type { Transaction } from "@/types";

const row = (extra: Partial<Transaction>): Transaction => ({
  id: Math.random().toString(36).slice(2),
  type: "expense",
  person: "kushvanth",
  amount: 10,
  date: "2026-10-26",
  time: "10:00",
  ...extra,
});

describe("historyTitle", () => {
  it("says what the row was in a few words", () => {
    expect(historyTitle(row({ category: "Food" }))).toBe("Food");
    expect(historyTitle(row({ category: "Gas", notes: "Gas on oct 24" }))).toBe("Gas · Gas on oct 24");
    expect(historyTitle(row({ category: "Food", amount: -12, refund: true }))).toBe("Refund · Food");
    expect(historyTitle(row({ type: "income", category: "Door Dash" }))).toBe("Door Dash");
    expect(historyTitle(row({ type: "transfer", paymentMethod: "BofA → Cash" }))).toBe("BofA → Cash");
    expect(historyTitle(row({ type: "credit_payment", category: "BofA Credit" }))).toBe("Paid BofA Credit");
  });

  it("doesn't repeat a note that is already the title", () => {
    expect(historyTitle(row({ category: "Food", notes: "food" }))).toBe("Food");
  });
});

describe("matchesSearch", () => {
  const costco = row({ category: "Groceries", notes: "Costco", amount: 62.4, paymentMethod: "Green Dot" });
  it("matches words, the account and the amount however it is typed", () => {
    expect(matchesSearch(costco, "costco")).toBe(true);
    expect(matchesSearch(costco, "green dot")).toBe(true);
    expect(matchesSearch(costco, "62.40")).toBe(true);
    expect(matchesSearch(costco, "$62.40")).toBe(true);
    expect(matchesSearch(costco, "62")).toBe(true);
    expect(matchesSearch(costco, "groceries costco")).toBe(true);
    expect(matchesSearch(costco, "gas")).toBe(false);
  });

  it("matches everything when nothing is typed", () => {
    expect(matchesSearch(costco, "   ")).toBe(true);
  });
});

describe("groupByDay", () => {
  it("cuts newest-first rows into days, with what went out and came in", () => {
    const days = groupByDay([
      row({ date: "2026-10-26", amount: 15 }),
      row({ date: "2026-10-26", amount: 19.67 }),
      row({ date: "2026-10-26", type: "transfer", amount: 50 }),
      row({ date: "2026-10-25", type: "income", amount: 84.2 }),
      row({ date: "2026-10-25", amount: -5, refund: true }),
    ]);
    expect(days.map((d) => [d.date, d.rows.length, Number(d.out.toFixed(2)), Number(d.in.toFixed(2))])).toEqual([
      ["2026-10-26", 3, 34.67, 0],
      ["2026-10-25", 2, 0, 89.2],
    ]);
  });
});
