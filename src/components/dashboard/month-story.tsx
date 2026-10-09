"use client";

import { format, isWithinInterval, startOfDay } from "date-fns";
import { ArcGauge } from "@/components/art/page-art";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";

/**
 * The period as one sentence and one ring.
 *
 * The ring's colour is the verdict — green while under 80% of what came in,
 * amber up to the line, red past it — so the story reads before the numbers
 * do. Underneath, the pace: what a day costs so far and where that lands by
 * the last day, for a range that is still running.
 */

/**
 * Work earned in the period whose money has not arrived yet — Flex blocks
 * driven but not deposited. It is income, just not banked, so leaving it out
 * made the verdict read "spent far more than you earned" on a month that was
 * only waiting on a payout. The ring still judges what is actually in, but
 * the sentence says when a pending amount would change the answer.
 */
export function storyFor(
  income: number,
  spend: number,
  pending = 0
): { pct: number | null; color: string; headline: string; sub: string; note: string | null } {
  const base = baseStory(income, spend);
  if (pending <= 0) return { ...base, note: null };

  const withPending = income + pending;
  const note =
    spend > income && spend <= withPending
      ? `${formatCurrency(pending)} earned and not deposited yet — counting it, you are ${formatCurrency(withPending - spend)} up`
      : `${formatCurrency(pending)} earned and not deposited yet`;
  return { ...base, note };
}

function baseStory(income: number, spend: number): { pct: number | null; color: string; headline: string; sub: string } {
  if (income <= 0) {
    return {
      pct: null,
      color: "var(--neutral)",
      headline: `${formatCurrency(spend)} spent`,
      sub: "No income recorded in this period",
    };
  }
  const pct = Math.round((spend / income) * 100);
  const color = pct < 80 ? "var(--success)" : pct <= 100 ? "var(--warning)" : "var(--danger)";
  if (spend > income) {
    return {
      pct,
      color,
      headline: `Spent ${formatCurrency(spend - income)} more than you earned`,
      sub: `${formatCurrency(spend)} out of ${formatCurrency(income)} in`,
    };
  }
  return {
    pct,
    color,
    headline: `Kept ${formatCurrency(income - spend)} of ${formatCurrency(income)}`,
    sub: `${formatCurrency(spend)} spent · ${pct}% of what came in`,
  };
}

const DAY_MS = 86_400_000;

function daysInclusive(start: Date, end: Date): number {
  return Math.max(1, Math.round((startOfDay(end).getTime() - startOfDay(start).getTime()) / DAY_MS) + 1);
}

/**
 * "$126/day · on track for $3,800 by Sep 30" while the range is still
 * running; the plain daily average once it is over.
 */
export function paceFor(spend: number, start: Date, end: Date, now: Date = new Date()): string | null {
  if (spend <= 0) return null;
  const total = daysInclusive(start, end);
  const live = isWithinInterval(now, { start: startOfDay(start), end });
  const elapsed = live ? daysInclusive(start, now) : total;
  const perDay = spend / elapsed;
  if (!live) return `${formatCurrency(Math.round(perDay))}/day over ${total} ${total === 1 ? "day" : "days"}`;
  if (elapsed >= total) return `${formatCurrency(Math.round(perDay))}/day`;
  return `${formatCurrency(Math.round(perDay))}/day · on track for ${formatCurrency(Math.round(perDay * total))} by ${format(end, "MMM d")}`;
}

export function PeriodStory({
  income,
  spend,
  pending = 0,
  start,
  end,
  label,
  className,
}: {
  income: number;
  spend: number;
  /** Earned in this period but not yet deposited. */
  pending?: number;
  start: Date;
  end: Date;
  label: string;
  className?: string;
}) {
  if (income <= 0 && spend <= 0) return null;
  const story = storyFor(income, spend, pending);
  const pace = paceFor(spend, start, end);

  return (
    <div className={cn("glass flex items-center gap-3 rounded-xl px-3 py-2.5", className)}>
      <ArcGauge
        value={spend}
        max={Math.max(income, spend)}
        color={story.color}
        size={60}
        label={story.pct === null ? "—" : `${Math.min(999, story.pct)}%`}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
        <p className="text-[13px] font-semibold leading-snug" style={{ color: story.color }}>
          {story.headline}
        </p>
        <p className="text-[11px] text-muted tabular-nums">{story.sub}</p>
        {story.note ? (
          <p className="mt-0.5 text-[10.5px] font-medium text-caution tabular-nums">{story.note}</p>
        ) : null}
        {pace ? <p className="mt-0.5 text-[10px] text-muted tabular-nums">{pace}</p> : null}
      </div>
    </div>
  );
}
