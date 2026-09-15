"use client";

import { useSyncExternalStore } from "react";
import { CHART_TYPE_OPTIONS, type FlexChartType } from "@/components/charts/flex-chart";
import { cn } from "@/lib/utils";

/**
 * Choosing how a dashboard panel is drawn.
 *
 * The rule cards already let their shape be picked; income and spending are the
 * two panels looked at most, so they get the same control. The choice is a
 * viewing preference, so it lives in this browser rather than in the workspace
 * record — each phone can look at the same money differently.
 */

const STORAGE_PREFIX = "kg-chart-type:";

function readType(key: string, fallback: FlexChartType): FlexChartType {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(STORAGE_PREFIX + key);
    return CHART_TYPE_OPTIONS.some((option) => option.value === stored)
      ? (stored as FlexChartType)
      : fallback;
  } catch {
    // Private windows and blocked site data both throw here.
    return fallback;
  }
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function writeType(key: string, value: FlexChartType) {
  try {
    window.localStorage.setItem(STORAGE_PREFIX + key, value);
  } catch {
    // Not being able to remember the choice is not a reason to refuse it.
  }
  listeners.forEach((listener) => listener());
}

/**
 * The stored chart shape for one panel.
 *
 * `useSyncExternalStore` rather than useState so the server render and the
 * first client render agree — reading localStorage during render would differ
 * between them and trip a hydration mismatch.
 */
export function useChartType(key: string, fallback: FlexChartType) {
  const value = useSyncExternalStore(
    subscribe,
    () => readType(key, fallback),
    () => fallback
  );
  return [value, (next: FlexChartType) => writeType(key, next)] as const;
}

export function ChartTypePicker({
  value,
  onChange,
  tint = "#007aff",
}: {
  value: FlexChartType;
  onChange: (next: FlexChartType) => void;
  tint?: string;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-0.5" role="group" aria-label="Chart shape">
      {CHART_TYPE_OPTIONS.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={cn(
              "shrink-0 rounded-lg px-2 py-1 text-[10px] font-semibold transition-colors",
              active ? "text-white" : "glass text-muted hover:text-foreground"
            )}
            style={active ? { background: tint } : undefined}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
