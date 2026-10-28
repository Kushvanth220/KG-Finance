"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Filter, RotateCcw, Search, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { listRow, transition } from "@/lib/motion-presets";
import { DeletedHistoryCard } from "@/components/history/deleted-history-card";
import { HistoryRow } from "@/components/history/history-row";
import { CompactPageShell } from "@/components/ui/compact-page-shell";
import { Sparkline } from "@/components/art/page-art";
import { formatShortDate } from "@/lib/formatters";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassModal } from "@/components/ui/glass-modal";
import {
  MonthRangeFilter,
  defaultMonthRangeValue,
  getMonthRangeBounds,
  type MonthRangeValue,
} from "@/components/ui/month-range-filter";
import { useFinanceStore, getFinanceState } from "@/store/finance-store";
import { getAvailableMonthKeys } from "@/lib/calculations";
import {
  compareByDateTime,
  formatAmount,
  formatCurrency,
  formatDate,
  formatTime,
  isWithinDateRange,
  parseAppDateTime,
} from "@/lib/formatters";
import { getTransactionDisplayMessage, getTransactionActor, isMoneyIn } from "@/lib/transaction-messages";
import { forcePushNow, getActiveWorkspaceId } from "@/lib/supabase/sync";
import { accountLabel } from "@/lib/accounts";
import { groupByDay, historyIcon, historyTitle, matchesSearch } from "@/lib/history-rows";
import { balancesAfter } from "@/lib/running-balance";
import { zonedToday, zonedYesterday } from "@/lib/zoned-date";
import { PERSON_LABELS, type Person, type Transaction, type TransactionType } from "@/types";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const typeLabels: Record<TransactionType, string> = {
  income: "Income",
  expense: "Expense",
  transfer: "Transfer",
  cash_withdrawal: "Cash",
  cash_deposit: "Cash",
  debt_payment: "Debt",
  credit_payment: "Credit",
  settlement: "Settlement",
  balance_adjustment: "Adjust",
};

/** "Today · Mon 10/26", "Yesterday · Sun 10/25", or "Sat · 10/24/2026". */
function dayLabel(date: string): string {
  const day = format(parseAppDateTime(date), "EEE");
  if (date === zonedToday()) return `Today · ${day} ${formatDate(date).slice(0, 5)}`;
  if (date === zonedYesterday()) return `Yesterday · ${day} ${formatDate(date).slice(0, 5)}`;
  return `${day} · ${formatDate(date)}`;
}

export default function HistoryPage() {
  return (
    <Suspense fallback={<div className="text-xs text-muted p-4">Loading history…</div>}>
      <HistoryPageKeyed />
    </Suspense>
  );
}

/**
 * The URL decides the starting state (a highlighted row, a type filter), so
 * the page is keyed on it: a new link mounts a fresh page with the right
 * state from the first render, rather than mounting and then correcting.
 */
function HistoryPageKeyed() {
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("txn");
  const typeParam = searchParams.get("type");
  const categoryParam = searchParams.get("category");
  const personParam = searchParams.get("person");
  return (
    <HistoryPageContent
      key={`${highlightId ?? ""}|${typeParam ?? ""}|${categoryParam ?? ""}|${personParam ?? ""}`}
      highlightId={highlightId}
      typeParam={typeParam}
      categoryParam={categoryParam}
      personParam={personParam}
    />
  );
}

