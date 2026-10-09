"use client";

import { useRef, type ReactNode } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useHydratedReducedMotion } from "@/hooks/use-is-client";

/**
 * The scroll mechanics of the front door.
 *
 * Three moves, each tied to scroll position rather than to a timer, so the
 * page answers the reader's hand instead of performing at them:
 *
 *   ContractingHero — the opening fills the screen, then shrinks into a card
 *     as you scroll, uncovering the wall of product shots it was sitting on.
 *     One gesture that says "this is the app, and here is everything in it".
 *   ArcWipe — a vast rounded edge rises to swallow the section above, which
 *     is how one chapter ends and the next begins without a hard cut.
 *   Parallax — slower and faster layers, to give the mosaic depth.
 *
 * Everything degrades to a plain stacked page under `prefers-reduced-motion`:
 * same content, same order, no movement. Nothing here is load-bearing for
 * meaning — the page reads fine standing still, which is the test.
 */

export function ContractingHero({
  children,
  behind,
}: {
  /** The opening panel that shrinks. */
  children: ReactNode;
  /** The wall it uncovers. */
  behind: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // The still version is different markup, so it waits for hydration.
  const still = useHydratedReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });

  const scale = useTransform(scrollYProgress, [0, 1], [1, 0.56]);
  const radius = useTransform(scrollYProgress, [0, 1], ["0px", "28px"]);
  const behindScale = useTransform(scrollYProgress, [0, 1], [1.12, 1]);
  const behindOpacity = useTransform(scrollYProgress, [0, 0.35, 1], [0, 0.55, 1]);
  const copyOpacity = useTransform(scrollYProgress, [0, 0.55], [1, 0]);

  if (still) {
    // Still holds the ref: useScroll is called either way and wants a target.
    return (
      <div ref={ref}>
        <section className="relative min-h-[100dvh] overflow-hidden">{children}</section>
        <section className="relative">{behind}</section>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative h-[230vh]">
      <div className="sticky top-0 h-[100dvh] overflow-hidden">
        {/* The wall, revealed from underneath. */}
        <motion.div
          style={{ scale: behindScale, opacity: behindOpacity }}
          className="absolute inset-0 origin-center"
        >
          {behind}
        </motion.div>

        {/* The opening panel, contracting. */}
        <motion.div
          style={{ scale, borderRadius: radius }}
          className="absolute inset-0 origin-center overflow-hidden will-change-transform"
        >
          {children}
          <motion.div style={{ opacity: copyOpacity }} className="pointer-events-none absolute inset-0" />
        </motion.div>
      </div>
    </div>
  );
}

/** A vast rounded edge that rises to take over the screen. */
export function ArcWipe({
  children,
  from = "var(--accent)",
  to = "var(--feature)",
}: {
  children: ReactNode;
  from?: string;
  to?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const still = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "center center"] });
  const rise = useTransform(scrollYProgress, [0, 1], ["55%", "0%"]);
  const curve = useTransform(scrollYProgress, [0, 1], ["70% 70% 0 0 / 28% 28% 0 0", "0% 0% 0 0 / 0% 0% 0 0"]);

  return (
    <section ref={ref} className="relative overflow-hidden">
      <motion.div
        aria-hidden
        className="absolute inset-0 z-0"
        style={{
          background: `linear-gradient(160deg, ${from}, ${to})`,
          y: still ? 0 : rise,
          borderRadius: still ? "0px" : curve,
        }}
      />
      <div className="relative z-10">{children}</div>
    </section>
  );
}

/** A layer that drifts at its own speed, for depth in the mosaic. */
export function Parallax({
  children,
  distance = 60,
  className,
}: {
  children: ReactNode;
  /** Pixels travelled across the whole pass; negative moves against the scroll. */
  distance?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const still = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [distance, -distance]);

  return (
    <div ref={ref} className={className}>
      <motion.div style={{ y: still ? 0 : y }}>{children}</motion.div>
    </div>
  );
}
