import { beforeEach, describe, expect, it, vi } from "vitest";

// Nothing here should light up the phone or touch storage.
vi.mock("@/lib/balance-celebration", () => ({ celebrateBalanceUpdate: vi.fn() }));
vi.mock("@/lib/reset-app-data", () => ({ clearPersistedAppData: vi.fn(), FINANCE_STORAGE_KEY: "test-finance" }));

// vi.mock is hoisted above the file, so the spy has to be hoisted with it.
const { markLocalChangePending } = vi.hoisted(() => ({ markLocalChangePending: vi.fn() }));
vi.mock("@/lib/supabase/sync", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/supabase/sync")>();
  return { ...actual, markLocalChangePending };
});

import { applyRemoteFinanceState, useFinanceStore } from "./finance-store";
import { getGreenDotCardBalance, getGreenDotParts, isGreenDotAccount, isGreenDotPart } from "@/lib/accounts";
import type { Account, FinanceState } from "@/types";

/**
 * The Green Dot card is one card with two parts: each person's account holds
 * their share of it. A pull must keep the parts apart, because a merge throws
 * away whose money is whose and cannot be taken back.
 */

const card = (id: string, person: "kushvanth" | "g", balance: number, name = "Green Dot"): Account => ({
  id,
  person,
  name,
  type: "debit",
  balance,
});

function remote(accounts: Account[]): FinanceState {
  return {
    accounts,
    transactions: [
      { id: "t1", type: "expense", person: "kushvanth", amount: 40, date: "2026-10-20", time: "12:00", accountId: "gd-k" },
      { id: "t2", type: "expense", person: "g", amount: 25, date: "2026-10-21", time: "12:00", accountId: "gd-g" },
    ],
    incomeEntries: [
      { id: "i1", person: "g", sourceId: "s1", amount: 300, date: "2026-10-19", depositType: "debit", depositAccountId: "gd-g" },
    ],
    incomeSources: [{ id: "s1", person: "g", name: "Grubhub" }],
    spendCategories: [{ id: "c1", name: "Food" }],
    monthlyExpenses: [],
    debts: [],
    settlementHistory: [],
    settlementBalance: 0,
    deletedHistory: [],
    flexDeposits: [],
    remittances: [],
  } as unknown as FinanceState;
}

describe("the Green Dot card's two parts", () => {
  beforeEach(() => markLocalChangePending.mockClear());

  it("recognises the card however the name is punctuated", () => {
    for (const name of ["Green Dot", "greendot", "GREEN-DOT", " green dot "]) {
      expect(isGreenDotAccount(card("x", "g", 0, name))).toBe(true);
    }
    expect(isGreenDotAccount(card("x", "g", 0, "Chime"))).toBe(false);
  });

  it("keeps each person's part, with its own balance and rows, after a pull", () => {
    applyRemoteFinanceState(remote([card("gd-g", "g", 964.44), card("gd-k", "kushvanth", -338.57)]));
    const state = useFinanceStore.getState();

    const parts = getGreenDotParts(state.accounts);
    expect(parts.map((a) => [a.person, a.balance])).toEqual([
      ["kushvanth", -338.57],
      ["g", 964.44],
    ]);
    expect(getGreenDotCardBalance(state.accounts)).toBeCloseTo(625.87, 2);
    expect(state.transactions.find((t) => t.id === "t1")!.accountId).toBe("gd-k");
    expect(state.transactions.find((t) => t.id === "t2")!.accountId).toBe("gd-g");
    expect(state.incomeEntries[0]!.depositAccountId).toBe("gd-g");
  });

  it("never marks a pull as a change to push", () => {
    applyRemoteFinanceState(remote([card("gd-k", "kushvanth", -338.57), card("gd-g", "g", 964.44)]));
    expect(markLocalChangePending).not.toHaveBeenCalled();
  });

  it("leaves an old merged account as the one shared card it already is", () => {
    const merged: Account = { ...card("acc-shared-greendot", "kushvanth", 625.87, "GreenDot"), shared: true };
    applyRemoteFinanceState(remote([merged]));
    const state = useFinanceStore.getState();

    expect(state.accounts).toEqual([merged]);
    expect(isGreenDotPart(merged)).toBe(false);
    expect(getGreenDotParts(state.accounts)).toEqual([]);
  });
});
