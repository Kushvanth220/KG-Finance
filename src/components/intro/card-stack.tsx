"use client";

import { useState } from "react";
import { motion, useReducedMotion, type PanInfo } from "motion/react";
import { ChevronLeft, ChevronRight, CreditCard, Landmark, PiggyBank } from "lucide-react";
import { BankCardFace } from "@/components/art/page-art";

/**
 * Three cards fanned in depth, the front one in hand.
 *
 * Flick it aside and the next comes forward; the others sit behind at an
 * angle, further back in z, so the stack reads as a stack and not a row.
 * All CSS 3D — a card is a flat thing, and a flat thing turned in space is
 * all the dimension it needs.
 */

const CARDS = [
  { key: "checking", label: "Checking", amount: 1420, sub: "Bank of Somewhere · 4821", tint: "#1f6fd6", icon: <Landmark className="h-5 w-5" /> },
  { key: "savings", label: "Savings", amount: 640, sub: "Growing since March", tint: "#4b3fc9", icon: <PiggyBank className="h-5 w-5" /> },
  { key: "credit", label: "Credit card", amount: 759.13, sub: "Owed · due the 3rd", tint: "#c9302c", icon: <CreditCard className="h-5 w-5" /> },
];

/** Where a card sits given how far behind the front it is. */
function pose(depth: number, narrow: boolean) {
  const step = narrow ? 34 : 50;
  return {
    x: depth * step,
    z: -depth * 120,
    rotateY: -depth * 14,
    rotateZ: depth * 3.5,
    scale: 1 - depth * 0.07,
    opacity: depth === 0 ? 1 : 0.9 - depth * 0.18,
  };
}

export function CardStack() {
  const still = useReducedMotion();
  const [front, setFront] = useState(0);
  const n = CARDS.length;
  const next = () => setFront((f) => (f + 1) % n);
  const prev = () => setFront((f) => (f - 1 + n) % n);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -50 || info.velocity.x < -300) next();
    else if (info.offset.x > 50 || info.velocity.x > 300) prev();
  };

  return (
    <div className="intro-stack">
      <div className="intro-stack-stage" style={{ perspective: 1200 }}>
        {CARDS.map((card, i) => {
          const depth = (i - front + n) % n;
          const isFront = depth === 0;
          return (
            <motion.div
              key={card.key}
              className="intro-stack-card"
              style={{ transformStyle: "preserve-3d", zIndex: n - depth }}
              initial={false}
              animate={pose(depth, false)}
              transition={still ? { duration: 0 } : { type: "spring", stiffness: 220, damping: 26 }}
              drag={isFront ? "x" : false}
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.35}
              onDragEnd={isFront ? onDragEnd : undefined}
              onClick={() => (isFront ? undefined : setFront(i))}
              whileTap={isFront ? { scale: 0.98 } : undefined}
              aria-hidden={!isFront}
            >
              <BankCardFace
                label={card.label}
                amount={card.amount}
                sub={card.sub}
                tint={card.tint}
                icon={card.icon}
                className={isFront ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}
              />
            </motion.div>
          );
        })}
      </div>

      <div className="intro-stack-controls">
        <button type="button" onClick={prev} className="intro-stack-btn" aria-label="Previous card">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="intro-stack-dots" role="tablist" aria-label="Cards">
          {CARDS.map((card, i) => (
            <button
              key={card.key}
              type="button"
              role="tab"
              aria-selected={i === front}
              aria-label={card.label}
              onClick={() => setFront(i)}
              className={i === front ? "is-on" : undefined}
            />
          ))}
        </div>
        <button type="button" onClick={next} className="intro-stack-btn" aria-label="Next card">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <p className="intro-stack-hint">Flick the front card, or tap one behind it.</p>
    </div>
  );
}
