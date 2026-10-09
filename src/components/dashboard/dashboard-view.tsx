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
import {
  getIncomeForPeriod,
  getPersonExpensesForPeriod,
  getTransactionExpenseShare,
  sumPersonExpenses,
} from "@/lib/calculations";
import { NeedsYou, pendingFlexTotal } from "@/components/dashboard/needs-you";
import { motion, useReducedMotion } from "motion/react";
import { enterDelay } from "@/lib/motion-presets";
import { useRulesStore } from "@/store/rules-store";
import { zonedToday } from "@/lib/zoned-date";
import { getAccountsForPerson } from "@/lib/accounts";
import { buildLearnedCategorySpending } from "@/lib/learn-spending-categories";
import { upcomingFor, whenLabel } from "@/lib/upcoming";
import { formatCurrency } from "@/lib/formatters";
import { roundMoney } from "@/lib/money";
import { PERSON_LABELS, type Person } from "@/types";
import { cn } from "@/lib/utils";
import { useLiveSync } from "@/hooks/use-live-sync";
import { SpendGrid } from "@/components/art/page-art";
import { Reveal } from "@/components/ui/reveal";
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
    <span className={cn("text-[10px] font-semibold tabular-nums", good ? "text-positive" : "text-negative")}>
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
  showPercent = true,
}: {
  items: { name: string; amount: number; color: string }[];
  total: number;
  onPick: (name: string) => void;
  /** The share of the total beside each amount. Off where the amount is the point. */
  showPercent?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {items.map((item) => {
        const pct = showPercent && total > 0 ? Math.round((item.amount / total) * 100) : 0;
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
            {showPercent ? <span className="tabular-nums text-muted">{pct}%</span> : null}
          </button>
        );
      })}
    </div>
  );
}

const PERSON_ACCENT: Record<Person, string> = {
  kushvanth: "var(--accent)",
  g: "var(--feature)",
};

function greetingFor(hour: number): string {
  if (hour < 5) return "Late night";
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  return "Evening";
}

