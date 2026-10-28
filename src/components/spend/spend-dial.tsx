"use client";

import { useEffect, useRef, type RefObject } from "react";
import { animate, motion, useMotionValue, useReducedMotion } from "motion/react";
import { Calculator, MoreHorizontal, Plus } from "lucide-react";
import { categoryLook } from "@/lib/category-look";
import { haptic } from "@/lib/haptics";
import type { SpendCategory } from "@/types";
import { cn } from "@/lib/utils";

/**
 * The amount in the middle of a ring of categories: tap one, or turn the ring
 * with a finger, and a lit wedge swings round to it. The categories used this
 * week sit at the top of the ring; when there are more than fit, the last place
 * is "More", which opens every category. The one chosen from there takes a place
 * on the ring, so the ring always shows the choice.
 */

const MAX_SLOTS = 8;
// Labels sit on a circle this far from the middle, as a share of the dial's width.
const LABEL_RADIUS = 39;

type Slot = { kind: "category"; category: SpendCategory } | { kind: "more" };

/** The shortest turn from one angle to another, so the wedge never spins the long way round. */
const shortest = (from: number, to: number) => from + ((((to - from) % 360) + 540) % 360) - 180;

export function SpendDial({
  amount,
  amountRef,
  onAmountChange,
  onAmountBlur,
  onEnter,
  refund,
  categories,
  selectedId,
  onSelect,
  onMore,
  onAppendPlus,
  onOpenCalculator,
}: {
  amount: string;
  amountRef: RefObject<HTMLInputElement | null>;
  onAmountChange: (value: string) => void;
  /** The field let go: a sum like "12+3" settles into its answer. */
  onAmountBlur: () => void;
  /** Enter in the amount: on to the next step. */
  onEnter: () => void;
  refund: boolean;
  /** Every category, the most used first. */
  categories: SpendCategory[];
  selectedId: string | null;
  onSelect: (category: SpendCategory) => void;
  /** Opens the full list of categories. */
  onMore: () => void;
  onAppendPlus: () => void;
  onOpenCalculator: () => void;
}) {
  const still = useReducedMotion();
  const selected = categories.find((category) => category.id === selectedId) ?? null;

  const overflow = categories.length > MAX_SLOTS;
  let ring = overflow ? categories.slice(0, MAX_SLOTS - 1) : categories;
  // A category picked from "More" takes the last place, so the ring always shows the choice.
  if (overflow && selected && !ring.includes(selected)) ring = [...ring.slice(0, MAX_SLOTS - 2), selected];
  const slots: Slot[] = [
    ...ring.map((category) => ({ kind: "category" as const, category })),
    ...(overflow ? [{ kind: "more" as const }] : []),
  ];
  const step = 360 / Math.max(1, slots.length);
  const selectedSlot = slots.findIndex((slot) => slot.kind === "category" && slot.category.id === selectedId);

  const turn = useMotionValue(0);
  useEffect(() => {
    if (selectedSlot < 0) return;
    const target = shortest(turn.get(), selectedSlot * step);
    if (still) {
      turn.set(target);
      return;
    }
    const controls = animate(turn, target, { type: "spring", stiffness: 260, damping: 26 });
    return () => controls.stop();
  }, [selectedSlot, step, still, turn]);

  // Turning the ring: the finger's angle round the middle picks the place under it.
  const dial = useRef<HTMLDivElement>(null);
  const turning = useRef(false);
  const slotAt = (x: number, y: number): number | null => {
    const box = dial.current?.getBoundingClientRect();
    if (!box) return null;
    const dx = x - (box.left + box.width / 2);
    const dy = y - (box.top + box.height / 2);
    const distance = Math.hypot(dx, dy) / (box.width / 2);
    // Only the band the labels sit on turns the ring; the middle is the amount.
    if (distance < 0.56 || distance > 1.05) return null;
    const angle = ((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360;
    return Math.round(angle / step) % slots.length;
  };
  const pickSlot = (index: number | null) => {
    if (index === null || index === selectedSlot) return;
    const slot = slots[index];
    if (slot?.kind !== "category") return;
    haptic(4);
    onSelect(slot.category);
  };

  const look = selected ? categoryLook(selected) : null;
  const tint = look?.color ?? "var(--accent)";
  const amountSize = amount.length <= 6 ? "text-4xl" : amount.length <= 9 ? "text-3xl" : "text-2xl";

  return (
    <div
      ref={dial}
      className="relative mx-auto aspect-square w-full max-w-[300px] select-none touch-pan-y"
      onPointerDown={(event) => {
        if (slotAt(event.clientX, event.clientY) === null) return;
        turning.current = true;
      }}
      onPointerMove={(event) => {
        if (turning.current && event.buttons) pickSlot(slotAt(event.clientX, event.clientY));
      }}
      onPointerUp={() => {
        turning.current = false;
      }}
      onPointerCancel={() => {
        turning.current = false;
      }}
    >
      <div aria-hidden className="absolute inset-0 rounded-full border border-black/10 bg-black/[0.025] dark:border-white/10 dark:bg-white/[0.04]" />
      {/* The lit wedge behind the chosen place. */}
      <motion.div
        aria-hidden
        className="absolute inset-0 rounded-full"
        style={{
          rotate: turn,
          opacity: selectedSlot < 0 ? 0 : 1,
          background: `conic-gradient(from ${-step / 2}deg, color-mix(in srgb, ${tint} 55%, transparent) 0deg ${step}deg, transparent ${step}deg 360deg)`,
          WebkitMask: "radial-gradient(circle closest-side, transparent 57%, #000 58%)",
          mask: "radial-gradient(circle closest-side, transparent 57%, #000 58%)",
          transition: "opacity 200ms",
        }}
      />

      <div role="group" aria-label="Category">
        {slots.map((slot, index) => {
          const angle = ((-90 + index * step) * Math.PI) / 180;
          const position = {
            left: `${50 + LABEL_RADIUS * Math.cos(angle)}%`,
            top: `${50 + LABEL_RADIUS * Math.sin(angle)}%`,
          };
          if (slot.kind === "more") {
            return (
              <button
                key="more"
                type="button"
                onClick={onMore}
                style={position}
                className="absolute flex w-[68px] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 rounded-xl py-1 text-[10.5px] font-semibold text-accent"
              >
                <MoreHorizontal className="h-4 w-4" aria-hidden />
                More
              </button>
            );
          }
          const on = slot.category.id === selectedId;
          const face = categoryLook(slot.category);
          return (
            <button
              key={slot.category.id}
              type="button"
              aria-pressed={on}
              onClick={() => pickSlot(index)}
              style={position}
              className={cn(
                "absolute flex w-[70px] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 rounded-xl py-1 text-[10.5px] leading-tight transition-colors",
                on ? "font-bold text-foreground" : "font-semibold text-muted hover:text-foreground"
              )}
            >
              <span aria-hidden className="text-[15px] leading-none">
                {face.emoji}
              </span>
              {/* Two short lines, not one cut-off line: "Cash withd…" told nobody which category it was. */}
              <span className="line-clamp-2 w-full break-words px-0.5 text-center text-[10px] [text-wrap:balance]">
                {slot.category.name}
              </span>
            </button>
          );
        })}
      </div>

      {/* The middle: what it is, how much, and the two ways to add it up. */}
      <div className="glass absolute left-1/2 top-1/2 flex h-[54%] w-[54%] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full px-2">
        <p className="max-w-full truncate text-[11px] font-semibold" style={{ color: look ? tint : undefined }}>
          {selected ? selected.name : <span className="text-muted">Pick a category</span>}
        </p>
        <div className="flex max-w-full items-baseline justify-center">
          <span className={cn("text-lg font-light", refund ? "text-positive" : "text-muted")}>{refund ? "+$" : "$"}</span>
          <input
            ref={amountRef}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(event) => onAmountChange(event.target.value)}
            onBlur={onAmountBlur}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onEnter();
              }
            }}
            placeholder="0"
            style={{ width: `${Math.max(1, amount.length) + 0.4}ch` }}
            className={cn(
              "min-w-0 max-w-[132px] bg-transparent text-center font-bold tabular-nums outline-none",
              amountSize,
              refund && "text-positive"
            )}
            aria-label="Amount"
            autoFocus
          />
        </div>
        <div className="mt-1 flex gap-1.5">
          <button
            type="button"
            // Pressing must not take focus from the amount: losing it settles "12+3" into "15".
            onMouseDown={(event) => event.preventDefault()}
            onClick={onAppendPlus}
            aria-label="Add another item"
            title="Add another item to the same receipt"
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full bg-accent/12 text-accent",
              amount.trim() === "" && "opacity-40"
            )}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onOpenCalculator}
            aria-label="Open the calculator"
            title="Calculator, with the sums worked out before"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/12 text-accent"
          >
            <Calculator className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
