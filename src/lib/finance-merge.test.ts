import { describe, expect, it } from "vitest";
import { mergeById, mergeFinanceStates } from "./finance-merge";
import type { Account, FinanceState, SettlementEntry, Transaction } from "@/types";

function tx(id: string, amount: number, accountId = "bofa"): Transaction {
  return {
    id,
    type: "expense",
    person: "kushvanth",
    amount,
    date: "2026-09-14",
    time: "10:00:00",
    timestamp: "2026-09-14T15:00:00.000Z",
    accountId,
    category: "Gas",
  };
}

function account(id: string, balance: number, name = id): Account {
  return { id, person: "kushvanth", name, type: "debit", balance };
}

function state(over: Partial<FinanceState> = {}): FinanceState {
  return {
    incomeSources: [],
    incomeEntries: [],
    spendCategories: [],
    monthlyExpenses: [],
    accounts: [account("bofa", 500)],
    debts: [],
    transactions: [],
    settlementHistory: [],
    settlementBalance: 0,
    deletedHistory: [],
    ...over,
  };
}

describe("mergeById", () => {
  it("keeps what either side added and drops what either side deleted", () => {
    const base = [{ id: "a" }, { id: "b" }, { id: "c" }];
    const local = [{ id: "a" }, { id: "c" }, { id: "L" }]; // deleted b, added L
    const remote = [{ id: "a" }, { id: "b" }, { id: "R" }]; // deleted c, added R
    expect(mergeById(base, local, remote).map((i) => i.id)).toEqual(["a", "R", "L"]);
  });

  it("puts local additions first for newest-first lists", () => {
    expect(mergeById([], [{ id: "L" }], [{ id: "R" }], { newestFirst: true }).map((i) => i.id)).toEqual(["L", "R"]);
  });

  it("takes the side that changed, and unions without a base", () => {
    const base = [{ id: "a", name: "old" }];
    expect(mergeById(base, [{ id: "a", name: "old" }], [{ id: "a", name: "new" }])[0]!.name).toBe("new");
    expect(mergeById(base, [{ id: "a", name: "mine" }], [{ id: "a", name: "old" }])[0]!.name).toBe("mine");
    expect(mergeById(undefined, [{ id: "a" }, { id: "b" }], [{ id: "b" }, { id: "c" }]).map((i) => i.id)).toEqual(["b", "c", "a"]);
  });
});

describe("mergeFinanceStates", () => {
  it("a spend on each phone: both transactions survive and the balance carries both", () => {
    const base = state({ accounts: [account("bofa", 500)] });
    const local = state({ accounts: [account("bofa", 460)], transactions: [tx("L", 40)] });
    const remote = state({ accounts: [account("bofa", 475)], transactions: [tx("R", 25)] });
    const merged = mergeFinanceStates(base, local, remote);
    expect(merged.transactions.map((t) => t.id)).toEqual(["L", "R"]);
    expect(merged.accounts[0]?.balance).toBe(435);
  });

  it("a rename here and a spend there do not fight", () => {
    const base = state({ accounts: [account("bofa", 500, "BofA")] });
    const local = state({ accounts: [account("bofa", 500, "BofA Debit")] });
    const remote = state({ accounts: [account("bofa", 475, "BofA")], transactions: [tx("R", 25)] });
    const merged = mergeFinanceStates(base, local, remote);
    expect(merged.accounts[0]).toMatchObject({ name: "BofA Debit", balance: 475 });
  });

  it("a deletion on one phone is not undone by the other", () => {
    const base = state({ transactions: [tx("old", 10)], accounts: [account("bofa", 490)] });
    const local = state({ transactions: [], accounts: [account("bofa", 500)] }); // deleted "old", balance back
    const remote = state({ transactions: [tx("old", 10), tx("R", 5)], accounts: [account("bofa", 485)] });
    const merged = mergeFinanceStates(base, local, remote);
    expect(merged.transactions.map((t) => t.id)).toEqual(["R"]);
    expect(merged.accounts[0]?.balance).toBe(495);
  });

  it("recomputes the settlement balance from the merged history", () => {
    const entry = (id: string, paidBy: "kushvanth" | "g", amount: number): SettlementEntry => ({
      id,
      date: "2026-09-14",
      time: "10:00:00",
      timestamp: "2026-09-14T15:00:00.000Z",
      amount,
      paidBy,
      benefited: paidBy === "kushvanth" ? "g" : "kushvanth",
      runningBalance: 0,
    });
    const base = state();
    const local = state({ settlementHistory: [entry("L", "kushvanth", 30)], settlementBalance: 30 });
    const remote = state({ settlementHistory: [entry("R", "g", 10)], settlementBalance: -10 });
    const merged = mergeFinanceStates(base, local, remote);
    expect(merged.settlementHistory).toHaveLength(2);
    expect(merged.settlementBalance).toBe(20);
  });

  it("with no base, unions everything and trusts the cloud's numbers", () => {
    const local = state({ accounts: [account("bofa", 460)], transactions: [tx("L", 40)] });
    const remote = state({ accounts: [account("bofa", 475)], transactions: [tx("R", 25)] });
    const merged = mergeFinanceStates(null, local, remote);
    expect(merged.transactions.map((t) => t.id)).toEqual(["L", "R"]);
    expect(merged.accounts[0]?.balance).toBe(475);
  });
});

