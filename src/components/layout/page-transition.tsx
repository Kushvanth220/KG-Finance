"use client";

import { ViewTransition, useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useReducedMotion } from "motion/react";

/**
 * The move between pages: a ripple from your finger, then the cards dealt in.
 *
 * The new page spreads out of the spot you touched (a tab, a link, a button)
 * as a growing circle, with the old page still showing around it. As the
 * circle reaches each card on the new page, that card is dealt into place with
 * a small bounce, nearest first, so the page builds outward from your finger.
 * A page opened without a touch (the back button, a redirect) ripples up from
 * the tab bar.
 *
 * It runs on the browser's view transitions: React names the old and the new
 * page, the browser keeps a picture of the old one, and the two pictures are
 * animated here by name. Both pages are see-through over the shared
 * background, so the circle is the only boundary. Inside it is the new page;
 * outside it, the old page with the same circle cut out of it. The new picture
 * is live, so the cards being dealt show through it. The ripple waits for the
 * new page to draw a couple of quiet frames, so it plays smoothly instead of
 * jumping, and the header, tab bar and assistant button hold still on top of
 * it all (globals.css).
 *
 * Only the route animates, never the data: switching person or month inside a
 * page does not come through here. The first page of a visit arrives as is,
 * and reduced motion swaps pages with no move at all.
 */

const RIPPLE_MS = 650;
const DEAL_MS = 520;
// The ripple's curve, as cubic-bezier control points: slow off the finger, fast across, gentle landing.
const CURVE = [0.45, 0, 0.25, 1] as const;
const RIPPLE_EASE = `cubic-bezier(${CURVE.join(", ")})`;
// A touch this recent is the one that opened the page; anything older is not.
const FRESH_MS = 4000;
// The most cards dealt on one page; the rest arrive with the ripple.
const MAX_CARDS = 10;

// Where the last touch landed, and where the page was at that moment.
let touch = { x: 0, y: 0, at: Number.NEGATIVE_INFINITY, pageX: 0, pageY: 0 };

const pageNode = () => document.querySelector<HTMLElement>("[data-kg-page]");

function remember(x: number, y: number) {
  const box = pageNode()?.getBoundingClientRect();
  touch = { x, y, at: performance.now(), pageX: box?.left ?? 0, pageY: box?.top ?? 0 };
}

/** The point the ripple grows from, in the viewport. */
function origin(): { x: number; y: number } {
  if (performance.now() - touch.at < FRESH_MS) return touch;
  return { x: window.innerWidth / 2, y: window.innerHeight - 36 };
}

/** A radius that covers the whole screen from (x, y). */
const reachFrom = (x: number, y: number) =>
  Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)) + 24;

/** Where the browser put a page's picture, from the transform it gave the group. */
function groupOrigin(name: string): { x: number; y: number } | null {
  try {
    const transform = getComputedStyle(document.documentElement, `::view-transition-group(${name})`).transform;
    if (!transform || transform === "none") return null;
    const matrix = new DOMMatrixReadOnly(transform);
    return { x: matrix.m41, y: matrix.m42 };
  } catch {
    return null;
  }
}

/** The share of the ripple's time it takes the edge to grow to `share` of its full size. */
function timeToReach(share: number): number {
  if (share <= 0) return 0;
  if (share >= 1) return 1;
  const [x1, y1, x2, y2] = CURVE;
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 24; k++) {
    const s = (lo + hi) / 2;
    const grown = 3 * (1 - s) ** 2 * s * y1 + 3 * (1 - s) * s * s * y2 + s ** 3;
    if (grown < share) lo = s;
    else hi = s;
  }
  return 3 * (1 - hi) ** 2 * hi * x1 + 3 * (1 - hi) * hi * hi * x2 + hi ** 3;
}

/**
 * The page's cards: the first level below the page that holds more than one
 * thing, with any block taller than most of the screen opened up one level
 * more. Only what is on screen, and never a block holding something fixed,
 * which a moving parent would carry along with it.
 */
function cardsOf(page: HTMLElement): HTMLElement[] {
  let level: Element = page;
  while (level.children.length === 1) level = level.children[0]!;
  const tall = window.innerHeight * 0.6;
  const blocks = Array.from(level.children).flatMap((child) =>
    child.getBoundingClientRect().height > tall && child.children.length > 1 ? Array.from(child.children) : [child]
  );
  return blocks
    .filter((block): block is HTMLElement => {
      if (!(block instanceof HTMLElement)) return false;
      const box = block.getBoundingClientRect();
      return (
        box.height > 0 &&
        box.bottom > 0 &&
        box.top < window.innerHeight &&
        !block.matches(".fixed") &&
        !block.querySelector(".fixed")
      );
    })
    .slice(0, MAX_CARDS);
}

/**
 * How far a card may turn without a corner passing the edge of the screen.
 * A turned card is wider than it stands, and a tall one more so: on a phone,
 * anything poking past the edge zooms the whole page out, which also cancels
 * the move. So short cards get the full turn and long lists barely any.
 */
function turnFor(box: DOMRect): number {
  const room = Math.max(0, Math.min(box.left, window.innerWidth - box.right) - 1);
  const most = (Math.asin(Math.min(1, (2 * room) / Math.max(1, box.height))) * 180) / Math.PI;
  return Math.min(2.5, most);
}

const unmark = (card: HTMLElement) => card.removeAttribute("data-dealt");

