"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight, ScrollText, SlidersHorizontal } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { FlexChart, type FlexChartType } from "@/components/charts/flex-chart";
import { startRulesLiveSync, useRulesStore } from "@/store/rules-store";
import { isFlexRule } from "@/lib/flex";
import { defaultAggregates, runAggregate } from "@/lib/rules/engine";
import type { Rule, RuleAggregate } from "@/lib/rules/types";
import { formatCurrency } from "@/lib/formatters";
import type { Person } from "@/types";
import { cn } from "@/lib/utils";

/**
 * Rule summaries on the home page.
 *
 * Nothing here knows what a Flex block is. Every rule stores the same shape —
 * dated entries carrying numeric fields — so one aggregation layer serves all
 * of them, and what appears is a set of summaries the person switched on rather
 * than a chart hard-wired per rule.
 */

/** Rules written before summaries existed still get sensible ones. */
function aggregatesFor(rule: Rule): RuleAggregate[] {
  if (rule.aggregates && rule.aggregates.length > 0) return rule.aggregates;
  // Deterministic, so the id a toggle acts on is the id that was rendered.
  return defaultAggregates(rule, (slug) => `${rule.id}:${slug}`);
}

export function RuleDashboards({ person }: { person: Person | "overall" }) {
  const rules = useRulesStore((state) => state.rules);
  const entries = useRulesStore((state) => state.entries);
  const updateRule = useRulesStore((state) => state.updateRule);
  const [tuning, setTuning] = useState<string | null>(null);

  // The dashboard is usually the first screen opened, so it is the first
  // chance to notice the local copy is missing something.
  useEffect(() => startRulesLiveSync(), []);

  const shown = useMemo(
    () =>
      rules.filter((rule) => {
        if (!rule.showOnDashboard || !rule.enabled) return false;
        // Flex has a page of its own; a second copy here says nothing new.
        if (isFlexRule(rule)) return false;
        if (person === "overall") return true;
        return rule.scope === person || rule.scope === "shared";
      }),
    [rules, person]
  );

  if (shown.length === 0) return null;

  return (
    <>
      {shown.map((rule) => {
        const all = aggregatesFor(rule);
        const active = all.filter((item) => item.enabled);
        const ruleEntries = entries.filter((entry) => entry.ruleId === rule.id);
        const isTuning = tuning === rule.id;

        const toggle = (id: string) => {
          const next = all.map((item) =>
            item.id === id ? { ...item, enabled: !item.enabled } : item
          );
          updateRule(rule.id, { aggregates: next });
        };

        return (
          <GlassCard key={rule.id} className="!p-0 overflow-hidden">
            <div className="flex items-start justify-between gap-3 px-4 pt-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-accent">
                  <ScrollText className="h-3 w-3" /> {rule.name}
                </p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {ruleEntries.length} {ruleEntries.length === 1 ? "entry" : "entries"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setTuning(isTuning ? null : rule.id)}
                  aria-label={`Choose what ${rule.name} shows`}
                  className={cn(
                    "rounded-lg p-1.5 transition-colors",
                    isTuning ? "glass-pill" : "text-muted hover:text-foreground"
                  )}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                </button>
                <Link
                  href="/rules"
                  className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-accent"
                >
                  Open <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
            </div>

            {isTuning ? (
              <div className="mx-4 mt-2 rounded-xl border border-black/5 p-2.5 dark:border-white/10">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Show on the dashboard
                </p>
                {all.length === 0 ? (
                  <p className="mt-1.5 text-[11px] text-muted">
                    This rule records nothing numeric yet, so there is nothing to total.
                  </p>
                ) : (
                  <div className="mt-2 space-y-1">
                    {all.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => toggle(item.id)}
                        className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                      >
                        <span
                          className={cn(
                            "flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold",
                            item.enabled
                              ? "border-positive bg-positive text-white"
                              : "border-black/20 dark:border-white/25"
                          )}
                        >
                          {item.enabled ? "✓" : ""}
                        </span>
                        <span className="text-[12px]">{item.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {active.length === 0 && !isTuning ? (
              <p className="px-4 py-4 text-center text-[11px] text-muted">
                Nothing switched on. Use the sliders to pick what this shows.
              </p>
            ) : null}

            {active.map((item) => {
              const result = runAggregate(rule, ruleEntries, item);
              const headline = result.money
                ? formatCurrency(result.total)
                : result.total.toLocaleString();

              return (
                <div
                  key={item.id}
                  className="mt-2 border-t border-black/5 pt-3 dark:border-white/10"
                >
                  <div className="flex items-baseline justify-between gap-3 px-4">
                    <p className="text-[11px] font-medium text-muted">{item.label}</p>
                    <p className="text-lg font-semibold tabular-nums">{headline}</p>
                  </div>
                  {/* A single all-time figure is a number, not a one-bar chart. */}
                  {item.period !== "all" && result.points.length > 0 ? (
                    <div className="px-2 pb-2">
                      <FlexChart
                        type={item.chart as FlexChartType}
                        data={result.points.map((point) => ({
                          label: point.label,
                          value: point.value,
                        }))}
                        money={result.money}
                        height={160}
                        emptyMessage="Nothing recorded yet."
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}

            <div className="h-3" />
          </GlassCard>
        );
      })}
    </>
  );
}
