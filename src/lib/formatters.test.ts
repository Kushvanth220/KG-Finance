import { describe, expect, it } from "vitest";
import { formatAmount, formatCurrency, formatLateness } from "./formatters";

describe("formatAmount", () => {
  it("always shows the cents, so a list of amounts lines up", () => {
    expect(formatAmount(15)).toBe("$15.00");
    expect(formatAmount(19.67)).toBe("$19.67");
    expect(formatAmount(-338.57)).toBe("-$338.57");
    expect(formatAmount(4060)).toBe("$4,060.00");
  });

  it("never shows -$0.00", () => {
    expect(formatAmount(-0.001)).toBe("$0.00");
  });

  it("leaves headline figures compact", () => {
    expect(formatCurrency(4060)).toBe("$4,060");
  });
});

describe("formatLateness", () => {
  it("says hours under a day and days after", () => {
    expect(formatLateness(0.4)).toBe("due now");
    expect(formatLateness(5)).toBe("5h late");
    expect(formatLateness(24)).toBe("1 day late");
    expect(formatLateness(283)).toBe("11 days late");
  });
});
