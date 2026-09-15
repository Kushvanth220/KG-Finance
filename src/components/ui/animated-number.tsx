"use client";

import { useEffect, useRef, useState } from "react";
import { formatCurrency } from "@/lib/formatters";

/**
 * Money that rolls to its new value instead of snapping.
 *
 * Balances animate on first paint and again whenever the number changes (switch
 * person, switch month, record a spend). It always LANDS on the exact value —
 * the tween only touches what is displayed, never what is stored. The state
 * lives here, in a leaf, so a frame of animation re-renders this span and
 * nothing else.
 *
 * The displayed value is mirrored in a ref. An earlier version read it from the
 * effect's closure during cleanup, which handed the next tween a stale starting
 * point: switching person and back made `from` equal `to`, the effect bailed,
 * and the figure froze on the other person's number while the rest of the page
 * updated. Never derive the tween's start from a closed-over render value.
 */

const DURATION_MS = 700;

/** Fast out, gentle settle — reads as a counter coming to rest. */
function easeOutExpo(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

interface AnimatedMoneyProps {
  value: number;
  className?: string;
  /** Rendered before the amount, e.g. "+". */
  prefix?: string;
}

export function AnimatedMoney({ value, className, prefix }: AnimatedMoneyProps) {
  // Start settled so the server render and the first client paint agree.
  const [shown, setShown] = useState(value);
  /** Always the value currently on screen — the tween's real starting point. */
  const shownRef = useRef(value);
  const frameRef = useRef<number | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    const to = value;
    // First paint rolls up from zero; later changes ease from what is on screen.
    const from = mountedRef.current ? shownRef.current : 0;
    mountedRef.current = true;

    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    const land = () => {
      shownRef.current = to;
      setShown(to);
    };

    // Already there, or a hair of movement that would read as noise.
    if (from === to || prefersReducedMotion() || Math.abs(to - from) < 0.01) {
      land();
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / DURATION_MS);
      if (progress === 1) {
        land();
        frameRef.current = null;
        return;
      }
      const next = from + (to - from) * easeOutExpo(progress);
      shownRef.current = next;
      setShown(next);
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [value]);

  return (
    <span className={className} suppressHydrationWarning>
      {prefix}
      {formatCurrency(shown)}
    </span>
  );
}
