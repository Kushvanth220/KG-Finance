"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Filter, RotateCcw, Trash2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { listRow, transition } from "@/lib/motion-presets";
import { DeletedHistoryCard } from "@/components/history/deleted-history-card";
import { ActiveTransactionDetails } from "@/components/history/active-transaction-details";
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
import { formatCurrency, formatDateTime, compareByDateTime, isWithinDateRange } from "@/lib/formatters";
import {
  getTransactionDisplayMessage,
  getTransactionActor,
  isMoneyIn,
  isRefund,
} from "@/lib/transaction-messages";
import { forcePushNow, getActiveWorkspaceId } from "@/lib/supabase/sync";
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

const typeColors: Record<TransactionType, string> = {
  income: "text-positive",
  expense: "text-negative",
  transfer: "text-indigo",
  cash_withdrawal: "text-caution",
  cash_deposit: "text-positive",
  debt_payment: "text-accent",
  credit_payment: "text-accent",
  settlement: "text-feature",
  balance_adjustment: "text-muted",
};

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

  const { transactions, incomeEntries, deletedHistory, deleteTransaction, resetAllData } =
    useFinanceStore();
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
    .sort(compareByDateTime);

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
        <p className="text-[10px] text-muted px-1">Filtered: {bounds.label}</p>
      ) : null}

      {linkedHighlightId ? (
        <p className="text-[10px] text-accent px-1">Linked from the shared balance</p>
      ) : null}

      {deleteError ? (
        <p className="text-xs text-negative bg-negative/10 rounded-2xl px-4 py-3">
          {deleteError}
        </p>
      ) : null}

      <GlassCard className="!p-0 divide-y divide-black/5 dark:divide-white/10">
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
          <p className="text-xs text-muted p-4 text-center">No transactions</p>
        ) : (
          <AnimatePresence initial={false}>
          {filtered.map((transaction) => {
            const refund = isRefund(transaction);
            const isPositive = isMoneyIn(transaction);
            const message = getTransactionDisplayMessage(transaction);
            const actor = getTransactionActor(transaction);

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
                className={cn(
                  "flex items-start justify-between overflow-hidden px-3 py-2.5 gap-2 hover:bg-black/[0.02] dark:hover:bg-white/[0.02]",
                  linkedHighlightId === transaction.id &&
                    "bg-accent/10 ring-2 ring-inset ring-accent/40"
                )}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-accent/15 text-accent">
                      {PERSON_LABELS[actor]}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] font-medium px-1.5 py-0.5 rounded-md bg-black/5 dark:bg-white/5",
                        refund ? "text-positive" : typeColors[transaction.type]
                      )}
                    >
                      {refund ? "Refund" : typeLabels[transaction.type]}
                    </span>
                    <span className="text-[10px] text-muted">
                      {formatDateTime(transaction.date, transaction.time, transaction.timestamp)}
                    </span>
                  </div>
                  <p className="font-medium mt-1 text-xs leading-snug">{message}</p>
                  <ActiveTransactionDetails transaction={transaction} />
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span
                    className={cn(
                      "text-xs font-semibold tabular-nums whitespace-nowrap",
                      isPositive ? "text-positive" : "text-foreground"
                    )}
                  >
                    {isPositive ? "+" : "-"}
                    {formatCurrency(Math.abs(transaction.amount))}
                  </span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openDeleteConfirm(transaction);
                    }}
                    className="text-muted hover:text-negative p-1.5 rounded-lg hover:bg-negative/10"
                    aria-label="Delete transaction"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            );
          })}
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
