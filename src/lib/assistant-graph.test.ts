import { describe, expect, it } from "vitest";
import { argumentText, buildFinanceGraph, hubsForTools, hubsMentioned, HUB_ORDER, leavesMentioned } from "@/lib/assistant-graph";
import { createEmptyFinanceState } from "@/lib/default-state";
import type { FinanceState, Transaction } from "@/types";

function expense(id: string, date: string, amount: number, category: string): Transaction {
  return {
    id,
    type: "expense",
    person: "kushvanth",
    amount,
    date,
    time: "12:00:00",
    category,
    accountId: "bofa",
    expenseOwner: "kushvanth",
  };
}

function state(over: Partial<FinanceState> = {}): FinanceState {
  return {
    ...createEmptyFinanceState(),
    spendCategories: [
      { id: "c-food", name: "Food", budget: 100 },
      { id: "c-gas", name: "Gas", budget: 200 },
      { id: "c-rent", name: "Rent" },
    ],
    accounts: [
      { id: "bofa", person: "kushvanth", name: "BofA Debit", type: "debit", balance: 400 },
      { id: "amex", person: "kushvanth", name: "Credit One Amex", type: "credit", balance: 290, creditLimit: 300 },
    ],
    transactions: [
      expense("t1", "2026-10-02", 60, "Food"),
      expense("t2", "2026-10-05", 45, "Food"),
      expense("t3", "2026-10-06", 50, "Gas"),
      expense("t4", "2026-09-10", 300, "Rent"),
    ],
    debts: [{ id: "d1", person: "kushvanth", name: "Zolve loan", amount: 1200 }],
    settlementBalance: 25,
    ...over,
  };
}

const today = "2026-10-08";

describe("buildFinanceGraph", () => {
  const graph = buildFinanceGraph({ state: state(), reminders: [], person: "kushvanth", today });
  const hub = (key: string) => graph.hubs.find((h) => h.key === key)!;

  it("lays the hubs out in a fixed order", () => {
    expect(graph.hubs.map((h) => h.key)).toEqual([...HUB_ORDER]);
  });

  it("totals this month's spending the way Home does, and compares it with last month", () => {
    expect(hub("spending").headline).toBe(155);
    expect(hub("spending").delta?.text).toBe("-48% vs September");
    // Thirty days ending today: Oct 8 is the last slot, Oct 2 six before it,
    // and September's rent (Sep 10) falls inside the window too.
    expect(hub("spending").series).toHaveLength(30);
    expect(hub("spending").series[29 - 6]).toBe(60);
    expect(hub("spending").series[29 - 28]).toBe(300);
  });

  it("marks a category over its budget, and one without a budget as having none", () => {
    const food = hub("spending").leaves.find((leaf) => leaf.label === "Food")!;
    expect(food.tone).toBe("bad");
    expect(food.meter).toBe(1);
    expect(food.meterText).toBe("105% of $100");
    const gas = hub("spending").leaves.find((leaf) => leaf.label === "Gas")!;
    expect(gas.tone).toBe("good");
    expect(hub("spending").chips.find((c) => c.key === "over")?.count).toBe(1);
  });

  it("shows a card near its limit as a warning on the accounts hub", () => {
    const card = hub("accounts").leaves.find((leaf) => leaf.label === "Credit One Amex")!;
    expect(card.tone).toBe("bad");
    expect(card.meter).toBeCloseTo(0.9667, 3);
    expect(hub("accounts").headline).toBe(400);
  });

  it("puts the person at the centre with what they have available", () => {
    expect(graph.core.headlineText).toBe("$400");
    expect(graph.monthLabel).toBe("October 2026");
  });

  it("says who owes whom on the balance hub", () => {
    expect(hub("balance").caption).toMatch(/owes/);
    expect(hub("balance").leaves.map((leaf) => leaf.tone)).toEqual(["good", "warn"]);
  });

  it("lists open debts and keeps empty chips out", () => {
    expect(hub("debts").leaves.map((leaf) => leaf.label)).toEqual(["Zolve loan"]);
    expect(hub("debts").chips.map((c) => c.key)).toEqual(["all", "loans"]);
  });

  it("starts the transfers hub empty when nothing was sent", () => {
    expect(hub("transfers").leaves).toHaveLength(0);
    expect(hub("transfers").headline).toBe(0);
  });
});

describe("what the assistant is touching", () => {
  const graph = buildFinanceGraph({ state: state(), reminders: [], person: "kushvanth", today });

  it("maps tools to the hubs they read", () => {
    expect(hubsForTools(["calculate_category_breakdown"])).toEqual(["spending"]);
    expect(hubsForTools(["record_expense", "list_accounts"]).sort()).toEqual(["accounts", "spending"]);
    expect(hubsForTools(["save_behavior_preference"])).toEqual([]);
  });

  it("finds nodes an answer names, as whole words", () => {
    expect(leavesMentioned(graph, "You spent $105 on food, mostly at the start of the month.")).toEqual(["spending:food"]);
    expect(leavesMentioned(graph, "Seafood is not a category here.")).toEqual([]);
    expect(leavesMentioned(graph, "Your BofA Debit has $400.")).toEqual(["accounts:bofa"]);
  });

  it("knows which hub a question is about from its words", () => {
    expect(hubsMentioned("How much did I spend on food this month?")).toEqual(["spending"]);
    expect(hubsMentioned("Who owes whom right now?")).toEqual(["balance"]);
    expect(hubsMentioned("How much have I sent to India?")).toEqual(["transfers"]);
    expect(hubsMentioned("Hello")).toEqual([]);
  });

  it("reads strings out of tool arguments", () => {
    expect(argumentText({ category: "Gas", amount: 20, filters: { account_name: "BofA Debit" } })).toBe("Gas · BofA Debit");
  });
});
