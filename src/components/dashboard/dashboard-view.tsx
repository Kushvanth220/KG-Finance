"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ChevronDown, Loader2, Pencil, Plus, Receipt, TrendingUp } from "lucide-react";
import { AnimatedMoney } from "@/components/ui/animated-number";
import { RuleDashboards } from "@/components/dashboard/rule-dashboard";
import { AccountBalances } from "@/components/dashboard/account-balances";
import { FlexChart, chartColor } from "@/components/charts/flex-chart";
import { GlassCard } from "@/components/ui/glass-card";
import { PersonTabs } from "@/components/ui/person-tabs";
import { ChartTypePicker, useChartType } from "@/components/dashboard/chart-type-picker";
import { ExpenseCategoryDonutChart, IncomeDonutChart } from "@/components/dashboard/dashboard-charts";
import { SpendCategoryManager } from "@/components/spend/spend-category-manager";
import { useFinanceStore } from "@/store/finance-store";
import { useAssistantPreferencesStore } from "@/store/assistant-preferences-store";
import { getIncomeForPeriod, getPersonExpensesForPeriod } from "@/lib/calculations";
import { getAccountsForPerson } from "@/lib/accounts";
import { buildLearnedCategorySpending } from "@/lib/learn-spending-categories";
import { upcomingFor, whenLabel } from "@/lib/upcoming";
import { formatCurrency } from "@/lib/formatters";
import { roundMoney } from "@/lib/money";
import { PERSON_LABELS, type Person } from "@/types";
import { cn } from "@/lib/utils";
import { useLiveSync } from "@/hooks/use-live-sync";
import { Rings3D } from "@/components/art/page-art";
import { UpcomingStrip } from "@/components/dashboard/upcoming-strip";
import {
  DateRangeFilter,
  defaultRangeChoice,
  resolveRange,
  type RangeChoice,
} from "@/components/dashboard/date-range-filter";
import { PeriodStory } from "@/components/dashboard/month-story";
import { DebtsSummary } from "@/components/dashboard/debts-summary";
import { DueBills } from "@/components/spend/due-bills";
import { BudgetBar, categorySpentThisMonth } from "@/components/spend/budget-bar";

/** "▲ 12% vs Aug" — the change, and whether it is the good kind. */
function PeriodDelta({
  now,
  prev,
  vs,
  goodWhenUp,
}: {
  now: number;
  prev: number;
  vs: string;
  goodWhenUp: boolean;
}) {
  if (prev <= 0 && now <= 0) return null;
  const diff = now - prev;
  if (Math.abs(diff) < 0.005) {
    return <span className="text-[10px] text-muted">same as {vs}</span>;
  }
  const up = diff > 0;
  const good = up === goodWhenUp;
  const pct = prev > 0 ? Math.round((Math.abs(diff) / prev) * 100) : null;
  return (
    <span className={cn("text-[10px] font-semibold tabular-nums", good ? "text-[#34c759]" : "text-[#ff3b30]")}>
      {up ? "▲" : "▼"} {pct !== null && pct <= 999 ? `${pct}%` : formatCurrency(Math.abs(diff))} vs {vs}
    </span>
  );
}

/**
 * The tags under a chart: every slice or bar named, with its amount and
 * share, in the colour the chart gave it. Tap one to open it in History.
 */
