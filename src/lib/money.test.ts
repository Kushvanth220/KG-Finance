import { describe, expect, it } from "vitest";
import { partsReconcile, roundMoney, splitMoney } from "@/lib/money";
import { getSettlementSummary } from "@/lib/settlement";

/**
 * Cent-exact money. These are the invariants the Balance balance depends
 * on; a one-cent drift here becomes a real argument at the kitchen table.
 */

describe("roundMoney", () => {
  it("rounds to the cent, half away from zero", () => {
    expect(roundMoney(12.345)).toBe(12.35);
    expect(roundMoney(12.344)).toBe(12.34);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
  });

  it("does not accumulate float error over a running total", () => {
    let total = 0;
    for (let i = 0; i < 1000; i++) total = roundMoney(total + 0.1);
    expect(total).toBe(100);
  });
});

describe("splitMoney", () => {
  it("splits evenly when it can", () => {
    expect(splitMoney(10, 2)).toEqual([5, 5]);
  });

  it("puts every leftover cent somewhere — never loses or invents one", () => {
    for (const total of [0.01, 0.02, 1, 7.33, 100.01, 4321.99]) {
      for (const ways of [2, 3, 7]) {
        const parts = splitMoney(total, ways);
        expect(parts).toHaveLength(ways);
        expect(partsReconcile(parts, total)).toBe(true);
        expect(roundMoney(parts.reduce((a, b) => a + b, 0))).toBe(roundMoney(total));
      }
    }
  });

  it("keeps parts within a cent of each other", () => {
    const parts = splitMoney(100.01, 3);
    expect(roundMoney(Math.max(...parts) - Math.min(...parts))).toBeLessThanOrEqual(0.01);
  });
});

describe("getSettlementSummary", () => {
  it("reads the sign as direction", () => {
    expect(getSettlementSummary(12.5).amount).toBe(12.5);
    expect(getSettlementSummary(-12.5).amount).toBe(12.5);
    expect(getSettlementSummary(0).amount).toBe(0);
  });

  it("names who pays whom, and 'even' at zero", () => {
    expect(getSettlementSummary(1).label).toMatch(/should pay/);
    expect(getSettlementSummary(-1).label).toMatch(/should pay/);
    expect(getSettlementSummary(1).label).not.toBe(getSettlementSummary(-1).label);
    expect(getSettlementSummary(0).label).toMatch(/even/i);
  });
});
