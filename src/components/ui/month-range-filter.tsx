"use client";

import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getMonthKey, parseMonthKey } from "@/lib/calculations";
import { cn } from "@/lib/utils";

export type MonthRangeMode = "all" | "this-month" | "last-month" | "pick-month" | "custom";

export type MonthRangeValue = {
  mode: MonthRangeMode;
  monthKey: string;
  customStart: string;
  customEnd: string;
};

export function getMonthRangeBounds(value: MonthRangeValue): {
  start?: string;
  end?: string;
  label: string;
} {
  const now = new Date();

  if (value.mode === "all") {
    return { label: "All time" };
  }

  if (value.mode === "this-month") {
    const start = startOfMonth(now);
    const end = endOfMonth(now);
    return {
      start: format(start, "yyyy-MM-dd"),
      end: format(end, "yyyy-MM-dd"),
      label: format(now, "MMMM yyyy"),
    };
  }

  if (value.mode === "last-month") {
    const last = subMonths(now, 1);
    return {
      start: format(startOfMonth(last), "yyyy-MM-dd"),
      end: format(endOfMonth(last), "yyyy-MM-dd"),
      label: format(last, "MMMM yyyy"),
    };
  }

  if (value.mode === "pick-month") {
    const date = parseMonthKey(value.monthKey);
    return {
      start: format(startOfMonth(date), "yyyy-MM-dd"),
      end: format(endOfMonth(date), "yyyy-MM-dd"),
      label: format(date, "MMMM yyyy"),
    };
  }

  const start = value.customStart || undefined;
  const end = value.customEnd || undefined;
  if (start && end) {
    return { start, end, label: `${start} → ${end}` };
  }
  if (start) {
    return { start, label: `From ${start}` };
  }
  if (end) {
    return { end, label: `Until ${end}` };
  }
  return { label: "Custom range" };
}

const MODES: { id: MonthRangeMode; label: string }[] = [
  { id: "all", label: "All" },
  { id: "this-month", label: "This mo" },
  { id: "last-month", label: "Last mo" },
  { id: "pick-month", label: "Month" },
  { id: "custom", label: "Custom" },
];

type MonthRangeFilterProps = {
  value: MonthRangeValue;
  onChange: (value: MonthRangeValue) => void;
  monthOptions: string[];
};

export function MonthRangeFilter({ value, onChange, monthOptions }: MonthRangeFilterProps) {
  const monthIndex = monthOptions.indexOf(value.monthKey);
  const bounds = getMonthRangeBounds(value);

  const shiftMonth = (delta: number) => {
    const next = monthIndex + delta;
    if (next < 0 || next >= monthOptions.length) return;
    onChange({
      ...value,
      mode: "pick-month",
      monthKey: monthOptions[next]!,
    });
  };

  return (
    <div className="glass rounded-xl p-2 space-y-2">
      <div className="flex flex-wrap gap-1">
        {MODES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange({ ...value, mode: id })}
            className={cn(
              "px-2 py-1 rounded-lg text-[10px] font-medium transition-colors",
              value.mode === id
                ? "bg-[#007aff] text-white"
                : "bg-black/5 dark:bg-white/5 text-muted hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {value.mode === "pick-month" && (
        <div className="flex items-center justify-between gap-1">
          <button
            type="button"
            onClick={() => shiftMonth(1)}
            disabled={monthIndex >= monthOptions.length - 1}
            className="p-1 rounded-lg disabled:opacity-30"
            aria-label="Older month"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <select
            value={value.monthKey}
            onChange={(e) =>
              onChange({ ...value, mode: "pick-month", monthKey: e.target.value })
            }
            className="bg-transparent text-center font-semibold outline-none cursor-pointer text-xs flex-1"
          >
            {monthOptions.map((key) => (
              <option key={key} value={key}>
                {format(parseMonthKey(key), "MMM yyyy")}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => shiftMonth(-1)}
            disabled={monthIndex <= 0}
            className="p-1 rounded-lg disabled:opacity-30"
            aria-label="Newer month"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {value.mode === "custom" && (
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted px-0.5">From</span>
            <input
              type="date"
              value={value.customStart}
              onChange={(e) => onChange({ ...value, customStart: e.target.value })}
              className="glass rounded-lg px-2 py-1.5 text-xs outline-none w-full"
            />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted px-0.5">To</span>
            <input
              type="date"
              value={value.customEnd}
              min={value.customStart || undefined}
              onChange={(e) => onChange({ ...value, customEnd: e.target.value })}
              className="glass rounded-lg px-2 py-1.5 text-xs outline-none w-full"
            />
          </label>
        </div>
      )}

      {value.mode !== "all" && (
        <p className="text-[10px] text-muted px-0.5">Showing: {bounds.label}</p>
      )}
    </div>
  );
}

export function defaultMonthRangeValue(monthKey = getMonthKey()): MonthRangeValue {
  return {
    mode: "all",
    monthKey,
    customStart: "",
    customEnd: "",
  };
}
