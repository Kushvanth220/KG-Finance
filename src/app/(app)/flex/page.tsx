"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Clock, Pencil, Play, Plus, Square, Trash2, X } from "lucide-react";
import { CompactPageShell } from "@/components/ui/compact-page-shell";
import { GlassCard } from "@/components/ui/glass-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FlexDepositsCard } from "@/components/flex/flex-deposits-card";
import { useActiveBlock } from "@/hooks/use-active-block";
import { zonedClockNow } from "@/lib/zoned-date";
import { StackedChart, type StackedChartType } from "@/components/charts/stacked-chart";
import { RuleEntryEditor } from "@/components/rules/rule-entry-editor";
import { FlexMark } from "@/components/flex/flex-mark";
import type { EntryPreset } from "@/components/rules/rule-entry-editor";
import { Tilt3D } from "@/components/art/tilt-3d";
import { startRulesLiveSync, useRulesStore } from "@/store/rules-store";
import { resolveEntry } from "@/lib/rules/engine";
import { ensureFlexRule, FLEX_BLUE } from "@/lib/flex";
import { zonedToday } from "@/lib/zoned-date";
import type { RuleEntry } from "@/lib/rules/types";
import { formatClock, formatCurrency, formatDate, formatShortDate } from "@/lib/formatters";
import { roundMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Amazon Flex — the whole job on one screen.
 *
 * Base pay and tips are shown as parts of one number rather than as separate
 * facts, because that is what they are: the deposit is base plus tip, and a
 * block with its tip still pending is not yet finished money.
 */

type Period = "day" | "week" | "month" | "all";

const PERIODS: { value: Period; label: string }[] = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
  { value: "all", label: "All" },
];

const CHARTS: { value: StackedChartType; label: string }[] = [
  { value: "bar", label: "Bar" },
  { value: "line", label: "Line" },
  { value: "area", label: "Area" },
];

const BASE_COLOR = FLEX_BLUE;
const TIP_COLOR = "#34c759";

function dateKey(at: Date): string {
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(
    at.getDate()
  ).padStart(2, "0")}`;
}

/** Monday-based week key so a week reads as one bucket. */
function weekStart(date: string): string {
  const at = new Date(`${date}T00:00:00`);
  if (Number.isNaN(at.getTime())) return date;
  at.setDate(at.getDate() - ((at.getDay() + 6) % 7));
  return dateKey(at);
}

function shiftDays(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00`);
  if (Number.isNaN(at.getTime())) return date;
  at.setDate(at.getDate() + days);
  return dateKey(at);
}

