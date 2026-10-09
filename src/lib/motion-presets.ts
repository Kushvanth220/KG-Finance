import type { Transition, Variants } from "motion/react";

/**
 * One motion vocabulary for the app.
 *
 * Every animation in here is tied to a STATE CHANGE — a row recorded, a
 * figure revised, a panel swapped — never to scroll position. Scroll theatre
 * belongs on the front door, which is seen once; this app is opened ten times
 * a day, and movement you did not ask for becomes a tax on the eleventh.
 *
 * Three durations, one curve. The curve is a fast-out, slow-settle so a row
 * arrives decisively and comes to rest rather than drifting. Durations are
 * short on purpose: anything over ~300ms reads as the app being slow, and the
 * whole point is that logging a spend feels instant.
 *
 * Every consumer must pair these with `useReducedMotion()` and fall back to no
 * movement. A figure still lands on its value, a row still appears — they just
 * do it immediately.
 */

/** Fast out, gentle settle. */
export const EASE = [0.22, 1, 0.36, 1] as const;

export const DURATION = {
  /** A chip flipping, a colour settling. */
  quick: 0.18,
  /** The default: a row arriving, a panel swapping. */
  base: 0.26,
  /** Something larger moving, like a card entering for the first time. */
  slow: 0.42,
} as const;

export const transition: Transition = { duration: DURATION.base, ease: EASE };
export const quickTransition: Transition = { duration: DURATION.quick, ease: EASE };

/**
 * A row joining or leaving a list.
 *
 * It collapses its own height on the way out, so the rows beneath close the
 * gap instead of jumping — the difference between "that was removed" and
 * "something broke".
 */
export const listRow: Variants = {
  hidden: { opacity: 0, y: -6, height: 0, marginTop: 0, marginBottom: 0 },
  shown: { opacity: 1, y: 0, height: "auto", marginTop: undefined, marginBottom: undefined },
  gone: { opacity: 0, x: 12, height: 0, marginTop: 0, marginBottom: 0 },
};

/** A card arriving for the first time: present, not theatrical. */
export const cardEnter: Variants = {
  hidden: { opacity: 0, y: 10 },
  shown: { opacity: 1, y: 0 },
};

/**
 * Stagger for a column of cards. Capped deliberately — past about six items
 * the last one arrives late enough to feel broken, so the delay stops growing.
 */
export function enterDelay(index: number, step = 0.045, cap = 6): number {
  return Math.min(index, cap) * step;
}
