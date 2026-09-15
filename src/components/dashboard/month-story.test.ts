import { describe, expect, it } from "vitest";
import { paceFor, storyFor } from "./month-story";

describe("storyFor", () => {
  it("goes green, amber, red as spending climbs against income", () => {
    expect(storyFor(1000, 500).color).toBe("#34c759");
    expect(storyFor(1000, 900).color).toBe("#ff9500");
    expect(storyFor(1000, 1220).color).toBe("#ff3b30");
  });

  it("says the one thing that matters", () => {
    expect(storyFor(2549.98, 3770.72).headline).toBe("Spent $1,220.74 more than you earned");
    expect(storyFor(2000, 1200).headline).toBe("Kept $800 of $2,000");
    expect(storyFor(0, 300)).toMatchObject({ pct: null, headline: "$300 spent" });
  });
});

describe("paceFor", () => {
  const sept13 = new Date(2026, 8, 13, 15);

  it("projects a running range from the days elapsed", () => {
    expect(paceFor(1300, new Date(2026, 8, 1), new Date(2026, 8, 30, 23, 59, 59), sept13)).toBe(
      "$100/day · on track for $3,000 by Sep 30"
    );
  });

  it("averages a finished range over its full length", () => {
    expect(paceFor(3100, new Date(2026, 7, 1), new Date(2026, 7, 31, 23, 59, 59), sept13)).toBe("$100/day over 31 days");
    expect(paceFor(0, new Date(2026, 7, 1), new Date(2026, 7, 31), sept13)).toBeNull();
  });

  it("drops the projection on the last day", () => {
    expect(paceFor(260, new Date(2026, 8, 12), new Date(2026, 8, 13, 23, 59, 59), sept13)).toBe("$130/day");
  });
});