function shiftMonths(month: string, months: number): string {
  const [year, index] = month.split("-").map(Number);
  const at = new Date(year, index - 1 + months, 1);
  return `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [year, index] = month.split("-").map(Number);
  return new Date(year, index - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function shortDate(date: string): string {
  return formatShortDate(date);
}

/**
 * The window being looked at. `offset` counts periods back from now, so -1 week
 * is last week — an empty Monday should not mean the week is unreachable.
 */
function windowFor(
  period: Period,
  offset: number
): { from: string; to: string; label: string } | null {
  if (period === "all") return null;
  const today = zonedToday();

  if (period === "day") {
    const date = shiftDays(today, offset);
    const label = offset === 0 ? "Today" : offset === -1 ? "Yesterday" : prettyDate(date);
    return { from: date, to: date, label };
  }

  if (period === "week") {
    const from = shiftDays(weekStart(today), offset * 7);
    const to = shiftDays(from, 6);
    const label =
      offset === 0
        ? "This week"
        : offset === -1
          ? "Last week"
          : `${shortDate(from)} – ${shortDate(to)}`;
    return { from, to, label };
  }

  const month = shiftMonths(today.slice(0, 7), offset);
  // Any real day in the month sorts at or below "-31", so the string compare holds.
  return { from: `${month}-01`, to: `${month}-31`, label: monthLabel(month) };
}

function prettyDate(date: string): string {
  const at = new Date(`${date}T00:00:00`);
  if (Number.isNaN(at.getTime())) return date;
  // The weekday earns its place in a day-grouped history; the date stays MM/DD/YYYY.
  return `${at.toLocaleDateString("en-US", { weekday: "short" })} ${formatDate(date)}`;
}

export default function FlexPage() {
  const rules = useRulesStore((state) => state.rules);
  const entries = useRulesStore((state) => state.entries);
  const addRule = useRulesStore((state) => state.addRule);
  const updateRule = useRulesStore((state) => state.updateRule);
  const openEntry = useRulesStore((state) => state.openEntry);
  const answerEntry = useRulesStore((state) => state.answerEntry);
  const deleteEntry = useRulesStore((state) => state.deleteEntry);
  const updateEntry = useRulesStore((state) => state.updateEntry);
  const timer = useActiveBlock();

  // Null until the window is chosen by hand; until then it is derived below.
  const [chosen, setChosen] = useState<{ period: Period; offset: number } | null>(null);
  const [chart, setChart] = useState<StackedChartType>("bar");
  const [logging, setLogging] = useState(false);
  const [answering, setAnswering] = useState<RuleEntry | null>(null);
  const [pendingDelete, setPendingDelete] = useState<RuleEntry | null>(null);
  const [editing, setEditing] = useState<RuleEntry | null>(null);
  // A block that has just been stopped: the editor opens with its times filled.
  const [finishing, setFinishing] = useState<{ date: string; start: string; finish: string } | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [showAllDays, setShowAllDays] = useState(false);

  // Pull now, keep pulling while this screen is open, and react the moment
  // the other phone saves — so a block logged there shows up here unasked.
  useEffect(() => startRulesLiveSync(), []);

  const flex = useMemo(() => ensureFlexRule(rules, addRule), [rules, addRule]);

  // The saved rule predates the repeatable flag. Blocks plainly repeat — three
  // in a day is normal — and the flag is what lets several be logged at once
  // and what tells the assistant to keep asking "any more?".
  useEffect(() => {
    if (flex && flex.repeatable !== true) updateRule(flex.id, { repeatable: true });
  }, [flex, updateRule]);

  const blocks = useMemo(() => {
    if (!flex) return [];
    return entries
      .filter((entry) => entry.ruleId === flex.id)
      .map((entry) => {
        const values = resolveEntry(flex, entry);
        return {
          entry,
          date: entry.date,
          start: String(values.start_time ?? ""),
          finish: String(values.finish_time ?? ""),
          base: Number(values.base_pay ?? 0),
          tip: values.tips === undefined || values.tips === "" ? null : Number(values.tips),
          hours: Number(values.hours ?? 0),
        };
      })
      .sort((a, b) =>
        a.date === b.date ? b.start.localeCompare(a.start) : b.date.localeCompare(a.date)
      );
  }, [entries, flex]);

  const due = useRulesStore((state) => state.dueNow)();
  const waitingOnTips = due.filter((item) => flex && item.rule.id === flex.id);

  // Until a window is picked, open on the tightest one that holds blocks.
  // Landing on "today" when the last block was Friday reads as a broken page.
  const suggested = useMemo<Period>(() => {
    if (blocks.length === 0) return "all";
    const today = zonedToday();
    const thisWeek = weekStart(today);
    if (blocks.some((b) => b.date === today)) return "day";
    if (blocks.some((b) => weekStart(b.date) === thisWeek)) return "week";
    if (blocks.some((b) => b.date.slice(0, 7) === today.slice(0, 7))) return "month";
    return "all";
  }, [blocks]);

  const period = chosen?.period ?? suggested;
  const offset = chosen?.offset ?? 0;

  const range = useMemo(() => windowFor(period, offset), [period, offset]);

  // Totals for the chosen window. "All" is every block ever.
  const inWindow = useMemo(() => {
    if (!range) return blocks;
    return blocks.filter((b) => b.date >= range.from && b.date <= range.to);
  }, [blocks, range]);

  // Paging back past the first block only shows empty screens, so it stops there.
  const hasEarlier = useMemo(
    () => (range ? blocks.some((b) => b.date < range.from) : false),
    [blocks, range]
  );

  const step = (by: number) => setChosen({ period, offset: offset + by });

  const stats = useMemo(() => {
    const base = roundMoney(inWindow.reduce((sum, b) => sum + b.base, 0));
    const tip = roundMoney(inWindow.reduce((sum, b) => sum + (b.tip ?? 0), 0));
    const hours = Number(inWindow.reduce((sum, b) => sum + b.hours, 0).toFixed(2));
    const earned = roundMoney(base + tip);
    return {
      base,
      tip,
      hours,
      earned,
      count: inWindow.length,
      perHour: hours > 0 ? roundMoney(earned / hours) : 0,
      pending: inWindow.filter((b) => b.tip === null).length,
    };
  }, [inWindow]);

  // The chart plots exactly what the card counts: same window, one bar per day
  // (per month on "All"), so a number in the card can be found in the chart.
  const chartRows = useMemo(() => {
    const byMonth = period === "all";

    const buckets = new Map<string, { base: number; tip: number }>();
    for (const block of inWindow) {
      const key = byMonth ? block.date.slice(0, 7) : block.date;
      const bucket = buckets.get(key) ?? { base: 0, tip: 0 };
      bucket.base += block.base;
      bucket.tip += block.tip ?? 0;
      buckets.set(key, bucket);
    }

    return [...buckets.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-31)
      .map(([key, value]) => ({
        label: byMonth ? monthLabel(key).replace(/ \d{4}$/, "") : shortDate(key),
        base_pay: roundMoney(value.base),
        tips: roundMoney(value.tip),
      }));
  }, [inWindow, period]);

  // History groups by day so a busy day is one line, not five.
  const days = useMemo(() => {
    const map = new Map<string, typeof blocks>();
    for (const block of inWindow) {
      const list = map.get(block.date) ?? [];
      list.push(block);
      map.set(block.date, list);
    }
    return [...map.entries()].map(([date, list]) => ({
      date,
      list,
      total: roundMoney(list.reduce((sum, b) => sum + b.base + (b.tip ?? 0), 0)),
      hours: Number(list.reduce((sum, b) => sum + b.hours, 0).toFixed(2)),
      pending: list.filter((b) => b.tip === null).length,
    }));
  }, [inWindow]);

  if (!flex) return null;

  const visibleDays = showAllDays ? days : days.slice(0, 7);

  // "Same as last block": yesterday's times and base pay, one tap.
  const last = blocks[0];
  const presets: EntryPreset[] = last
    ? [
        {
          label: `Same as last · ${formatClock(last.start)}–${formatClock(last.finish)} · ${formatCurrency(last.base)}`,
          values: { start_time: last.start, finish_time: last.finish, base_pay: String(last.base) },
        },
      ]
    : [];

  const finishBlock = () => {
    if (!timer.active) return;
    setFinishing({ date: timer.active.date, start: timer.active.startTime, finish: zonedClockNow() });
  };

  return (
    <CompactPageShell
      title={<FlexMark />}
      subtitle="Every block, base pay and tip"
      action={
        <div className="flex items-center gap-1.5">
          {timer.active ? (
            <>
              <button
                type="button"
                onClick={finishBlock}
                className="inline-flex items-center gap-1 rounded-lg bg-[#34c759] px-2.5 py-1.5 text-[11px] font-semibold text-white"
              >
                <Square className="h-3 w-3" fill="currentColor" /> Finish · {timer.elapsed}
              </button>
              <button
                type="button"
                onClick={timer.clear}
                aria-label="Discard the running block"
                title="Discard"
                className="hit rounded-lg p-1.5 text-muted hover:bg-black/5 hover:text-[#ff3b30] dark:hover:bg-white/10"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={timer.start}
                className="inline-flex items-center gap-1 rounded-lg glass px-2.5 py-1.5 text-[11px] font-semibold"
                style={{ color: FLEX_BLUE }}
              >
                <Play className="h-3 w-3" fill="currentColor" /> Start
              </button>
              <button
                type="button"
                onClick={() => setLogging(true)}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-white"
                style={{ background: FLEX_BLUE }}
              >
                <Plus className="h-3 w-3" /> Log
              </button>
            </>
          )}
        </div>
      }
    >
      <Tilt3D max={6} className="rounded-[var(--card-radius)]">
      <GlassCard className="!p-3 border-t-[3px] border-t-[#0077FF]">
        <div className="mb-3 flex justify-center">
          <div className="glass flex gap-0.5 rounded-lg p-0.5">
            {PERIODS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setChosen({ period: option.value, offset: 0 })}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[11px] font-medium transition-all",
                  period === option.value ? "text-white" : "text-muted"
                )}
                style={period === option.value ? { background: FLEX_BLUE } : undefined}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Which window, and how to leave it. */}
        <div className="mb-3 flex items-center justify-center gap-1">
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={!range || !hasEarlier}
            aria-label="Earlier"
            className="hit rounded-lg p-1.5 text-muted transition-colors hover:bg-black/5 disabled:opacity-25 dark:hover:bg-white/10"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p className="min-w-[10rem] text-center text-[12px] font-semibold">
            {range ? range.label : "All time"}
          </p>
          <button
            type="button"
            onClick={() => step(1)}
            disabled={!range || offset >= 0}
            aria-label="Later"
            className="hit rounded-lg p-1.5 text-muted transition-colors hover:bg-black/5 disabled:opacity-25 dark:hover:bg-white/10"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <p className="text-center text-[10px] uppercase tracking-wide text-muted">Earned</p>
        <p
          className="text-center text-3xl font-semibold tabular-nums"
          style={{ color: FLEX_BLUE }}
        >
          {formatCurrency(stats.earned)}
        </p>

        {/* Base and tip are the two halves of the number above. */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-black/[0.03] px-3 py-2 dark:bg-white/[0.04]">
            <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted">
              <span className="h-2 w-2 rounded-full" style={{ background: BASE_COLOR }} />
              Base pay
            </p>
            <p className="text-base font-semibold tabular-nums">{formatCurrency(stats.base)}</p>
          </div>
          <div className="rounded-xl bg-black/[0.03] px-3 py-2 dark:bg-white/[0.04]">
            <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted">
              <span className="h-2 w-2 rounded-full" style={{ background: TIP_COLOR }} />
              Tips
            </p>
            <p className="text-base font-semibold tabular-nums">{formatCurrency(stats.tip)}</p>
          </div>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-black/[0.03] px-2 py-2 dark:bg-white/[0.04]">
            <p className="text-[10px] uppercase tracking-wide text-muted">Blocks</p>
            <p className="text-base font-semibold tabular-nums">{stats.count}</p>
          </div>
          <div className="rounded-xl bg-black/[0.03] px-2 py-2 dark:bg-white/[0.04]">
            <p className="text-[10px] uppercase tracking-wide text-muted">Hours</p>
            <p className="text-base font-semibold tabular-nums">{stats.hours}</p>
          </div>
          <div className="rounded-xl bg-black/[0.03] px-2 py-2 dark:bg-white/[0.04]">
            <p className="text-[10px] uppercase tracking-wide text-muted">Per hour</p>
            <p className="text-base font-semibold tabular-nums">
              {formatCurrency(stats.perHour)}
            </p>
          </div>
        </div>

        <p className="mt-2 text-center text-[10px] text-muted">
          {stats.pending > 0
            ? `${stats.pending} of ${stats.count} still waiting on tips`
            : stats.count > 0
              ? "All tips in"
              : hasEarlier
                ? "No blocks here — step back for earlier ones"
                : "Nothing in this period"}
          {" · "}
          {blocks.length} blocks all time
        </p>
      </GlassCard>
      </Tilt3D>


      <FlexDepositsCard rule={flex} entries={entries} />

      {waitingOnTips.length > 0 ? (
        <GlassCard className="!p-0 overflow-hidden">
          <div className="border-l-[3px] border-[#ff9500] px-4 py-2.5">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#ff9500]">
              <Clock className="h-3 w-3" /> Tips to confirm ({waitingOnTips.length})
            </p>
          </div>
          <div className="divide-y divide-black/5 dark:divide-white/[0.07]">
            {waitingOnTips.map((item) => {
              const values = resolveEntry(flex, item.entry);
              return (
                <button
                  key={item.entry.id}
                  type="button"
                  onClick={() => setAnswering(item.entry)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                >
                  <div className="min-w-0">
                    <p className="text-[13px]">
                      {prettyDate(item.entry.date)}
                      <span className="text-muted">
                        {" · "}
                        {formatClock(String(values.start_time ?? ""))} –{" "}
                        {formatClock(String(values.finish_time ?? ""))}
                      </span>
                    </p>
                    <p className="text-[10px] text-muted">
                      Base {formatCurrency(Number(values.base_pay ?? 0))} · due{" "}
                      {item.overdueHours}h ago
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] font-semibold" style={{ color: FLEX_BLUE }}>
                    Add tip
                  </span>
                </button>
              );
            })}
          </div>
        </GlassCard>
      ) : null}

      <GlassCard className="!p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold">Base pay &amp; tips</p>
          <div className="glass flex gap-0.5 rounded-lg p-0.5">
            {CHARTS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setChart(option.value)}
                className={cn(
                  "rounded-md px-2 py-0.5 text-[10px] font-medium transition-all",
                  chart === option.value ? "text-white" : "text-muted"
                )}
                style={chart === option.value ? { background: FLEX_BLUE } : undefined}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <StackedChart
          type={chart}
          rows={chartRows}
          series={[
            { key: "base_pay", label: "Base pay", color: BASE_COLOR },
            { key: "tips", label: "Tips", color: TIP_COLOR },
          ]}
          height={210}
          emptyMessage={blocks.length === 0 ? "No blocks logged yet" : "Nothing in this window"}
        />
      </GlassCard>

      <GlassCard className="!p-0 overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-4 pt-3">
          <p className="text-xs font-semibold">History</p>
          <p className="text-[10px] text-muted">{range ? range.label : "Newest first"}</p>
        </div>

        {days.length === 0 ? (
          <p className="px-4 py-6 text-center text-[11px] text-muted">
            {blocks.length === 0
              ? "Nothing logged yet. Tap “Log a block”, or just tell Jarvis."
              : "No blocks in this window."}
          </p>
        ) : (
          <div className="mt-2 divide-y divide-black/5 dark:divide-white/[0.07]">
            {visibleDays.map((day) => {
              const expanded = openDay === day.date;
              return (
                <div key={day.date}>
                  {/* One line per DAY. A five-block day was five rows before. */}
                  <button
                    type="button"
                    onClick={() => setOpenDay(expanded ? null : day.date)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-black/[0.03] dark:hover:bg-white/[0.04]"
                  >
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 shrink-0 text-muted transition-transform",
                        expanded && "rotate-180"
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium">{prettyDate(day.date)}</p>
                      <p className="text-[10px] text-muted">
                        {day.list.length} {day.list.length === 1 ? "block" : "blocks"} · {day.hours}h
                        {day.pending > 0 ? (
                          <span className="text-[#ff9500]"> · {day.pending} tip pending</span>
                        ) : null}
                      </p>
                    </div>
                    <p className="shrink-0 text-[14px] font-semibold tabular-nums">
                      {formatCurrency(day.total)}
                    </p>
                  </button>

                  {expanded ? (
                    <div className="bg-black/[0.02] px-4 pb-2 dark:bg-white/[0.03]">
                      {day.list.map((block) => (
                        <div
                          key={block.entry.id}
                          className="flex items-center gap-3 border-t border-black/5 py-2 first:border-t-0 dark:border-white/[0.07]"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-[12px] tabular-nums">
                              {formatClock(block.start)} – {formatClock(block.finish)}
                              <span className="text-muted"> · {block.hours}h</span>
                            </p>
                            <p className="text-[10px] text-muted">
                              Base {formatCurrency(block.base)}
                              {block.tip === null ? (
                                <span className="text-[#ff9500]"> · tip pending</span>
                              ) : (
                                <> · tip {formatCurrency(block.tip)}</>
                              )}
                            </p>
                          </div>
                          <p className="shrink-0 text-[12px] font-semibold tabular-nums">
                            {formatCurrency(block.base + (block.tip ?? 0))}
                          </p>
                          <button
                            type="button"
                            onClick={() => setEditing(block.entry)}
                            aria-label={`Edit the ${block.date} ${block.start} block`}
                            className="hit shrink-0 rounded-md p-1.5 text-muted hover:bg-black/5 hover:text-[#007aff] dark:hover:bg-white/10"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDelete(block.entry)}
                            aria-label={`Delete the ${block.date} ${block.start} block`}
                            className="hit shrink-0 rounded-md p-1.5 text-[#ff3b30] hover:bg-black/5 dark:hover:bg-white/10"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}

            {days.length > 7 ? (
              <button
                type="button"
                onClick={() => setShowAllDays((value) => !value)}
                className="w-full px-4 py-2.5 text-[11px] font-semibold"
                style={{ color: FLEX_BLUE }}
              >
                {showAllDays ? "Show less" : `Show all ${days.length} days`}
              </button>
            ) : null}
          </div>
        )}
      </GlassCard>

      {logging ? (
        <RuleEntryEditor
          open
          rule={flex}
          mode="start"
          presets={presets}
          onClose={() => setLogging(false)}
          onSave={(values, date) => {
            openEntry(flex.id, values, date);
            setLogging(false);
          }}
        />
      ) : null}

      {finishing ? (
        <RuleEntryEditor
          open
          rule={flex}
          mode="start"
          initialDate={finishing.date}
          initialValues={{ start_time: finishing.start, finish_time: finishing.finish }}
          presets={presets}
          onClose={() => setFinishing(null)}
          onSave={(values, date) => {
            openEntry(flex.id, values, date);
            timer.clear();
            setFinishing(null);
          }}
        />
      ) : null}

      {editing ? (
        <RuleEntryEditor
          open
          rule={flex}
          entry={editing}
          mode="edit"
          onClose={() => setEditing(null)}
          onSave={(values, date) => {
            // Clearing the tips field puts the block back on the "to confirm" list.
            const hasTips = values.tips !== undefined && values.tips !== "";
            updateEntry(editing.id, {
              values,
              date: date ?? editing.date,
              answered: hasTips ? flex.followUps.map((f) => f.id) : [],
            });
            setEditing(null);
          }}
        />
      ) : null}


      {answering ? (
        <RuleEntryEditor
          open
          rule={flex}
          entry={answering}
          mode="follow_up"
          onClose={() => setAnswering(null)}
          onSave={(values) => {
            const followUp = flex.followUps.find(
              (item) => !answering.answered.includes(item.id)
            );
            answerEntry(answering.id, values, followUp?.id);
            setAnswering(null);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this block?"
        message={
          pendingDelete
            ? `The ${prettyDate(pendingDelete.date)} block and its earnings will be removed.`
            : ""
        }
        confirmLabel="Delete block"
        onConfirm={() => {
          if (pendingDelete) deleteEntry(pendingDelete.id);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </CompactPageShell>
  );
}
