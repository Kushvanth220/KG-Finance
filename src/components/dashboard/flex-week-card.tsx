"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ChevronLeft, ChevronRight, Truck } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { useRulesStore } from "@/store/rules-store";
import { findFlexRule } from "@/lib/flex";
import { resolveEntry } from "@/lib/rules/engine";
import { formatCurrency } from "@/lib/formatters";
import { zonedToday } from "@/lib/zoned-date";

/**
 * Kushvanth's Flex week on Home: a bar per day from the blocks entered on the
 * Flex page, with the week's hours and pay per hour.
 *
 * It reads only what was typed in. Deposits are not tracked anywhere: Flex
 * income goes in by hand on the Accounts page. Flex is Kushvanth's, so the
 * dashboard only offers this card on his tab.
 */

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function mondayOf(isoDay: string): Date {
  const d = new Date(`${isoDay}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export function FlexWeekCard() {
  const still = useReducedMotion();
  const rules = useRulesStore((state) => state.rules);
  const entries = useRulesStore((state) => state.entries);
  const [weeksBack, setWeeksBack] = useState(0);

  const week = useMemo(() => {
    const rule = findFlexRule(rules);
    if (!rule) return null;
    const monday = mondayOf(zonedToday());
    monday.setDate(monday.getDate() - weeksBack * 7);
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return { date: iso(d), label: DAYS[i]!, total: 0, hours: 0, blocks: 0 };
    });
    const index = new Map(days.map((d, i) => [d.date, i]));
    for (const entry of entries) {
      if (entry.ruleId !== rule.id) continue;
      const i = index.get(entry.date);
      if (i === undefined) continue;
      const values = resolveEntry(rule, entry);
      const base = Number(values.base_pay) || 0;
      const tips = Number(values.tips) || 0;
      const total = Number(values.total);
      const hours = Number(values.hours);
      days[i]!.total += Number.isFinite(total) && total > 0 ? total : base + tips;
      days[i]!.hours += Number.isFinite(hours) && hours > 0 ? hours : 0;
      days[i]!.blocks += 1;
    }
    const total = days.reduce((s, d) => s + d.total, 0);
    const hours = days.reduce((s, d) => s + d.hours, 0);
    const blocks = days.reduce((s, d) => s + d.blocks, 0);
    const end = new Date(monday);
    end.setDate(monday.getDate() + 6);
    const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return { days, total, hours, blocks, label: weeksBack === 0 ? "This week" : `${fmt(monday)} – ${fmt(end)}` };
  }, [rules, entries, weeksBack]);

  if (!week) return null;
  const max = Math.max(...week.days.map((d) => d.total), 1);
  const today = zonedToday();

  return (
    <GlassCard strong className="!p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-semibold">
            <Truck className="h-3.5 w-3.5 text-feature" /> Flex
            <span className="truncate font-normal text-muted">· {week.label}</span>
          </p>
          <p className="mt-0.5 text-xl font-bold tabular-nums kg-figure">{formatCurrency(week.total)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button type="button" onClick={() => setWeeksBack((n) => n + 1)} aria-label="Week before" className="hit rounded-md p-1 hover:bg-black/5 dark:hover:bg-white/10">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setWeeksBack((n) => Math.max(0, n - 1))}
            disabled={weeksBack === 0}
            aria-label="Week after"
            className="hit rounded-md p-1 hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/10"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-2 grid h-36 grid-cols-7 items-end gap-2" key={weeksBack}>
        {week.days.map((day, i) => {
          const h = day.total > 0 ? Math.max(6, (day.total / max) * 100) : 3;
          return (
            <div key={day.date} className="flex h-full flex-col items-center justify-end gap-1">
              {day.total > 0 ? (
                <motion.span
                  className="text-[9.5px] font-semibold tabular-nums"
                  initial={still ? false : { opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: still ? 0 : 0.4 + i * 0.09 }}
                >
                  ${Math.round(day.total)}
                </motion.span>
              ) : null}
              <motion.span
                className="w-full rounded-lg"
                style={{
                  height: `${h}%`,
                  originY: 1,
                  background: day.total > 0 ? "var(--feature)" : "var(--glass-border)",
                }}
                initial={still ? false : { scaleY: 0 }}
                animate={{ scaleY: 1 }}
                transition={{ type: "spring", stiffness: 160, damping: 18, delay: still ? 0 : i * 0.09 }}
                title={day.blocks ? `${day.blocks} block${day.blocks > 1 ? "s" : ""} · ${day.hours.toFixed(1)} h` : "No blocks"}
              />
              <span className={`text-[10px] ${day.date === today ? "font-bold text-accent" : "text-muted"}`}>{day.label}</span>
            </div>
          );
        })}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 border-t border-black/5 pt-2 text-[11px] dark:border-white/10">
        <span className="text-muted tabular-nums">
          {week.blocks} block{week.blocks === 1 ? "" : "s"} · {week.hours.toFixed(1)} hours
        </span>
        <span className="font-semibold tabular-nums">
          {week.hours > 0 ? `${formatCurrency(week.total / week.hours)} / hour` : "—"}
        </span>
      </div>
      <Link href="/flex" className="mt-1.5 block text-[10.5px] font-medium text-accent">
        Open Flex
      </Link>
    </GlassCard>
  );
}
