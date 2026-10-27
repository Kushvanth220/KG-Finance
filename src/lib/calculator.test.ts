import { describe, expect, it } from "vitest";
import {
  addToHistory,
  calculate,
  formatCalculation,
  HISTORY_LIMIT,
  isCalculation,
  parseHistory,
  toAmountText,
  type CalculationRecord,
} from "./calculator";

describe("calculate", () => {
  it("does the four operations with the usual precedence", () => {
    expect(calculate("2+3*4")).toBe(14);
    expect(calculate("10-2-3")).toBe(5);
    expect(calculate("10÷4")).toBe(2.5);
    expect(calculate("3×4")).toBe(12);
    expect(calculate("3x4−2")).toBe(10);
  });

  it("reads brackets, and closes ones left open", () => {
    expect(calculate("(2+3)*4")).toBe(20);
    expect(calculate("2*(3+(4-1))")).toBe(12);
    expect(calculate("(2+3")).toBe(5);
  });

  it("treats percent like a phone calculator", () => {
    expect(calculate("18%")).toBeCloseTo(0.18);
    expect(calculate("45+18%")).toBeCloseTo(53.1);
    expect(calculate("200-25%")).toBe(150);
    expect(calculate("80*15%")).toBeCloseTo(12);
  });

  it("handles signs", () => {
    expect(calculate("-5+2")).toBe(-3);
    expect(calculate("4*-2")).toBe(-8);
    expect(calculate("-(2+3)")).toBe(-5);
  });

  it("ignores a trailing operator while typing", () => {
    expect(calculate("12.5+")).toBe(12.5);
    expect(calculate("12+(")).toBe(12);
    expect(calculate("12.")).toBe(12);
  });

  it("reads money as typed", () => {
    expect(calculate("$1,200+$35.50")).toBe(1235.5);
  });

  it("refuses what is not a sum", () => {
    expect(calculate("")).toBeNull();
    expect(calculate("abc")).toBeNull();
    expect(calculate("1/0")).toBeNull();
    expect(calculate("1.2.3")).toBeNull();
    expect(calculate("2)")).toBeNull();
    expect(calculate("*2")).toBeNull();
  });
});

describe("isCalculation", () => {
  it("does not count a lone number or a leading sign", () => {
    expect(isCalculation("12")).toBe(false);
    expect(isCalculation("-12")).toBe(false);
    expect(isCalculation("12+3")).toBe(true);
    expect(isCalculation("15%")).toBe(true);
    expect(isCalculation("(2)")).toBe(true);
  });
});

describe("formatting", () => {
  it("shows a result without float noise", () => {
    expect(formatCalculation(0.1 + 0.2)).toBe("0.3");
    expect(formatCalculation(1234.5)).toBe("1,234.5");
    expect(formatCalculation(1 / 3)).toBe("0.33333333");
  });

  it("gives the amount field cents", () => {
    expect(toAmountText(53.1)).toBe("53.1");
    expect(toAmountText(1 / 3)).toBe("0.33");
    expect(toAmountText(-0.001)).toBe("0");
  });
});

describe("history", () => {
  const record = (n: number): CalculationRecord => ({
    id: `r${n}`,
    expression: `${n}+1`,
    result: n + 1,
    at: "2026-10-23T00:00:00.000Z",
  });

  it("puts the newest first, moves a repeat up, and keeps a limited number", () => {
    let history: CalculationRecord[] = [];
    for (let n = 0; n < HISTORY_LIMIT + 5; n++) history = addToHistory(history, record(n));
    expect(history).toHaveLength(HISTORY_LIMIT);
    expect(history[0]!.expression).toBe(`${HISTORY_LIMIT + 4}+1`);
    history = addToHistory(history, { ...record(10), id: "again" });
    expect(history[0]!.id).toBe("again");
    expect(history.filter((item) => item.expression === "10+1")).toHaveLength(1);
  });

  it("reads saved history and drops anything malformed", () => {
    const raw = JSON.stringify([record(1), { id: 2 }, { ...record(3), result: "x" }, null]);
    expect(parseHistory(raw).map((item) => item.id)).toEqual(["r1"]);
    expect(parseHistory("not json")).toEqual([]);
    expect(parseHistory(null)).toEqual([]);
  });
});
