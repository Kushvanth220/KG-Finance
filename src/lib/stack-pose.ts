/**
 * Where each card of a stack switcher sits, as a pure function of one number:
 * its distance from focus. 0 is the focused card, 1 the next one down, -1 the
 * one just passed; fractions are the frames in between.
 *
 * Kept apart from the component so the geometry is testable without a
 * browser, and so the card and its floating icon cannot disagree about where
 * a card is — the icon's pose is built from the card's.
 */

export interface StackGeometry {
  /** Height of every card, px. */
  cardHeight: number;
  /** Space between the cards waiting below the focused one, px. */
  gap: number;
  /** Where the focused card's top edge sits, px. Leaves room for the pile. */
  top: number;
  /** How much of each piled card shows above the one in front of it, px. */
  peek: number;
  /** Cards kept visible in the pile before they fade out. */
  depth: number;
}

export interface CardPose {
  y: number;
  scale: number;
  /** Degrees, leaning back from the top edge. */
  rotateX: number;
  /** 0–1: how far the card has faded toward the surface behind the stack. */
  dim: number;
  opacity: number;
}

export interface IconPose {
  x: number;
  y: number;
  scale: number;
  opacity: number;
}

export const STACK_GEOMETRY: StackGeometry = {
  cardHeight: 220,
  gap: 12,
  top: 56,
  peek: 13,
  depth: 3,
};

/** Per step back into the pile. */
const SHRINK = 0.06;
const MIN_SCALE = 0.76;
const TILT = 7;
const MAX_TILT = 21;
const DIM = 0.26;
const MAX_DIM = 0.78;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Scroll distance that moves the stack by exactly one card. */
export function stackStep(g: StackGeometry): number {
  return g.cardHeight + g.gap;
}

export function cardPose(distance: number, g: StackGeometry): CardPose {
  if (distance >= 0) {
    // Waiting below: a plain column that travels 1:1 with the finger.
    return { y: g.top + distance * stackStep(g), scale: 1, rotateX: 0, dim: 0, opacity: 1 };
  }

  // Passed: folds back into the pile, a peek above the card in front, a
  // little smaller and dimmer per step. Past the pile's depth a card fades
  // out instead of stacking forever.
  const back = -distance;
  return {
    y: g.top - Math.min(back, g.depth) * g.peek,
    scale: Math.max(1 - back * SHRINK, MIN_SCALE),
    rotateX: Math.min(back * TILT, MAX_TILT),
    dim: Math.min(back * DIM, MAX_DIM),
    opacity: clamp(g.depth + 1 - back, 0, 1),
  };
}

/**
 * The icon follows the same path as its card but is fed a sprung copy of the
 * scroll, so in motion it trails the card and at rest it sits exactly on it.
 * Leaving focus it shrinks and drifts in toward the card's narrowing corner,
 * gone before the card reaches the pile.
 */
export function iconPose(distance: number, g: StackGeometry): IconPose {
  const back = Math.max(0, -distance);
  return {
    x: back * 10,
    y: cardPose(distance, g).y,
    scale: Math.max(1 - back * 0.5, 0.35),
    opacity: clamp(1 - back * 1.4, 0, 1),
  };
}
