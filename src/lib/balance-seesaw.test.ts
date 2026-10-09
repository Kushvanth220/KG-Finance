import { describe, expect, it } from "vitest";
import { seesawTarget } from "./balance-seesaw";

describe("seesawTarget", () => {
  it("is level and empty when all even", () => {
    expect(seesawTarget(0)).toEqual({ owed: null, coins: 0, tilt: 0 });
    expect(seesawTarget(0.004)).toEqual({ owed: null, coins: 0, tilt: 0 });
    expect(seesawTarget(-0.004)).toEqual({ owed: null, coins: 0, tilt: 0 });
  });

  it("lowers Kushvanth's side (left, negative) when G owes him", () => {
    const t = seesawTarget(4397.04);
    expect(t.owed).toBe("kushvanth");
    expect(t.tilt).toBeLessThan(0);
  });

  it("lowers G's side (right, positive) when Kushvanth owes G", () => {
    const t = seesawTarget(-4397.04);
    expect(t.owed).toBe("g");
    expect(t.tilt).toBeGreaterThan(0);
  });

  it("tips the same way for the same amount either side", () => {
    expect(seesawTarget(250).tilt).toBeCloseTo(-seesawTarget(-250).tilt, 10);
    expect(seesawTarget(250).coins).toBe(seesawTarget(-250).coins);
  });

  it("tips further and holds more coins the more is owed", () => {
    const small = seesawTarget(5), mid = seesawTarget(400), big = seesawTarget(4397.04);
    expect(Math.abs(small.tilt)).toBeLessThan(Math.abs(mid.tilt));
    expect(Math.abs(mid.tilt)).toBeLessThan(Math.abs(big.tilt));
    expect(small.coins).toBeLessThanOrEqual(mid.coins);
    expect(mid.coins).toBeLessThanOrEqual(big.coins);
    expect(big.coins).toBe(4);
  });

  it("never tips past 13 degrees or holds more than 4 coins", () => {
    const huge = seesawTarget(1e9);
    expect(huge.tilt).toBeCloseTo(-13, 10);
    expect(huge.coins).toBe(4);
  });

  it("still shows something for a single cent", () => {
    const tiny = seesawTarget(0.01);
    expect(tiny.coins).toBe(2);
    expect(Math.abs(tiny.tilt)).toBeCloseTo(5.8, 10);
  });
});
