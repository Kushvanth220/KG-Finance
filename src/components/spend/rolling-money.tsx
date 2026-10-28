"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";
import { formatAmount } from "@/lib/formatters";
import { cn } from "@/lib/utils";

/**
 * A balance that rolls from one figure to the next digit by digit, like a
 * counter, so the money is seen leaving the account rather than the number
 * just being different. Columns line up from the right, so cents roll under
 * cents and dollars under dollars.
 */
export function RollingMoney({
  from,
  to,
  delay = 450,
  className,
}: {
  from: number;
  to: number;
  /** When the roll starts, in ms: after the amount has dropped in. */
  delay?: number;
  className?: string;
}) {
  const still = useReducedMotion();
  const target = formatAmount(to);
  const start = formatAmount(from);
  const [rolled, setRolled] = useState(false);
  const settled = rolled || still || from === to;

  useEffect(() => {
    if (settled) return;
    const timer = window.setTimeout(() => setRolled(true), delay);
    return () => window.clearTimeout(timer);
  }, [settled, delay]);

  const chars = target.split("");
  // Every character, digit or not, sits in the same 1.2em box, so "$", "," and "."
  // line up with the rolling digits instead of floating on their own baseline.
  return (
    <span className={cn("inline-flex items-start leading-[1.2em] tabular-nums", className)} aria-label={target}>
      {chars.map((char, index) => {
        if (!/\d/.test(char)) {
          return (
            <span key={index} aria-hidden className="inline-block h-[1.2em] leading-[1.2em]">
              {char}
            </span>
          );
        }
        // The digit `from` had in the same place, counted from the right.
        const fromChar = start[start.length - (chars.length - index)];
        const shown = Number(settled ? char : /\d/.test(fromChar ?? "") ? fromChar : "0");
        return (
          <span key={index} aria-hidden className="inline-block h-[1.2em] overflow-hidden leading-[1.2em]">
            <span
              className="flex flex-col"
              style={{
                transform: `translateY(-${shown * 1.2}em)`,
                transition: still ? undefined : `transform 900ms cubic-bezier(0.16, 1, 0.3, 1) ${(chars.length - index) * 35}ms`,
              }}
            >
              {"0123456789".split("").map((digit) => (
                <span key={digit} className="h-[1.2em]">
                  {digit}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}