function ChartTags({
  items,
  total,
  onPick,
}: {
  items: { name: string; amount: number; color: string }[];
  total: number;
  onPick: (name: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {items.map((item) => {
        const pct = total > 0 ? Math.round((item.amount / total) * 100) : 0;
        return (
          <button
            key={item.name}
            type="button"
            onClick={() => onPick(item.name)}
            className="hit flex items-center gap-1.5 rounded-full border border-black/5 bg-black/[0.03] px-2 py-1 text-[10px] transition-colors hover:bg-black/[0.06] dark:border-white/10 dark:bg-white/[0.05] dark:hover:bg-white/[0.09]"
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="max-w-[9rem] truncate text-muted">{item.name}</span>
            <span className="font-semibold tabular-nums">{formatCurrency(item.amount)}</span>
            <span className="tabular-nums text-muted">{pct}%</span>
          </button>
        );
      })}
    </div>
  );
}

const PERSON_ACCENT: Record<Person, string> = {
  kushvanth: "#007aff",
  g: "#af52de",
};

function greetingFor(hour: number): string {
  if (hour < 5) return "Late night";
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

export function DashboardView() {
  const router = useRouter();
  const { incomeEntries, incomeSources, transactions, spendCategories, accounts, monthlyExpenses } =
    useFinanceStore();
  const reminders = useAssistantPreferencesStore((state) => state.structuredReminders);
  const { configured: syncConfigured, isLive, isSyncing, lastSyncedAt } = useLiveSync();
  const [person, setPerson] = useState<Person>("kushvanth");
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  const [unusedOpen, setUnusedOpen] = useState(false);
  // How each panel is drawn — a viewing preference kept per browser.
  const [incomeChart, setIncomeChart] = useChartType("income", "donut");
  const [spendChart, setSpendChart] = useChartType("spend", "bar");

  // One date filter for the whole page.
  const [rangeChoice, setRangeChoice] = useState<RangeChoice>(defaultRangeChoice);
  const range = useMemo(() => resolveRange(rangeChoice), [rangeChoice]);

  const accent = PERSON_ACCENT[person];

  // The one line under the greeting: what is available, and the next thing due.
  const available = useMemo(
    () =>
      roundMoney(
        getAccountsForPerson(accounts, person)
          .filter((a) => a.type !== "credit")
          .reduce((sum, a) => sum + a.balance, 0)
      ),
    [accounts, person]
  );
  const nextDue = useMemo(
    () => upcomingFor(monthlyExpenses, transactions, reminders, person, 7)[0] ?? null,
    [monthlyExpenses, transactions, reminders, person]
  );
  const greeting = greetingFor(new Date().getHours());

  const sourceNames = useMemo(
    () => Object.fromEntries(incomeSources.map((source) => [source.id, source.name])),
    [incomeSources]
  );

  const incomeEntriesInRange = useMemo(
    () => getIncomeForPeriod(incomeEntries, person, range.start, range.end),
    [incomeEntries, person, range]
  );
  const incomePrevTotal = useMemo(
    () =>
      getIncomeForPeriod(incomeEntries, person, range.prevStart, range.prevEnd).reduce(
        (sum, entry) => sum + entry.amount,
        0
      ),
    [incomeEntries, person, range]
  );

  const incomeBySource = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const entry of incomeEntriesInRange) {
      const name = sourceNames[entry.sourceId] ?? "Unknown";
      grouped.set(name, (grouped.get(name) ?? 0) + entry.amount);
    }
    return Array.from(grouped.entries())
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [incomeEntriesInRange, sourceNames]);

  const incomeTotal = useMemo(
    () => incomeBySource.reduce((sum, item) => sum + item.amount, 0),
    [incomeBySource]
  );

  const expensesInRange = useMemo(
    () => getPersonExpensesForPeriod(transactions, person, range.start, range.end),
    [transactions, person, range]
  );
  const expensePrevTotal = useMemo(
    () =>
      getPersonExpensesForPeriod(transactions, person, range.prevStart, range.prevEnd).reduce(
        (sum, t) => sum + t.amount,
        0
      ),
    [transactions, person, range]
  );

  const categoryInsights = useMemo(
    () =>
      buildLearnedCategorySpending(
        transactions,
        person,
        spendCategories,
        expensesInRange,
        range.start,
        range.end
      ),
    [transactions, person, spendCategories, expensesInRange, range]
  );

  const { spent: spentCategories, skipped: skippedCategories } = categoryInsights;

  const spendTotal = useMemo(
    () => spentCategories.reduce((sum, item) => sum + item.amount, 0),
    [spentCategories]
  );

  // The dial reads the same rows the spending panel does.
  const dialSpend = useMemo(() => expensesInRange.reduce((sum, t) => sum + t.amount, 0), [expensesInRange]);

  const budgeted = useMemo(() => spendCategories.filter((c) => (c.budget ?? 0) > 0), [spendCategories]);

  const openCategoryHistory = (category?: string) => {
    const params = new URLSearchParams({ type: "expense", person });
    if (category) params.set("category", category);
    router.push(`/history?${params.toString()}`);
  };

  const openIncomeHistory = (source?: string) => {
    const params = new URLSearchParams({ type: "income", person });
    if (source) params.set("category", source);
    router.push(`/history?${params.toString()}`);
  };

  return (
    <div className="space-y-3 pb-4 max-w-lg mx-auto">
      {/* One greeting, one line that matters. Everything below is detail. */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <Rings3D size={36} />
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-tight">
              {greeting}, {PERSON_LABELS[person]}
            </h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
              <span className="font-semibold text-[#34c759] tabular-nums">{formatCurrency(available)}</span>
              <span>available</span>
              {nextDue ? (
                <>
                  <span aria-hidden>·</span>
                  <span className={cn(nextDue.daysUntil <= 1 && "font-semibold text-[#ff9500]")}>
                    {nextDue.name} {whenLabel(nextDue.daysUntil).toLowerCase()}
                  </span>
                </>
              ) : null}
              {syncConfigured && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
                    isLive && !isSyncing
                      ? "bg-[#34c759]/15 text-[#34c759]"
                      : isSyncing
                        ? "bg-[#007aff]/15 text-[#007aff]"
                        : "bg-black/5 text-muted dark:bg-white/10"
                  )}
                  title={
                    lastSyncedAt
                      ? `Last synced ${format(new Date(lastSyncedAt), "MM/dd/yyyy hh:mm a")}`
                      : "Waiting for first sync"
                  }
                >
                  {isSyncing ? (
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  ) : (
                    <span className={cn("w-1.5 h-1.5 rounded-full", isLive ? "bg-[#34c759]" : "bg-muted")} />
                  )}
                  {isSyncing ? "Syncing" : isLive ? "Live" : "Sync"}
                </span>
              )}
            </p>
          </div>
        </div>
        <Link
          href="/spend"
          className="inline-flex shrink-0 items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
          style={{ backgroundColor: accent }}
        >
          <Plus className="w-3.5 h-3.5" />
          Spend
        </Link>
      </div>

      <PersonTabs
        value={person}
        onChange={setPerson}
        className="!rounded-xl !p-0.5 [&_button]:py-1.5 [&_button]:text-xs"
      />

      <DateRangeFilter value={rangeChoice} onChange={setRangeChoice} accent={accent} />

      <PeriodStory income={incomeTotal} spend={dialSpend} start={range.start} end={range.end} label={range.label} />

      <DueBills person={person} />
      <UpcomingStrip person={person} />

      {/* Reads the same store the Accounts page writes to, so the two agree. */}
      <AccountBalances person={person} />

      {/* Income: the headline, the delta, one chart in the shape the user picked. */}
      <GlassCard strong className="!p-3 border border-[#34c759]/20">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-xs font-semibold">
              <TrendingUp className="w-3.5 h-3.5 text-[#34c759]" /> Income
              <span className="truncate font-normal text-muted">· {range.short}</span>
            </p>
            <AnimatedMoney
              value={incomeTotal}
              prefix="+"
              className="block text-xl font-bold text-[#34c759] kg-figure"
            />
            <PeriodDelta now={incomeTotal} prev={incomePrevTotal} vs={range.prevLabel} goodWhenUp />
          </div>
          <button
            type="button"
            onClick={() => openIncomeHistory()}
            className="hit shrink-0 text-[10px] font-medium text-[#007aff]"
          >
            View all
          </button>
        </div>

        <div className="my-2">
          <ChartTypePicker value={incomeChart} onChange={setIncomeChart} tint="#34c759" />
        </div>
        {incomeBySource.length === 0 ? (
          <p className="text-[11px] text-muted text-center py-6">No income in this period</p>
        ) : incomeChart === "donut" ? (
          <IncomeDonutChart
            segments={incomeBySource}
            onSliceClick={(source) => openIncomeHistory(source)}
            onCenterClick={() => openIncomeHistory()}
          />
        ) : (
          <>
            <FlexChart
              type={incomeChart}
              data={incomeBySource.map((item) => ({ label: item.name, value: item.amount }))}
              height={190}
              emptyMessage="No income recorded yet"
            />
            <ChartTags
              items={incomeBySource.map((item, index) => ({ ...item, color: chartColor(index) }))}
              total={incomeTotal}
              onPick={(source) => openIncomeHistory(source)}
            />
          </>
        )}
      </GlassCard>

      {/* Spending: the headline, the delta, one chart. */}
      <GlassCard strong className="!p-3 border border-[#ff3b30]/20">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-xs font-semibold">
              <Receipt className="w-3.5 h-3.5 text-[#ff3b30]" /> Spending
              <span className="truncate font-normal text-muted">· {range.short}</span>
            </p>
            <AnimatedMoney value={spendTotal} className="block text-xl font-bold text-[#ff3b30] kg-figure" />
            <PeriodDelta now={spendTotal} prev={expensePrevTotal} vs={range.prevLabel} goodWhenUp={false} />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setCategoryManagerOpen(true)}
              className="hit inline-flex items-center gap-1 text-[10px] font-medium text-[#007aff]"
            >
              <Pencil className="w-3 h-3" /> Edit
            </button>
            <button
              type="button"
              onClick={() => openCategoryHistory()}
              className="hit text-[10px] font-medium text-[#007aff]"
            >
              View all
            </button>
          </div>
        </div>

        <div className="my-2">
          <ChartTypePicker value={spendChart} onChange={setSpendChart} tint="#ff3b30" />
        </div>
        {spentCategories.length === 0 ? (
          <p className="text-[11px] text-muted text-center py-8">No spending in this period</p>
        ) : spendChart === "donut" ? (
          <ExpenseCategoryDonutChart
            compact
            segments={spentCategories.map((item) => ({ name: item.name, amount: item.amount }))}
            onSliceClick={(category) => openCategoryHistory(category)}
            onCenterClick={() => openCategoryHistory()}
          />
        ) : (
          <>
            <FlexChart
              type={spendChart}
              data={spentCategories.map((item) => ({ label: item.name, value: item.amount }))}
              height={190}
              emptyMessage="Nothing spent in this period"
            />
            <ChartTags
              items={spentCategories.map((item, index) => ({ name: item.name, amount: item.amount, color: chartColor(index) }))}
              total={spendTotal}
              onPick={(category) => openCategoryHistory(category)}
            />
          </>
        )}

        {/* Budgeted categories against their budgets — a budget is a monthly
            promise, so only when the range sits inside one month. */}
        {range.singleMonth && budgeted.length > 0 ? (
          <div className="mt-2 space-y-1.5 border-t border-black/5 pt-2 dark:border-white/10">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              Budgets · {format(range.start, "MMMM")}
            </p>
            {budgeted.map((c) => (
              <button
                key={`budget-${c.id}`}
                type="button"
                onClick={() => openCategoryHistory(c.name)}
                className="block w-full px-1 text-left"
              >
                <p className="text-[10px] font-medium">{c.name}</p>
                <BudgetBar spent={categorySpentThisMonth(transactions, c.name, range.start)} budget={c.budget!} />
              </button>
            ))}
          </div>
        ) : null}

        {skippedCategories.length > 0 && (
          <div className="mt-2 border-t border-black/5 pt-2 dark:border-white/10">
            <button
              type="button"
              onClick={() => setUnusedOpen((v) => !v)}
              className="hit inline-flex items-center gap-1 text-[10px] font-medium text-muted"
              aria-expanded={unusedOpen}
            >
              {skippedCategories.length} {skippedCategories.length === 1 ? "category" : "categories"} unused in this period
              <ChevronDown className={cn("h-3 w-3 transition-transform", unusedOpen && "rotate-180")} />
            </button>
            {unusedOpen ? (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {skippedCategories.map((name) => (
                  <span
                    key={name}
                    className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] text-muted dark:bg-white/10"
                  >
                    {name}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </GlassCard>

      <DebtsSummary person={person} />

      {/* Anything a rule collects, shown where the user already looks. */}
      <RuleDashboards person={person} />

      <SpendCategoryManager
        open={categoryManagerOpen}
        onClose={() => setCategoryManagerOpen(false)}
      />
    </div>
  );
}
