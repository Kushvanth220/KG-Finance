import { describe, expect, it } from "vitest";
import { DEFAULT_CARD_PREFS, arrangeCards, isDefaultCardPrefs, parseCardPrefs, reorderWithin } from "@/lib/home-cards";

describe("parseCardPrefs", () => {
  it("falls back to the usual layout for nothing saved or a broken value", () => {
    expect(parseCardPrefs(null)).toEqual(DEFAULT_CARD_PREFS);
    expect(parseCardPrefs("{not json")).toEqual(DEFAULT_CARD_PREFS);
  });

  it("keeps the saved order, drops unknown ids and adds missing cards at the end", () => {
    const prefs = parseCardPrefs(JSON.stringify({ order: ["spending", "story", "income", "income"], hidden: ["debts", "nope"] }));
    expect(prefs).toEqual({ order: ["spending", "income", "flex", "accounts", "debts"], hidden: ["debts"] });
  });
});

describe("arrangeCards", () => {
  it("shows the cards this person has, in the saved order, without the hidden ones", () => {
    const prefs = { order: ["accounts", "flex", "income", "spending", "debts"] as const, hidden: ["spending"] as const };
    expect(arrangeCards(["income", "spending", "accounts", "debts"], { order: [...prefs.order], hidden: [...prefs.hidden] })).toEqual([
      "accounts",
      "income",
      "debts",
    ]);
  });
});

describe("isDefaultCardPrefs", () => {
  it("is true only for every card, in the usual order, none hidden", () => {
    expect(isDefaultCardPrefs(DEFAULT_CARD_PREFS)).toBe(true);
    expect(isDefaultCardPrefs(parseCardPrefs(null))).toBe(true);
    expect(isDefaultCardPrefs({ ...DEFAULT_CARD_PREFS, hidden: ["debts"] })).toBe(false);
    expect(isDefaultCardPrefs(parseCardPrefs(JSON.stringify({ order: ["income", "flex"] })))).toBe(false);
  });
});

describe("reorderWithin", () => {
  it("moves only the cards that were rearranged, leaving the others where they were", () => {
    // G's tab has no Flex: rearranging the other four must not move Flex.
    expect(reorderWithin(["flex", "income", "spending", "accounts", "debts"], ["accounts", "income", "spending", "debts"])).toEqual([
      "flex",
      "accounts",
      "income",
      "spending",
      "debts",
    ]);
  });
});
