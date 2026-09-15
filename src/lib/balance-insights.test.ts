import { describe, expect, it } from "vitest";
import { balanceTimeline, monthDelta, monthPaid, owedSince } from "./balance-insights";
import { getDisplaySettlementHistory } from "./settlement";
import type { SettlementEntry } from "@/types";

function entry(date: string, paidBy: "kushvanth" | "g", amount: number, time = "12:00:00"): SettlementEntry {
  return {
    id: `${date}-${paidBy}-${amount}`,
    date,
    time,
    timestamp: new Date(`${date}T${time}`).toISOString(),
    amount,
    paidBy,
    benefited: paidBy === "kushvanth" ? "g" : "kushvanth",
    runningBalance: 0,
  };
}

const now = new Date(2026, 8, 13, 15, 0, 0); // 09/13/2026

const history = getDisplaySettlementHistory([
  entry("2026-07-20", "g", 50), // K owes G 50
  entry("2026-08-02", "kushvanth", 200), // G owes K 150
  entry("2026-08-25", "kushvanth", 100), // 250
  entry("2026-09-05", "g", 30), // 220
  entry("2026-09-12", "kushvanth", 80), // 300
]);

describe("balanceTimeline", () => {
  it("carries the last known balance across quiet days, oldest first", () => {
    const points = balanceTimeline(history, 30, now);
    expect(points).toHaveLength(30);
    expect(points[0]!.date.getDate()).toBe(15); // 08/15
    expect(points[0]!.balance).toBe(150);
    expect(points[10]!.balance).toBe(250); // 08/25 onwards
    expect(points[29]!.balance).toBe(300);
  });
});

describe("monthDelta", () => {
  it("is the move since the month began", () => {
    expect(monthDelta(history, now)).toBe(50); // 250 -> 300
  });
});

describe("owedSince", () => {
  it("finds when the balance last crossed to this side", () => {
    const since = owedSince(history);
    expect(since?.getMonth()).toBe(7);
    expect(since?.getDate()).toBe(2);
  });

  it("is null when settled", () => {
    const settled = getDisplaySettlementHistory([entry("2026-09-01", "kushvanth", 10), entry("2026-09-02", "g", 10)]);
    expect(owedSince(settled)).toBeNull();
  });
});

describe("monthPaid", () => {
  it("sums what each person paid for the other this month", () => {
    expect(monthPaid(history, now)).toEqual({ kushvanth: 80, g: 30 });
  });
});