export function DashboardView() {
  const router = useRouter();
  const still = useReducedMotion();
  const { incomeEntries, incomeSources, transactions, spendCategories, accounts, monthlyExpenses } =
    useFinanceStore();
  const reminders = useAssistantPreferencesStore((state) => state.structuredReminders);
  const flexDeposits = useFinanceStore((state) => state.flexDeposits);
  const ruleList = useRulesStore((state) => state.rules);
  const ruleEntries = useRulesStore((state) => state.entries);
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
    () => sumPersonExpenses(transactions, person, range.prevStart, range.prevEnd),
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

  const {
    spent: spentCategories,
    skipped: skippedCategories,
    offsets: spendOffsets,
    unmapped: unmappedSpend,
  } = categoryInsights;

  /** What the chart can draw: the categories with money in them. */
  const slicesTotal = useMemo(
    () => spentCategories.reduce((sum, item) => sum + item.amount, 0),
    [spentCategories]
  );

  /**
   * What was actually spent.
   *
   * The slices, plus the refunds no chart can draw as a slice. Counting only
   * the drawable part is how this figure came to claim $115 more spending
   * than the ledger held: a refunded category simply vanished. Both parts are
   * shown, so the breakdown and the headline reconcile on screen.
   */
  const spendTotal = useMemo(
    () =>
      roundMoney(
        slicesTotal +
          spendOffsets.reduce((sum, item) => sum + item.amount, 0) +
          unmappedSpend
      ),
    [slicesTotal, spendOffsets, unmappedSpend]
  );

  // The dial and the spending panel are the same rows, so they are the same
  // number — both this person's SHARE, never the face value of a shared bill.
  const dialSpend = spendTotal;

  // Money earned in this period whose payout has not landed yet, so the
  // verdict is not "you overspent" on a month that is only awaiting a deposit.
  const pendingIncome = useMemo(() => {
    if (person !== "kushvanth") return 0;
    return pendingFlexTotal(ruleList, ruleEntries, flexDeposits ?? [], incomeEntries, incomeSources, zonedToday()).total;
  }, [person, ruleList, ruleEntries, flexDeposits, incomeEntries, incomeSources]);

  /**
   * The mark beside the greeting: this person's spend per day for the last
   * sixteen days. Deliberately NOT tied to the range filter above — the mark
   * answers "how have the last two weeks gone", which stays useful while you
   * page back through old months.
   */
  const recentDays = useMemo(() => {
    const anchor = new Date(`${zonedToday()}T12:00:00`);
    const out: { date: string; amount: number }[] = [];
    for (let back = 15; back >= 0; back--) {
      const at = new Date(anchor);
      at.setDate(at.getDate() - back);
      out.push({
        date: `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`,
        amount: 0,
      });
    }

    const slot = new Map(out.map((day, index) => [day.date, index]));
    for (const transaction of transactions) {
      if (transaction.type !== "expense") continue;
      const index = slot.get(transaction.date);
      if (index === undefined) continue;
      out[index]!.amount += getTransactionExpenseShare(transaction, person);
    }
    return out;
  }, [transactions, person]);

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

  /**
   * Cards used to enter on mount, all of them, including the six below the
   * fold that finished before anyone scrolled down. Now each one enters as it
   * is reached — see `Reveal`. The delay is kept only for the first few,
   * which are on screen at load and have no scroll to stagger them.
   */
  const section = (index: number) => ({ delay: index < 3 ? enterDelay(index, 0.06) : 0 });

  return (
    <motion.div layout={still ? false : "position"} className="space-y-3 pb-4 max-w-lg mx-auto">
      {/* One greeting, one line that matters. Everything below is detail. */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <SpendGrid days={recentDays} size={36} />
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-tight">
              {greeting}, {PERSON_LABELS[person]}
            </h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
              <span className="font-semibold text-positive tabular-nums">{formatCurrency(available)}</span>
              <span>available</span>
              {nextDue ? (
                <>
                  <span aria-hidden>·</span>
                  <span className={cn(nextDue.daysUntil <= 1 && "font-semibold text-caution")}>
                    {nextDue.name} {whenLabel(nextDue.daysUntil).toLowerCase()}
                  </span>
                </>
              ) : null}
              {syncConfigured && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
                    isLive && !isSyncing
                      ? "bg-positive/15 text-positive"
                      : isSyncing
                        ? "bg-accent/15 text-accent"
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
                    <span className={cn("w-1.5 h-1.5 rounded-full", isLive ? "bg-positive" : "bg-muted")} />
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

      <Reveal {...section(0)}>
      <PersonTabs
        value={person}
        onChange={setPerson}
        className="!rounded-xl !p-0.5 [&_button]:py-1.5 [&_button]:text-xs"
      />

      </Reveal>

      <Reveal {...section(1)}>
        <DateRangeFilter value={rangeChoice} onChange={setRangeChoice} accent={accent} />
      </Reveal>

      <Reveal {...section(2)}>
      <PeriodStory
        income={incomeTotal}
        spend={dialSpend}
        pending={pendingIncome}
        start={range.start}
        end={range.end}
        label={range.label}
      />
      </Reveal>

      <Reveal {...section(3)}>
        <NeedsYou person={person} />
      </Reveal>
      <Reveal>
        <DueBills person={person} />
      </Reveal>
      <Reveal>
        <UpcomingStrip person={person} />
      </Reveal>

      {/* Reads the same store the Accounts page writes to, so the two agree. */}
      <Reveal {...section(4)}>
        <AccountBalances person={person} />
      </Reveal>

      {/* Income: the headline, the delta, one chart in the shape the user picked. */}
      <Reveal>
        <GlassCard strong className="!p-3 border border-positive/20">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-xs font-semibold">
                <TrendingUp className="w-3.5 h-3.5 text-positive" /> Income
                <span className="truncate font-normal text-muted">· {range.short}</span>
              </p>
              <AnimatedMoney
                value={incomeTotal}
                prefix="+"
                className="block text-xl font-bold text-positive kg-figure"
              />
              <PeriodDelta now={incomeTotal} prev={incomePrevTotal} vs={range.prevLabel} goodWhenUp />
            </div>
            <button
              type="button"
              onClick={() => openIncomeHistory()}
              className="hit shrink-0 text-[10px] font-medium text-accent"
            >
              View all
            </button>
          </div>

          <div className="my-2">
            <ChartTypePicker value={incomeChart} onChange={setIncomeChart} tint="var(--success)" />
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
      </Reveal>

      {/* Spending: the headline, the delta, one chart. */}
      <Reveal>
        <GlassCard strong className="!p-3 border border-negative/20">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-xs font-semibold">
                <Receipt className="w-3.5 h-3.5 text-negative" /> Spending
                <span className="truncate font-normal text-muted">· {range.short}</span>
              </p>
              <AnimatedMoney value={spendTotal} className="block text-xl font-bold text-negative kg-figure" />
              <PeriodDelta now={spendTotal} prev={expensePrevTotal} vs={range.prevLabel} goodWhenUp={false} />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setCategoryManagerOpen(true)}
                className="hit inline-flex items-center gap-1 text-[10px] font-medium text-accent"
              >
                <Pencil className="w-3 h-3" /> Edit
              </button>
              <button
                type="button"
                onClick={() => openCategoryHistory()}
                className="hit text-[10px] font-medium text-accent"
              >
                View all
              </button>
            </div>
          </div>

          <div className="my-2">
            <ChartTypePicker value={spendChart} onChange={setSpendChart} tint="var(--danger)" />
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
                total={slicesTotal}
                showPercent={false}
                onPick={(category) => openCategoryHistory(category)}
              />
            </>
          )}

          {/* The part no chart can draw. Without this line the slices add up to
              more than the figure above them, and neither looks wrong on its own. */}
          {spendOffsets.length > 0 || unmappedSpend !== 0 ? (
            <div className="mt-2 space-y-1 border-t border-black/5 pt-2 dark:border-white/10">
              {spendOffsets.map((item) => (
                <button
                  key={`offset-${item.name}`}
                  type="button"
                  onClick={() => openCategoryHistory(item.name)}
                  className="hit flex w-full items-center justify-between gap-2 text-[11px]"
                >
                  <span className="truncate text-muted">{item.name} · refunded</span>
                  <span className="shrink-0 font-semibold tabular-nums text-positive">
                    {formatCurrency(item.amount)}
                  </span>
                </button>
              ))}
              {unmappedSpend !== 0 ? (
                <button
                  type="button"
                  onClick={() => openCategoryHistory()}
                  className="hit flex w-full items-center justify-between gap-2 text-[11px]"
                >
                  <span className="truncate text-muted">Uncategorised</span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {formatCurrency(unmappedSpend)}
                  </span>
                </button>
              ) : null}
            </div>
          ) : null}

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
      </Reveal>

      <Reveal {...section(6)}>
        <DebtsSummary person={person} />
      </Reveal>

      {/* Anything a rule collects, shown where the user already looks. */}
      <RuleDashboards person={person} />

      <SpendCategoryManager
        open={categoryManagerOpen}
        onClose={() => setCategoryManagerOpen(false)}
      />
    </motion.div>
  );
}
