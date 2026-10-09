import { describe, expect, it } from "vitest";
import { cardPose, iconPose, STACK_GEOMETRY, stackStep, type StackGeometry } from "@/lib/stack-pose";

const g: StackGeometry = STACK_GEOMETRY;

describe("cardPose", () => {
  it("is continuous through focus, so a card never jumps as it passes the top", () => {
    const at = cardPose(0, g);
    for (const nearby of [cardPose(1e-6, g), cardPose(-1e-6, g)]) {
      expect(nearby.y).toBeCloseTo(at.y, 3);
      expect(nearby.scale).toBeCloseTo(at.scale, 3);
      expect(nearby.dim).toBeCloseTo(at.dim, 3);
      expect(nearby.opacity).toBeCloseTo(at.opacity, 3);
    }
  });

  it("moves the waiting column exactly one step per card, 1:1 with the scroll", () => {
    expect(cardPose(1, g).y - cardPose(0, g).y).toBe(stackStep(g));
    expect(cardPose(2.5, g).y - cardPose(1.5, g).y).toBe(stackStep(g));
  });

  it("piles passed cards a peek apart and never above the pile's depth", () => {
    expect(cardPose(-1, g).y).toBe(g.top - g.peek);
    expect(cardPose(-2, g).y).toBe(g.top - 2 * g.peek);
    expect(cardPose(-9, g).y).toBe(g.top - g.depth * g.peek);
    expect(cardPose(-1, g).scale).toBeLessThan(1);
    expect(cardPose(-2, g).scale).toBeLessThan(cardPose(-1, g).scale);
  });

  it("keeps the pile on screen", () => {
    expect(g.top - g.depth * g.peek).toBeGreaterThanOrEqual(0);
  });

  it("fades a card out only once it is deeper than the pile", () => {
    expect(cardPose(-g.depth, g).opacity).toBe(1);
    expect(cardPose(-(g.depth + 1), g).opacity).toBe(0);
  });
});

describe("iconPose", () => {
  it("sits exactly on its card's corner at rest", () => {
    for (const d of [0, 1, 2, 5]) {
      const icon = iconPose(d, g);
      expect(icon).toEqual({ x: 0, y: cardPose(d, g).y, scale: 1, opacity: 1 });
    }
  });

  it("is gone before its card reaches the back of the pile", () => {
    expect(iconPose(-1, g).opacity).toBe(0);
  });
});