function HistoryPageContent({
  highlightId,
  typeParam,
  categoryParam,
  personParam,
}: {
  highlightId: string | null;
  typeParam: string | null;
  categoryParam: string | null;
  personParam: string | null;
}) {

  const { accounts, spendCategories, transactions, incomeEntries, deletedHistory, deleteTransaction, resetAllData } =
    useFinanceStore();
  // Words or an amount to find a row by, across every field it has.
  const [query, setQuery] = useState("");
  // What each row left in its accounts, worked back from today's balances.
  const leftAfter = useMemo(() => balancesAfter(accounts, transactions), [accounts, transactions]);
  const accountsById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  // Starting state, from the URL: a highlighted transaction opens whichever
  // list it lives in with the filters wide; a type link opens that filter.
  const [view, setView] = useState<"active" | "deleted">(() => {
    if (!highlightId) return "active";
    const inDeleted = (deletedHistory ?? []).some((record) =>
      record.transactions.some((t) => t.id === highlightId)
    );
    return inDeleted && !transactions.some((t) => t.id === highlightId) ? "deleted" : "active";
  });
  const [person, setPerson] = useState<Person | "overall">(() =>
    !highlightId && (personParam === "kushvanth" || personParam === "g") ? personParam : "overall"
  );
  const [typeFilter, setTypeFilter] = useState<TransactionType | "all">(() =>
    highlightId ? "all" : typeParam === "income" || typeParam === "expense" ? typeParam : "all"
  );
  const monthOptions = useMemo(
    () => getAvailableMonthKeys(transactions, incomeEntries),
    [transactions, incomeEntries]
  );
  const [dateRange, setDateRange] = useState<MonthRangeValue>(() =>
    defaultMonthRangeValue(monthOptions[0] ?? format(new Date(), "yyyy-MM"))
  );
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [linkedHighlightId, setLinkedHighlightId] = useState<string | null>(highlightId);
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const still = useReducedMotion();
  const [deletedByChoice, setDeletedByChoice] = useState<Person>("kushvanth");

  const bounds = getMonthRangeBounds(dateRange);
  const hasDateFilter = dateRange.mode !== "all";

  const openDeleteConfirm = (transaction: Transaction) => {
    setDeletedByChoice(person !== "overall" ? person : "kushvanth");
    setPendingDelete({
      id: transaction.id,
      message: getTransactionDisplayMessage(transaction),
    });
  };

  const confirmDelete = () => {
    if (!pendingDelete || isDeleting) return;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      deleteTransaction(pendingDelete.id, deletedByChoice);
      setPendingDelete(null);
      setIsDeleting(false);

      void forcePushNow(getActiveWorkspaceId(), getFinanceState).catch((err) => {
        setDeleteError(err instanceof Error ? err.message : "Deleted locally, but cloud sync failed");
      });
    } catch (err) {
      setIsDeleting(false);
      setDeleteError(err instanceof Error ? err.message : "Could not delete transaction");
    }
  };

  useEffect(() => {
    if (!highlightId) return;

    // State was set from the URL at mount; this only scrolls to the row and
    // lets the highlight fade.
    const timer = window.setTimeout(() => {
      document
        .getElementById(`history-txn-${highlightId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);

    const clearTimer = window.setTimeout(() => setLinkedHighlightId(null), 4000);

    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(clearTimer);
    };
  }, [highlightId]);


  const handleReset = () => {
    if (isResetting) return;
    setIsResetting(true);
    setDeleteError(null);
    try {
      resetAllData();
      setShowResetConfirm(false);
      void forcePushNow(getActiveWorkspaceId(), getFinanceState, {
        skipSafetyCheck: true,
      }).catch((err) => {
        setDeleteError(
          err instanceof Error
            ? err.message
            : "Reset locally, but cloud sync failed — history may come back."
        );
      });
    } finally {
      setIsResetting(false);
    }
  };

  const filtered = transactions
    .filter(
      (t) =>
        person === "overall" ||
        t.person === person ||
        t.paidByPerson === person ||
        t.expenseOwner === person ||
        t.beneficiaryPerson === person ||
        (t.expenseShares?.[person] ?? 0) > 0
    )
    .filter((t) => typeFilter === "all" || t.type === typeFilter)
    .filter((t) => !categoryParam || (t.category ?? "Other") === categoryParam)
    .filter((t) => isWithinDateRange(t, bounds.start, bounds.end))
    .filter((t) => matchesSearch(t, query, rowAccounts(t)))
    .sort(compareByDateTime);
  // Newest day first, each with what went out and came in.
  const dayGroups = groupByDay(filtered);

  /** The accounts a row touched, by the names the page shows, so a search for "green dot" finds them. */
  function rowAccounts(t: Transaction): string[] {
    return [t.accountId, t.sourceAccountId, t.targetAccountId].flatMap((id) => {
      const account = id ? accountsById.get(id) : undefined;
      return account ? [account.name, accountLabel(account)] : [];
    });
  }

  const filteredDeleted = (deletedHistory ?? [])
    .filter((record) => {
      if (person === "overall") return true;
      return record.transactions.some(
        (t) =>
          t.person === person ||
          t.paidByPerson === person ||
          t.expenseOwner === person ||
          t.beneficiaryPerson === person ||
          (t.expenseShares?.[person] ?? 0) > 0
      );
    })
    .filter((record) => {
      if (typeFilter === "all") return true;
      return record.transactions.some((t) => t.type === typeFilter);
    })
    .filter((record) =>
      isWithinDateRange(
        { date: record.deletedAt.slice(0, 10), timestamp: record.deletedAt },
        bounds.start,
        bounds.end
      )
    )
    .sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));

  return (
    <CompactPageShell
      title="History"
      subtitle={
        view === "active"
          ? categoryParam
            ? `${filtered.length} · ${categoryParam}`
            : `${filtered.length} of ${transactions.length} transactions`
          : `${filteredDeleted.length} deleted records`
      }
      personOverall
      personFilter={person}
      onPersonFilterChange={setPerson}
      action={
        <GlassButton variant="danger" size="sm" onClick={() => setShowResetConfirm(true)}>
          <RotateCcw className="w-3.5 h-3.5" />
          Reset
        </GlassButton>
      }
    >
      <div className="glass rounded-xl p-0.5 flex gap-0.5">
        <button
          type="button"
          onClick={() => setView("active")}
          className={cn(
            "flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors",
            view === "active" ? "glass-pill" : "text-muted"
          )}
        >
          Active
        </button>
        <button
          type="button"
          onClick={() => setView("deleted")}
          className={cn(
            "flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors",
            view === "deleted"
              ? "bg-negative text-white"
              : "text-muted"
          )}
        >
          Deleted ({filteredDeleted.length})
        </button>
      </div>

      <MonthRangeFilter
        value={dateRange}
        onChange={setDateRange}
        monthOptions={monthOptions}
      />

      {/* The same rows, by day, as one line — so a spike is seen before it is
          read. Follows every filter above, so it is always the list below. */}
      {view === "active" && filtered.length > 1
        ? (() => {
            const byDay = new Map<string, number>();
            for (const t of filtered) byDay.set(t.date, (byDay.get(t.date) ?? 0) + Math.abs(t.amount));
            const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-31);
            if (days.length < 2) return null;
            const peak = days.reduce((best, d) => (d[1] > best[1] ? d : best));
            return (
              <div className="glass flex items-center justify-between gap-3 rounded-xl px-3 py-2">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-muted">
                    {formatShortDate(days[0]![0])} – {formatShortDate(days[days.length - 1]![0])}
                  </p>
                  <p className="text-[11px] tabular-nums">
                    Busiest day <span className="font-semibold">{formatShortDate(peak[0])}</span>
                    <span className="text-muted"> · {formatCurrency(peak[1])}</span>
                  </p>
                </div>
                <Sparkline key={days.map((d) => d[1]).join(",")} points={days.map((d) => d[1])} />
              </div>
            );
          })()
        : null}

      {view === "active" ? (
        <label htmlFor="history-search" className="glass flex items-center gap-2 rounded-xl px-3 py-2">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
          <input
            id="history-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search: food, Costco, Green Dot, 19.67"
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-xs outline-none"
          />
          {query ? (
            <button type="button" onClick={() => setQuery("")} className="text-muted hover:text-foreground" aria-label="Clear the search">
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </label>
      ) : null}

      <div className="glass rounded-xl px-3 py-2 flex items-center gap-2">
        <Filter className="w-3.5 h-3.5 text-muted shrink-0" />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as TransactionType | "all")}
          className="bg-transparent outline-none text-xs flex-1"
        >
          <option value="all">All types</option>
          {Object.entries(typeLabels).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {hasDateFilter ? (
        <p className="flex items-center gap-1.5 px-1 text-[10px] text-muted">
          {query ? `Searching ${bounds.label} only` : `Filtered: ${bounds.label}`}
          {query ? (
            <button type="button" onClick={() => setDateRange({ ...dateRange, mode: "all" })} className="font-semibold text-accent">
              Search every month
            </button>
          ) : null}
        </p>
      ) : null}

      {linkedHighlightId ? (
        <p className="text-[10px] text-accent px-1">Linked from the shared balance</p>
      ) : null}

      {deleteError ? (
        <p className="text-xs text-negative bg-negative/10 rounded-2xl px-4 py-3">
          {deleteError}
        </p>
      ) : null}

      <GlassCard className="!p-0 overflow-hidden divide-y divide-black/5 dark:divide-white/10">
        {view === "deleted" ? (
          filteredDeleted.length === 0 ? (
            <p className="text-xs text-muted p-4 text-center">No deleted records</p>
          ) : (
            filteredDeleted.map((record) => (
              <div
                key={record.id}
                id={
                  record.transactions.some((t) => t.id === linkedHighlightId)
                    ? `history-txn-${linkedHighlightId}`
                    : undefined
                }
              >
                <DeletedHistoryCard record={record} />
              </div>
            ))
          )
        ) : filtered.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted">
            {query ? (
              <>
                Nothing matches &ldquo;{query}&rdquo;.{" "}
                <button type="button" onClick={() => setQuery("")} className="font-semibold text-accent">
                  Clear the search
                </button>
              </>
            ) : (
              "No transactions"
            )}
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {dayGroups.flatMap((day) => [
              // Each day under one heading with what went out and came in, newest first.
              <div
                key={`day-${day.date}`}
                className="flex items-baseline justify-between gap-2 bg-black/[0.02] px-3 pb-1.5 pt-3 dark:bg-white/[0.02]"
              >
                <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">{dayLabel(day.date)}</span>
                <span className="text-[10.5px] tabular-nums text-muted">
                  {day.out > 0 ? `${formatAmount(day.out)} out` : null}
                  {day.out > 0 && day.in > 0 ? " · " : null}
                  {day.in > 0 ? <span className="text-positive">+{formatAmount(day.in)} in</span> : null}
                </span>
              </div>,
              ...day.rows.map((transaction) => {
                const moneyIn = isMoneyIn(transaction);
                const accountId = transaction.type === "transfer" ? transaction.sourceAccountId : transaction.accountId;
                const account = accountId ? accountsById.get(accountId) : undefined;
                const meta = [
                  PERSON_LABELS[getTransactionActor(transaction)],
                  account ? accountLabel(account) : transaction.paymentMethod,
                  formatTime(transaction.date, transaction.time ?? "", transaction.timestamp),
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <motion.div
                    key={transaction.id}
                    id={`history-txn-${transaction.id}`}
                    layout={still ? false : "position"}
                    variants={still ? undefined : listRow}
                    initial={still ? false : "hidden"}
                    animate={still ? undefined : "shown"}
                    exit={still ? undefined : "gone"}
                    transition={transition}
                    className={cn(linkedHighlightId === transaction.id && "bg-accent/10 ring-2 ring-inset ring-accent/40")}
                  >
                    <HistoryRow
                      transaction={transaction}
                      icon={historyIcon(transaction, spendCategories)}
                      title={historyTitle(transaction)}
                      meta={meta}
                      // A move between your own accounts is neither in nor out.
                      amount={`${moneyIn ? "+" : transaction.type === "transfer" ? "" : "-"}${formatAmount(Math.abs(transaction.amount))}`}
                      amountTone={moneyIn ? "text-positive" : undefined}
                      left={leftAfter.get(transaction.id)}
                      accounts={accountsById}
                      onDelete={() => openDeleteConfirm(transaction)}
                    />
                  </motion.div>
                );
              }),
            ])}
          </AnimatePresence>
        )}
      </GlassCard>

      <GlassModal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title="Delete transaction?"
      >
        <p className="text-sm text-muted leading-relaxed">
          Removed from active History and saved in the deleted log.
        </p>
        {pendingDelete ? (
          <p className="text-sm font-medium mt-3 leading-snug">{pendingDelete.message}</p>
        ) : null}
        <div className="mt-4">
          <p className="text-sm font-medium mb-2">Who deleted this?</p>
          <div className="glass rounded-xl p-0.5 flex gap-0.5">
            {(["kushvanth", "g"] as Person[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setDeletedByChoice(p)}
                className={cn(
                  "flex-1 py-2 rounded-lg text-xs font-medium",
                  deletedByChoice === p ? "glass-pill" : "text-muted"
                )}
              >
                {PERSON_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <GlassButton className="flex-1" onClick={() => setPendingDelete(null)}>
            Cancel
          </GlassButton>
          <GlassButton variant="danger" className="flex-1" onClick={confirmDelete} disabled={isDeleting}>
            {isDeleting ? "Deleting…" : "Delete"}
          </GlassButton>
        </div>
      </GlassModal>

      <GlassModal
        open={showResetConfirm}
        onClose={() => {
          if (!isResetting) setShowResetConfirm(false);
        }}
        title="Reset all data?"
      >
        <p className="text-sm text-muted leading-relaxed">
          This clears active history and resets balances on this device and in the cloud. Deleted
          records stay in the Deleted tab.
        </p>
        <div className="flex gap-3 mt-5">
          <GlassButton
            className="flex-1"
            onClick={() => setShowResetConfirm(false)}
            disabled={isResetting}
          >
            Cancel
          </GlassButton>
          <GlassButton variant="danger" className="flex-1" onClick={handleReset} disabled={isResetting}>
            {isResetting ? "Resetting…" : "Reset"}
          </GlassButton>
        </div>
      </GlassModal>
    </CompactPageShell>
  );
}
