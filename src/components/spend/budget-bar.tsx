"use client";

import { formatCurrency } from "@/lib/formatters";
import type { Transaction } from "@/types";
import { cn } from "@/lib/utils";

/**
 * A category against its monthly budget.
 *
 * Blue while there is room, orange from 80%, red once it is over — the three
 * states a person actually acts on. The number is always shown; the colour is
 * there so it is seen before it is read.
 */

/** Everything spent under a category this calendar month, whoever paid. */
export function categorySpentThisMonth(
  transactions: Transaction[],
  category: string,
  ref: Date = new Date()
): number {
  const key = `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}`;
  const wanted = category.trim().toLowerCase();
  return transactions
    .filter(
      (t) =>
        t.type === "expense" &&
        t.date.startsWith(key) &&
        (t.category ?? "").trim().toLowerCase() === wanted
    )
    .reduce((sum, t) => sum + t.amount, 0);
}

export function budgetTone(spent: number, budget: number): "ok" | "warn" | "over" {
  if (budget <= 0) return "ok";
  const share = spent / budget;
  if (share > 1) return "over";
  if (share >= 0.8) return "warn";
  return "ok";
}

const TONE = {
  ok: "#007aff",
  warn: "#ff9500",
  over: "#ff3b30",
} as const;

export function BudgetBar({
  spent,
  budget,
  compact = false,
  className,
}: {
  spent: number;
  budget: number;
  /** Bar only, no figures — for inside a small button. */
  compact?: boolean;
  className?: string;
}) {
  if (budget <= 0) return null;
  const tone = budgetTone(spent, budget);
  const share = Math.min(1, spent / budget);
  const left = budget - spent;

  return (
    <div className={cn("w-full", className)} aria-label={`${formatCurrency(spent)} of ${formatCurrency(budget)} budget`}>
      <div className="h-1 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${share * 100}%`, background: TONE[tone] }}
        />
      </div>
      {compact ? null : (
        <p className="mt-0.5 flex justify-between text-[10px] tabular-nums">
          <span className="text-muted">
            {formatCurrency(spent)} of {formatCurrency(budget)}
          </span>
          <span style={{ color: TONE[tone] }} className="font-semibold">
            {left >= 0 ? `${formatCurrency(left)} left` : `${formatCurrency(-left)} over`}
          </span>
        </p>
      )}
    </div>
  );
}