/** Deal each card as the ripple reaches it: up from below, a little turned, with a bounce. */
function deal(cards: HTMLElement[], x: number, y: number, reach: number) {
  cards.forEach((card, i) => {
    const box = card.getBoundingClientRect();
    const dx = Math.max(box.left - x, 0, x - box.right);
    const dy = Math.max(box.top - y, 0, y - box.bottom);
    const reached = timeToReach(Math.hypot(dx, dy) / reach) * RIPPLE_MS;
    const dealt = card.animate(
      [
        { translate: "0 44px", rotate: `${(i % 2 ? 1 : -1) * turnFor(box)}deg`, scale: "0.95", opacity: 0 },
        { translate: "0 0", rotate: "0deg", scale: "1", opacity: 1 },
      ],
      {
        duration: DEAL_MS,
        // A beat before the edge arrives, so the card is already moving as it comes into view.
        delay: Math.max(0, reached - 60),
        easing: "cubic-bezier(0.2, 1.3, 0.4, 1)",
        fill: "backwards",
      }
    );
    const done = () => unmark(card);
    dealt.finished.then(done, done);
  });
}

// Starts waiting for the new page to settle. Both halves of the ripple wait here and go in the same frame.
let waiting: (() => void)[] = [];

/**
 * Run once the new page has drawn two quiet frames. A page does most of its
 * setting up in its first frames; a ripple started then would stall and jump
 * ahead. Gives up waiting after a dozen frames.
 */
function whenSettled(run: () => void) {
  waiting.push(run);
  if (waiting.length > 1) return;
  let last = performance.now();
  let calm = 0;
  let frames = 0;
  const tick = (now: number) => {
    calm = now - last < 34 ? calm + 1 : 0;
    last = now;
    if (calm < 2 && ++frames < 12) {
      requestAnimationFrame(tick);
      return;
    }
    const due = waiting;
    waiting = [];
    due.forEach((go) => go());
  };
  requestAnimationFrame(tick);
}

/** The new page: a circle growing out of the touch, and its cards dealt as it reaches them. */
function rippleIn(name: string) {
  const page = pageNode();
  const { x, y } = origin();
  const reach = reachFrom(x, y);
  const box = page?.getBoundingClientRect();
  const at = `${x - (box?.left ?? 0)}px ${y - (box?.top ?? 0)}px`;
  // Held at its first frame (the new page hidden) until the page has settled.
  const ripple = document.documentElement.animate(
    [{ clipPath: `circle(0px at ${at})` }, { clipPath: `circle(${reach}px at ${at})` }],
    { duration: RIPPLE_MS, easing: RIPPLE_EASE, fill: "both", pseudoElement: `::view-transition-new(${name})` }
  );
  ripple.pause();
  // Marked at once, before a card's own entrance (see Reveal) looks: one entrance each.
  const cards = page ? cardsOf(page) : [];
  cards.forEach((card) => (card.dataset.dealt = ""));
  let over = false;
  let started = false;
  whenSettled(() => {
    if (over) return;
    started = true;
    ripple.play();
    deal(cards, x, y, reach);
  });
  // React runs this once the move has finished; the picture it held is gone by then.
  return () => {
    over = true;
    ripple.cancel();
    if (!started) cards.forEach(unmark);
  };
}

/**
 * The old page: the same circle cut out of it, so the two never overlap. It
 * dims a little as it goes. The hole is the second mask layer (globals.css),
 * grown from the touch: its size doubles the radius, and its corner moves out
 * by the radius, so its centre stays under the finger.
 */
function rippleOut(name: string) {
  const { x, y } = origin();
  const at = groupOrigin(name) ?? { x: touch.pageX, y: touch.pageY };
  const cx = x - at.x;
  const cy = y - at.y;
  const r = reachFrom(x, y);
  const hole = document.documentElement.animate(
    [
      { maskSize: "100% 100%, 0px 0px", maskPosition: `0px 0px, ${cx}px ${cy}px`, opacity: 1 },
      { maskSize: `100% 100%, ${2 * r}px ${2 * r}px`, maskPosition: `0px 0px, ${cx - r}px ${cy - r}px`, opacity: 0.7 },
    ],
    { duration: RIPPLE_MS, easing: RIPPLE_EASE, fill: "both", pseudoElement: `::view-transition-old(${name})` }
  );
  hole.pause();
  let over = false;
  whenSettled(() => {
    if (!over) hole.play();
  });
  return () => {
    over = true;
    hole.cancel();
  };
}

// A view-transition name for a route: "/" is kg-page-home, "/flex" kg-page-flex.
const pageName = (pathname: string) =>
  `kg-page-${pathname.split("/").filter(Boolean).join("_").replace(/[^\w-]/g, "") || "home"}`;

export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const still = useReducedMotion();

  // Remember every touch (and Enter or Space on a focused control): the next page grows from it.
  useEffect(() => {
    const onPointer = (event: PointerEvent) => remember(event.clientX, event.clientY);
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const target = document.activeElement;
      if (!(target instanceof HTMLElement) || target === document.body) return;
      const box = target.getBoundingClientRect();
      remember(box.left + box.width / 2, box.top + box.height / 2);
    };
    window.addEventListener("pointerdown", onPointer, { capture: true, passive: true });
    window.addEventListener("keydown", onKey, { capture: true });
    return () => {
      window.removeEventListener("pointerdown", onPointer, { capture: true });
      window.removeEventListener("keydown", onKey, { capture: true });
    };
  }, []);

  if (still) return <div data-kg-page="">{children}</div>;

  return (
    <ViewTransition
      key={pathname}
      name={pageName(pathname)}
      enter="kg-page-in"
      exit="kg-page-out"
      default="none"
      onEnter={(instance) => rippleIn(instance.name)}
      onExit={(instance) => rippleOut(instance.name)}
    >
      <div data-kg-page="">{children}</div>
    </ViewTransition>
  );
}
