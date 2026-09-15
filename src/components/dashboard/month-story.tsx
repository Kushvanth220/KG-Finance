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

export function storyFor(income: number, spend: number): { pct: number | null; color: string; headline: string; sub: string } {
  if (income <= 0) {
    return {
      pct: null,
      color: "#8e8e93",
      headline: `${formatCurrency(spend)} spent`,
      sub: "No income recorded in this period",
    };
  }
  const pct = Math.round((spend / income) * 100);
  const color = pct < 80 ? "#34c759" : pct <= 100 ? "#ff9500" : "#ff3b30";
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
  start,
  end,
  label,
  className,
}: {
  income: number;
  spend: number;
  start: Date;
  end: Date;
  label: string;
  className?: string;
}) {
  if (income <= 0 && spend <= 0) return null;
  const story = storyFor(income, spend);
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
        {pace ? <p className="mt-0.5 text-[10px] text-muted tabular-nums">{pace}</p> : null}
      </div>
    </div>
  );
}
