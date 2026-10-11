"use client";

import { useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import { motion, useInView, useReducedMotion } from "motion/react";
import { Pause, Play } from "lucide-react";
import type { StorySlide } from "@/lib/money-story";
import { cn } from "@/lib/utils";

/**
 * Home's story card: the period told one bold screen at a time.
 *
 * Every screen has its own colour and wipes in over the last one, from the
 * side you tapped. The bar for the screen fills while it is up, then the next
 * one comes. Tap the right of the card for the next screen, the left to go
 * back, hold to pause. It waits while scrolled away, and with reduced motion
 * it starts paused and never moves on by itself.
 */

const SCREEN_MS = 4500;
const WIPE_S = 1.1;
// Just past the far corner from either origin, so the whole wipe is seen, none of it spent off the card.
const WIPE_TO = "115%";
const HOLD_MS = 250;

// Where the two shapes drift on each screen, so no two screens look alike.
const SHAPES = [
  { circle: [-8, 8], square: [66, 64], turn: 0 },
  { circle: [60, -8], square: [-6, 60], turn: 20 },
  { circle: [8, 62], square: [64, 4], turn: 40 },
  { circle: [66, 56], square: [4, 8], turn: 60 },
  { circle: [30, -12], square: [72, 70], turn: 80 },
];

function Screen({ slide, at, enter }: { slide: StorySlide; at: number; enter: boolean }) {
  const shape = SHAPES[at % SHAPES.length]!;
  const rise = (delay: number) =>
    enter
      ? {
          initial: { opacity: 0, y: 16 },
          animate: { opacity: 1, y: 0 },
          transition: { delay, duration: 0.6, ease: [0.2, 0.9, 0.2, 1] as const },
        }
      : {};

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 pb-9 pt-14 text-center"
      style={{ background: `var(--story-${slide.palette})` }}
    >
      <span
        aria-hidden
        className="kg-story-shape kg-story-float h-[120px] w-[120px] rounded-full"
        style={{ left: `${shape.circle[0]}%`, top: `${shape.circle[1]}%` }}
      />
      <span
        aria-hidden
        className="absolute h-[90px] w-[90px]"
        style={{ left: `${shape.square[0]}%`, top: `${shape.square[1]}%`, transform: `rotate(${shape.turn}deg)` }}
      >
        <span className="kg-story-shape kg-story-spin inset-0 rounded-[22px]" />
      </span>

      <motion.p
        className={cn(
          "relative font-bold leading-none tracking-[-0.035em] tabular-nums",
          slide.big.length > 7 ? "text-[44px]" : "text-[60px]"
        )}
        {...rise(0.35)}
      >
        {slide.big}
      </motion.p>
      <motion.p className="relative text-sm font-medium text-white/90" {...rise(0.5)}>
        {slide.label}
      </motion.p>
      <motion.p className="relative max-w-[30ch] text-[15px] leading-snug" {...rise(0.65)}>
        {slide.say}
      </motion.p>
    </div>
  );
}

