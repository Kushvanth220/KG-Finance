"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { FreshPresence } from "@/components/ui/fresh-presence";

/**
 * Home's swipe deck: one card in front, the next ones peeking out behind it.
 *
 * Swipe the front card sideways and it flies off; the one behind steps up into
 * its place. The tabs under the deck name every card, so nothing is hidden
 * behind a gesture — tap one to go straight to it. Arrow keys work too.
 *
 * The deck is as tall as the card in front; the leaving card is lifted out of
 * the flow while it flies, so the two never stack up in height.
 */

export interface DeckCard {
  id: string;
  label: string;
  node: ReactNode;
}

const SWIPE_DISTANCE = 70;
const SWIPE_SPEED = 450;

function EditButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Edit the cards"
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-semibold text-accent hover:bg-black/5 dark:hover:bg-white/10"
    >
      <Pencil className="h-3 w-3" aria-hidden /> Edit
    </button>
  );
}

export function HomeDeck({
  cards,
  onEdit,
}: {
  cards: DeckCard[];
  /** Opens the layout editor; an Edit button sits above the deck. */
  onEdit?: () => void;
}) {
  const still = useReducedMotion();
  const [state, setState] = useState({ index: 0, dir: 1 });

  const count = cards.length;
  // A card can drop out (Flex on G's tab): stay in range without an effect.
  const index = count ? Math.min(state.index, count - 1) : 0;
  const card = cards[index];

  const go = (next: number, dir: number) => {
    if (!count) return;
    setState({ index: (next + count) % count, dir });
  };

  // Every card switched off: say so, and keep the way back.
  if (!card) {
    return onEdit ? (
      <div className="glass flex items-center justify-between gap-2 rounded-xl px-3 py-2.5">
        <span className="text-xs text-muted">Every card is hidden.</span>
        <EditButton onClick={onEdit} />
      </div>
    ) : null;
  }

  return (
    <div
      className="outline-none"
      tabIndex={0}
      role="region"
      aria-roledescription="carousel"
      aria-label="Home cards"
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "ArrowRight") go(index + 1, 1);
        if (event.key === "ArrowLeft") go(index - 1, -1);
      }}
    >
      {/* Above the deck, clear of the floating buttons that cover the bottom of the screen. */}
      {onEdit ? (
        <div className="mb-2 flex items-center justify-between px-1">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Your cards</p>
          <EditButton onClick={onEdit} />
        </div>
      ) : null}
      <div className="relative">
        {/* The cards waiting behind: only their bottom edges peek out, like a stack. */}
        {count > 2 ? (
          <div aria-hidden className="glass pointer-events-none absolute inset-x-6 -bottom-[13px] h-5 rounded-b-[var(--card-radius)] opacity-45" />
        ) : null}
        {count > 1 ? (
          <div aria-hidden className="glass pointer-events-none absolute inset-x-3 -bottom-[7px] h-5 rounded-b-[var(--card-radius)] opacity-75" />
        ) : null}

        {/* popLayout lifts the leaving card out of the flow, so the arriving one sets the height. */}
        <AnimatePresence initial={false} custom={state.dir} mode="popLayout">
          <motion.div
            key={card.id}
            custom={state.dir}
            className="relative z-10 touch-pan-y"
            variants={{
              enter: (dir: number) => (still ? { opacity: 0 } : { x: dir > 0 ? 36 : -36, scale: 0.95, opacity: 0, y: 8 }),
              center: { x: 0, scale: 1, opacity: 1, y: 0, rotate: 0 },
              exit: (dir: number) =>
                still ? { opacity: 0 } : { x: dir > 0 ? "-115%" : "115%", rotate: dir > 0 ? -7 : 7, opacity: 0 },
            }}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 260, damping: 28, opacity: { duration: 0.25 } }}
            drag={count > 1 && !still ? "x" : false}
            dragSnapToOrigin
            dragElastic={0.55}
            dragMomentum={false}
            whileDrag={{ rotate: 0, scale: 0.985 }}
            onDragEnd={(_, info) => {
              if (info.offset.x < -SWIPE_DISTANCE || info.velocity.x < -SWIPE_SPEED) go(index + 1, 1);
              else if (info.offset.x > SWIPE_DISTANCE || info.velocity.x > SWIPE_SPEED) go(index - 1, -1);
            }}
          >
            {/* The first card arrives without the deck's entrance; what is on it still animates in. */}
            <FreshPresence>{card.node}</FreshPresence>
          </motion.div>
        </AnimatePresence>
      </div>

      {count > 1 ? (
        <div className="mt-5 flex items-center gap-1">
          <div
            className="flex min-w-0 flex-1 gap-1 overflow-x-auto px-0.5 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            role="tablist"
            aria-label="Choose a card"
          >
            {cards.map((item, i) => {
              const active = i === index;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => go(i, i >= index ? 1 : -1)}
                  className={cn(
                    "relative shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-semibold transition-colors",
                    active ? "text-white" : "text-muted hover:text-foreground"
                  )}
                >
                  {active ? (
                    <motion.span
                      layoutId="home-deck-tab"
                      className="absolute inset-0 rounded-full bg-accent"
                      transition={still ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 32 }}
                    />
                  ) : null}
                  <span className="relative">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
