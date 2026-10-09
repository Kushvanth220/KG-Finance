"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * The feature list as a rail: one column of names that fill in as you pass
 * them, one panel that swaps to match.
 *
 * The filled bullet is not decoration — it is the only indication of where
 * you are in a list taller than the screen, which is the job a scrollbar
 * does badly on a phone. An IntersectionObserver drives it rather than a
 * scroll handler, so the work happens when something actually crosses the
 * line instead of on every frame.
 */

export interface RailItem {
  key: string;
  kicker: string;
  title: string;
  body: string;
  tint: string;
  art: ReactNode;
}

export function FeatureRail({ items }: { items: RailItem[] }) {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLElement | null)[]>([]);
  const still = useReducedMotion();

  useEffect(() => {
    const nodes = refs.current.filter(Boolean) as HTMLElement[];
    if (nodes.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // The one nearest the middle of the screen wins, so passing quickly
        // never leaves two half-lit or none lit at all.
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const index = nodes.indexOf(visible.target as HTMLElement);
        if (index >= 0) setActive(index);
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: [0, 0.5, 1] }
    );

    for (const node of nodes) observer.observe(node);
    return () => observer.disconnect();
  }, [items.length]);

  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8">
      {/* The rail: sticky on a wide screen, inline on a phone. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:gap-14">
        <nav aria-label="Features" className="hidden lg:block">
          <ol className="sticky top-[38vh] space-y-5">
            {items.map((item, i) => {
              const on = i === active;
              return (
                <li key={item.key} className="flex items-center gap-3">
                  <span
                    className={cn(
                      "h-2.5 w-2.5 shrink-0 rounded-full border transition-all duration-500",
                      on ? "scale-125 border-transparent" : "border-white/45 bg-transparent"
                    )}
                    style={on ? { background: item.tint } : undefined}
                  />
                  <span
                    className={cn(
                      "text-[15px] transition-all duration-500",
                      on ? "font-semibold text-white" : "text-white/45"
                    )}
                  >
                    {item.kicker}
                  </span>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="space-y-[16vh] lg:space-y-[26vh]">
          {items.map((item, i) => (
            <motion.section
              key={item.key}
              ref={(node: HTMLElement | null) => {
                refs.current[i] = node;
              }}
              initial={still ? false : { opacity: 0, y: 28 }}
              whileInView={still ? undefined : { opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-15%" }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="grid items-center gap-6 sm:grid-cols-2 sm:gap-10"
            >
              <div className="order-2 sm:order-1">
                <p
                  className="text-[11px] font-semibold uppercase tracking-[0.18em]"
                  style={{ color: item.tint }}
                >
                  {item.kicker}
                </p>
                <h3 className="mt-3 text-balance text-[clamp(1.6rem,4.6vw,2.6rem)] font-semibold leading-[1.05] tracking-[-0.025em] text-white">
                  {item.title}
                </h3>
                <p className="mt-4 max-w-md text-[15px] leading-relaxed text-white/60">{item.body}</p>
              </div>
              <div className="order-1 sm:order-2">
                <div className="overflow-hidden rounded-[22px] border border-white/10 bg-white/[0.04] p-3 backdrop-blur-sm">
                  {item.art}
                </div>
              </div>
            </motion.section>
          ))}
        </div>
      </div>
    </div>
  );
}
