"use client";

import { useEffect, useEffectEvent, useRef } from "react";
import {
  LION_FORMED_AT,
  LionDust,
  loadLionInk,
  type LionFit,
  type LionPlacement,
} from "@/components/brand/lion-dust";
import { cn } from "@/lib/utils";

/**
 * The entrance's own clock moves only with frames that are actually drawn,
 * and never more than this per frame. When the page stalls, the dust waits
 * for it instead of jumping ahead — so every part of the entrance is seen —
 * while a slow but steady device (anything over ~12fps) still plays it at
 * full speed rather than in slow motion.
 */
const MAX_STEP_MS = 80;
/** Before the dust moves, the page should be drawing steadily... */
const CALM_FRAMES = 3;
const CALM_GAP_MS = 40;
/** ...but no entrance waits longer than this to begin. */
const MAX_WAIT_MS = 1200;

interface LionRevealProps {
  /** Where the lion sits for a canvas size. Define it at module scope: a new one replays. */
  fit: (W: number, H: number) => LionFit;
  /** The resting lion, no entrance — reduced motion. */
  still?: boolean;
  /** A tap on the lion plays the entrance again. */
  replayOnTap?: boolean;
  /** As the last particles land. At once when still, or if the lion cannot be drawn. */
  onFormed?: () => void;
  /** When nothing moves any more: the artwork is fully in. */
  onSettled?: () => void;
  /** After every layout, so words can sit under the lion. */
  onLayout?: (placement: LionPlacement) => void;
  className?: string;
}

/** The magnetic-dust entrance on a canvas that fills its box. */
export function LionReveal({
  fit,
  still = false,
  replayOnTap = false,
  onFormed,
  onSettled,
  onLayout,
  className,
}: LionRevealProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** Replays if the point (canvas CSS pixels) is on the lion. */
  const replayRef = useRef<((x: number, y: number) => void) | null>(null);
  const formed = useEffectEvent(() => onFormed?.());
  const settled = useEffectEvent(() => onSettled?.());
  const laidOut = useEffectEvent((placement: LionPlacement) => onLayout?.(placement));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let dust: LionDust | null = null;
    let placed: LionPlacement | null = null;
    let raf = 0;
    let size = "";
    let observer: ResizeObserver | null = null;

    // One performance: waiting for calm, then the clock.
    let clock = 0;
    let last = 0;
    let calm = 0;
    let waitStart = 0;
    let started = false;
    let landed = false;

    const tick = (now: number) => {
      if (!dust) return;
      const gap = last ? now - last : 0;
      last = now;
      if (!started) {
        if (!waitStart) waitStart = now;
        calm = gap > 0 && gap < CALM_GAP_MS ? calm + 1 : 0;
        started = calm >= CALM_FRAMES || now - waitStart > MAX_WAIT_MS;
      } else {
        clock += Math.min(gap, MAX_STEP_MS);
      }
      const moving = dust.draw(clock / 1000);
      if (!landed && clock / 1000 >= LION_FORMED_AT) {
        landed = true;
        formed();
      }
      if (moving) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = 0;
        settled();
      }
    };

    const play = () => {
      if (!dust) return;
      cancelAnimationFrame(raf);
      if (still) {
        raf = 0;
        dust.drawSettled();
        formed();
        settled();
        return;
      }
      clock = 0;
      last = 0;
      calm = 0;
      waitStart = 0;
      started = false;
      landed = false;
      raf = requestAnimationFrame(tick);
    };

    const relayout = () => {
      const next = `${canvas.clientWidth}x${canvas.clientHeight}`;
      if (!dust || next === size) return;
      size = next;
      placed = dust.layout();
      if (!placed) return;
      laidOut(placed);
      // Mid-entrance the next frame repaints; at rest the lion is redrawn here.
      if (!raf) dust.drawSettled();
    };

    const giveUp = () => {
      // No lion — but whatever waits on the entrance must not wait forever.
      formed();
      settled();
    };

    loadLionInk()
      .then((ink) => {
        if (cancelled) return;
        try {
          dust = new LionDust(canvas, ink, fit);
        } catch {
          giveUp();
          return;
        }
        size = `${canvas.clientWidth}x${canvas.clientHeight}`;
        placed = dust.layout();
        if (placed) laidOut(placed);
        play();
        replayRef.current = (x, y) => {
          if (placed && Math.hypot(x - placed.cx, y - placed.cy) <= placed.size / 2) play();
        };
        observer = new ResizeObserver(relayout);
        observer.observe(canvas);
      })
      .catch(() => {
        if (!cancelled) giveUp();
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      observer?.disconnect();
      replayRef.current = null;
      dust?.dispose();
    };
  }, [fit, still]);

  // A click, not a pointerdown: on a phone every scroll starts with a touch,
  // and the lion should not burst apart each time someone scrolls past it.
  // Keyed on `still` because a disposed canvas cannot get its GPU context back.
  return (
    <canvas
      key={still ? "still" : "moving"}
      ref={canvasRef}
      aria-hidden
      onClick={
        replayOnTap
          ? (event) => replayRef.current?.(event.nativeEvent.offsetX, event.nativeEvent.offsetY)
          : undefined
      }
      className={cn("block h-full w-full", className)}
    />
  );
}
