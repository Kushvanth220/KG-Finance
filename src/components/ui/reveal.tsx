"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cardEnter, DURATION, EASE } from "@/lib/motion-presets";

/**
 * A card that arrives as you reach it.
 *
 * The dashboard used to animate every card the moment the page mounted —
 * including the ones below the fold, which finished their entrance long
 * before anyone scrolled down. By the time you arrived they were already
 * sitting still, so the motion was spent on nobody.
 *
 * Tying the entrance to the viewport means each card moves at the one moment
 * it is worth watching: as it comes into view, one after another, at whatever
 * pace you scroll. It latches — a card that re-animates every time it crosses
 * the fold is seasickness, not polish.
 *
 * The observer is armed two frames late, and that delay is the whole trick.
 * These cards mount into a page that has not found its height yet: the shell
 * is one viewport tall until the store hydrates, then jumps to twice that.
 * An observer created in that window measures the collapsed layout, decides
 * every card is on screen, and fires all of them at once — which is exactly
 * what happened here. Waiting for the layout to settle costs two frames
 * nobody can perceive and makes the measurement true.
 *
 * `delay` is only for the cards already on screen at load, where there is no
 * scroll to stagger them; anything further down gets its stagger free, from
 * the order your scrolling reveals it.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  /** Only meaningful for cards visible on first paint. */
  delay?: number;
  className?: string;
}) {
  const still = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    let observer: IntersectionObserver | null = null;
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        observer = new IntersectionObserver(
          ([entry]) => {
            if (!entry?.isIntersecting) return;
            setShown(true);
            observer?.disconnect();
          },
          // A sliver is enough to start; waiting for the whole card means a
          // tall one never triggers until it is already past you.
          { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
        );
        observer.observe(node);
      })
    );

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, []);

  if (still) return <div className={className}>{children}</div>;

  return (
    <motion.div
      ref={ref}
      data-reveal={shown ? "shown" : "waiting"}
      className={className}
      variants={cardEnter}
      initial="hidden"
      animate={shown ? "shown" : "hidden"}
      transition={{ duration: DURATION.slow, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}