export function MoneyStory({
  slides,
  title,
  narrator,
}: {
  slides: StorySlide[];
  /** "Oct 2026": the range the story tells. */
  title: string;
  /** The assistant's name; it is the one telling it. */
  narrator: string;
}) {
  const still = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.5 });
  // `prev` is the screen being wiped over; it stays mounted underneath until the wipe ends.
  const [step, setStep] = useState<{ index: number; prev: number | null; dir: number; run: number }>({
    index: 0,
    prev: null,
    dir: 1,
    run: 0,
  });
  const [held, setHeld] = useState(false);
  // The play/pause button's choice; until it is pressed, reduced motion means paused.
  const [choice, setChoice] = useState<boolean | null>(null);
  const press = useRef<{ x: number; y: number; held: boolean; moved: boolean; timer: number } | null>(null);

  const count = slides.length;
  const index = Math.min(step.index, count - 1);
  const slide = slides[index];
  const playing = choice ?? !still;
  const paused = !playing || held || !inView;

  const go = (to: number, dir: number) => {
    if (count < 2) return;
    setStep((s) => ({ index: (to + count) % count, prev: Math.min(s.index, count - 1), dir, run: s.run + 1 }));
  };

  // A tap moves; a hold pauses; a drag belongs to the deck around this card.
  const tap = (dir: number) => {
    const p = press.current;
    press.current = null;
    if (p && (p.held || p.moved)) return;
    go(index + dir, dir);
  };
  const endPress = () => {
    const p = press.current;
    if (!p) return;
    window.clearTimeout(p.timer);
    if (p.held) setHeld(false);
  };

  if (!slide) return null;

  const origin = step.dir > 0 ? "85%" : "15%";
  const under = step.prev !== null ? slides[step.prev] : undefined;
  const layers = [
    ...(under && step.prev !== null ? [{ run: step.run - 1, at: step.prev, slide: under, top: false }] : []),
    { run: step.run, at: index, slide, top: true },
  ];

  return (
    <div
      ref={ref}
      role="group"
      aria-roledescription="story"
      aria-label={`${title}, told by ${narrator}`}
      className="kg-story relative h-[320px] select-none overflow-hidden rounded-[var(--card-radius)] shadow-[var(--glass-shadow)] [-webkit-touch-callout:none]"
      style={{ background: `var(--story-${slide.palette})` }}
    >
      {/* The screen in front keeps its element when it slips underneath, so its shapes never jump. */}
      {layers.map((layer) => (
        <motion.div
          key={`layer-${layer.run}`}
          aria-hidden={!layer.top}
          className="absolute inset-0"
          initial={layer.run === 0 ? false : still ? { opacity: 0 } : { clipPath: `circle(0% at ${origin} 30%)` }}
          animate={
            layer.top
              ? still
                ? { opacity: 1 }
                : { clipPath: `circle(${WIPE_TO} at ${origin} 30%)`, scale: 1, opacity: 1 }
              : still
                ? { opacity: 1 }
                : { scale: 1.06, opacity: 0.6 }
          }
          transition={{ duration: still ? 0.25 : WIPE_S, ease: [0.45, 0, 0.3, 1] }}
          onAnimationComplete={() => {
            if (!layer.top) return;
            setStep((s) => (s.run === layer.run && s.prev !== null ? { ...s, prev: null } : s));
          }}
        >
          <Screen slide={layer.slide} at={layer.at} enter={!still} />
        </motion.div>
      ))}

      {/* One bar per screen: the past ones full, this one filling. */}
      <div aria-hidden className="absolute inset-x-3 top-2.5 z-10 flex gap-1">
        {slides.map((item, k) => (
          <span key={item.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
            {k < index || (k === index && count === 1) ? (
              <span className="block h-full w-full bg-white" />
            ) : k === index ? (
              <span
                key={step.run}
                className="kg-story-fill block h-full bg-white"
                style={{ "--story-ms": `${SCREEN_MS}ms`, animationPlayState: paused ? "paused" : "running" } as CSSProperties}
                onAnimationEnd={() => go(index + 1, 1)}
              />
            ) : null}
          </span>
        ))}
      </div>

      <div className="pointer-events-none absolute inset-x-3 top-5 z-10 flex items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-1.5 text-[11.5px] font-semibold">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--ring-top)]">
            <Image src="/brand/lion-mark.webp" alt="" width={24} height={24} className="h-[19px] w-[19px]" draggable={false} />
          </span>
          <span className="truncate">
            {narrator} · {title}
          </span>
        </p>
        <button
          type="button"
          onClick={() => setChoice(!playing)}
          aria-label={playing ? "Pause the story" : "Play the story"}
          className="pointer-events-auto grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white/15 transition-colors hover:bg-white/25"
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* Left third goes back, the rest goes on. */}
      <div
        className="absolute inset-x-0 bottom-0 top-12 z-[5] grid grid-cols-[1fr_2fr]"
        onPointerDown={(event) => {
          if (press.current) window.clearTimeout(press.current.timer);
          press.current = {
            x: event.clientX,
            y: event.clientY,
            held: false,
            moved: false,
            timer: window.setTimeout(() => {
              if (!press.current) return;
              press.current.held = true;
              setHeld(true);
            }, HOLD_MS),
          };
        }}
        onPointerMove={(event) => {
          const p = press.current;
          if (p && !p.moved && Math.hypot(event.clientX - p.x, event.clientY - p.y) > 8) {
            p.moved = true;
            window.clearTimeout(p.timer);
          }
        }}
        onPointerUp={endPress}
        onPointerLeave={endPress}
        onPointerCancel={() => {
          endPress();
          press.current = null;
        }}
      >
        <button
          type="button"
          aria-label="Previous screen"
          onClick={() => tap(-1)}
          className="outline-none focus-visible:bg-white/10"
        />
        <button
          type="button"
          aria-label="Next screen"
          onClick={() => tap(1)}
          className="outline-none focus-visible:bg-white/10"
        />
      </div>

      <p className="pointer-events-none absolute inset-x-0 bottom-2.5 z-10 text-center font-mono text-[10px] tracking-[0.08em] text-white/70">
        {playing ? "tap · hold to pause" : "paused · tap to move"}
      </p>
    </div>
  );
}
