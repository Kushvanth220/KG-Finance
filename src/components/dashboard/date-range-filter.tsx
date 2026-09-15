"use client";

import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
} from "date-fns";
import { CalendarRange } from "lucide-react";
import { parseAppDateTime } from "@/lib/formatters";
import { cn } from "@/lib/utils";

/**
 * The one date filter the home page runs on: a few presets, or any From/To.
 *
 * Every panel below reads the same range, so "this month" means the same
 * thing on the dial, the income donut and the spending bars — and the
 * comparison is always the equal stretch of days just before it.
 */

export type RangePreset = "month" | "lastMonth" | "week" | "custom";

export interface RangeChoice {
  preset: RangePreset;
  /** yyyy-MM-dd, used when preset is "custom". */
  from: string;
  to: string;
}

export interface DateRange {
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
  /** "September 2026" or "09/01/2026 – 09/14/2026". */
  label: string;
  /** "Sep 2026" — short enough for a card header. */
  short: string;
  /** "Aug" or "the 14 days before" — what the delta compares against. */
  prevLabel: string;
  /** Whether the range lies within one calendar month. */
  singleMonth: boolean;
}

const PRESETS: { id: RangePreset; label: string }[] = [
  { id: "month", label: "This month" },
  { id: "lastMonth", label: "Last month" },
  { id: "week", label: "This week" },
  { id: "custom", label: "Custom" },
];

const iso = (d: Date) => format(d, "yyyy-MM-dd");

export function defaultRangeChoice(now: Date = new Date()): RangeChoice {
  return { preset: "month", from: iso(startOfMonth(now)), to: iso(now) };
}

export function resolveRange(choice: RangeChoice, now: Date = new Date()): DateRange {
  let start: Date;
  let end: Date;
  if (choice.preset === "month") {
    start = startOfMonth(now);
    end = endOfMonth(now);
  } else if (choice.preset === "lastMonth") {
    const last = subMonths(now, 1);
    start = startOfMonth(last);
    end = endOfMonth(last);
  } else if (choice.preset === "week") {
    start = startOfWeek(now, { weekStartsOn: 1 });
    end = endOfWeek(now, { weekStartsOn: 1 });
  } else {
    const from = choice.from ? parseAppDateTime(choice.from) : startOfMonth(now);
    const to = choice.to ? parseAppDateTime(choice.to) : now;
    start = startOfDay(from <= to ? from : to);
    end = endOfDay(from <= to ? to : from);
  }

  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
  const monthPreset = choice.preset === "month" || choice.preset === "lastMonth";
  const prevStart = monthPreset ? startOfMonth(subMonths(start, 1)) : startOfDay(subDays(start, days));
  const prevEnd = monthPreset ? endOfMonth(subMonths(start, 1)) : endOfDay(subDays(start, 1));
  const singleMonth = isSameMonth(start, end);

  const label = monthPreset
    ? format(start, "MMMM yyyy")
    : choice.preset === "week"
      ? `This week · ${format(start, "MM/dd")} – ${format(end, "MM/dd")}`
      : `${format(start, "MM/dd/yyyy")} – ${format(end, "MM/dd/yyyy")}`;
  const short = monthPreset
    ? format(start, "MMM yyyy")
    : choice.preset === "week"
      ? "This week"
      : `${format(start, "MM/dd")} – ${format(end, "MM/dd")}`;
  const prevLabel = monthPreset
    ? format(prevStart, "MMM")
    : choice.preset === "week"
      ? "last week"
      : `the ${days} days before`;

  return { start, end, prevStart, prevEnd, label, short, prevLabel, singleMonth };
}

export function DateRangeFilter({
  value,
  onChange,
  accent = "#007aff",
}: {
  value: RangeChoice;
  onChange: (next: RangeChoice) => void;
  accent?: string;
}) {
  const range = resolveRange(value);
  const today = iso(new Date());

  return (
    <div className="glass rounded-xl px-2 py-1.5">
      <div className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <CalendarRange className="ml-0.5 h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
        {PRESETS.map((preset) => {
          const active = value.preset === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onChange({ ...value, preset: preset.id })}
              aria-pressed={active}
              className={cn(
                "hit shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors",
                active ? "text-white shadow-sm" : "text-muted hover:bg-black/5 dark:hover:bg-white/10"
              )}
              style={active ? { background: accent } : undefined}
            >
              {preset.label}
            </button>
          );
        })}
        {value.preset !== "custom" ? (
          <span className="ml-auto shrink-0 pr-1 text-[10px] text-muted tabular-nums">
            {format(range.start, "MM/dd")} – {format(range.end, "MM/dd/yyyy")}
          </span>
        ) : null}
      </div>

      {value.preset === "custom" ? (
        <div className="mt-1.5 grid grid-cols-2 gap-2 px-0.5 pb-0.5">
          <label className="flex flex-col gap-0.5 text-[10px] font-medium text-muted">
            From
            <input
              type="date"
              value={value.from}
              max={value.to || today}
              onChange={(e) => e.target.value && onChange({ ...value, from: e.target.value })}
              className="glass rounded-lg px-2 py-1 text-[12px] text-foreground outline-none focus:ring-2 focus:ring-[#007aff]/40"
            />
          </label>
          <label className="flex flex-col gap-0.5 text-[10px] font-medium text-muted">
            To
            <input
              type="date"
              value={value.to}
              min={value.from || undefined}
              max={today}
              onChange={(e) => e.target.value && onChange({ ...value, to: e.target.value })}
              className="glass rounded-lg px-2 py-1 text-[12px] text-foreground outline-none focus:ring-2 focus:ring-[#007aff]/40"
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}
