import { describe, expect, it } from "vitest";
import { evaluateAmount, hasOperator } from "./amount-expression";

describe("evaluateAmount", () => {
  it("reads a plain number", () => {
    expect(evaluateAmount("12.5")).toBe(12.5);
    expect(evaluateAmount("$1,200")).toBe(1200);
  });

  it("adds items on one receipt to the cent", () => {
    expect(evaluateAmount("12.5+3.2")).toBe(15.7);
    expect(evaluateAmount("0.1+0.2")).toBe(0.3);
  });

  it("keeps the usual precedence and accepts × ÷ x", () => {
    expect(evaluateAmount("2+3*4")).toBe(14);
    expect(evaluateAmount("10/4")).toBe(2.5);
    expect(evaluateAmount("3x4")).toBe(12);
    expect(evaluateAmount("3×4÷2")).toBe(6);
    expect(evaluateAmount("10-2-3")).toBe(5);
  });

  it("treats a trailing operator as still typing", () => {
    expect(evaluateAmount("12.5+")).toBe(12.5);
    expect(evaluateAmount("12.")).toBe(12);
  });

  it("refuses anything that is not arithmetic", () => {
    expect(evaluateAmount("")).toBeNull();
    expect(evaluateAmount("abc")).toBeNull();
    expect(evaluateAmount("1+*2")).toBeNull();
    expect(evaluateAmount("1/0")).toBeNull();
  });
});

describe("hasOperator", () => {
  it("does not count a leading sign", () => {
    expect(hasOperator("-5")).toBe(false);
    expect(hasOperator("5")).toBe(false);
    expect(hasOperator("5+5")).toBe(true);
    expect(hasOperator("5x2")).toBe(true);
  });
});