describe("mergeFinanceStates — money transfers", () => {
  const sent = (id: string, usdAmount = 500) => ({
    id,
    person: "kushvanth" as const,
    date: "2026-10-08",
    country: "IN" as const,
    usdAmount,
    receivedAmount: usdAmount * 84,
    rate: 84,
    method: "remitly" as const,
    reason: "family" as const,
    createdAt: "2026-10-08T12:00:00.000Z",
  });

  it("keeps a transfer added on either phone and drops one deleted on the other", () => {
    const base = state({ remittances: [sent("old")] });
    const local = state({ remittances: [sent("old"), sent("mine")] });
    const remote = state({ remittances: [sent("theirs")] }); // deleted "old"
    const merged = mergeFinanceStates(base, local, remote);
    expect(merged.remittances?.map((r) => r.id).sort()).toEqual(["mine", "theirs"]);
  });

  it("takes an edit from whichever side made it", () => {
    const base = state({ remittances: [sent("a", 500)] });
    const local = state({ remittances: [sent("a", 500)] });
    const remote = state({ remittances: [sent("a", 450)] });
    expect(mergeFinanceStates(base, local, remote).remittances?.[0]?.usdAmount).toBe(450);
  });

  it("reads a cloud record from before transfers existed as none, not as a wipe", () => {
    const local = state({ remittances: [sent("mine")] });
    const remote = state();
    expect(mergeFinanceStates(null, local, remote).remittances?.map((r) => r.id)).toEqual(["mine"]);
  });
});

describe("mergeFinanceStates — Home layout", () => {
  const layout = (order: string[], updatedAt: string) => ({ order, hidden: [], updatedAt });

  it("takes the layout from whichever device changed it", () => {
    const base = state({ homeLayout: layout(["flex", "income"], "2026-10-01T00:00:00.000Z") });
    const remote = state({ homeLayout: layout(["income", "flex"], "2026-10-02T00:00:00.000Z") });
    expect(mergeFinanceStates(base, base, remote).homeLayout?.order).toEqual(["income", "flex"]);
    expect(mergeFinanceStates(base, remote, base).homeLayout?.order).toEqual(["income", "flex"]);
  });

  it("takes the later layout when both devices changed it", () => {
    const base = state({ homeLayout: layout(["flex", "income"], "2026-10-01T00:00:00.000Z") });
    const local = state({ homeLayout: layout(["income", "flex"], "2026-10-03T00:00:00.000Z") });
    const remote = state({ homeLayout: { ...layout(["flex", "income"], "2026-10-02T00:00:00.000Z"), hidden: ["flex"] } });
    expect(mergeFinanceStates(base, local, remote).homeLayout?.order).toEqual(["income", "flex"]);
    expect(mergeFinanceStates(base, remote, local).homeLayout?.order).toEqual(["income", "flex"]);
  });

  it("keeps a layout when the other side has none yet", () => {
    const local = state({ homeLayout: layout(["debts"], "2026-10-02T00:00:00.000Z") });
    expect(mergeFinanceStates(null, local, state()).homeLayout?.order).toEqual(["debts"]);
    expect(mergeFinanceStates(null, state(), local).homeLayout?.order).toEqual(["debts"]);
  });
});
