"use client";

import { useMemo, useState } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import { AnimatedMoney } from "@/components/ui/animated-number";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassModal } from "@/components/ui/glass-modal";
import { getGreenDotAccounts } from "@/lib/account-activity";
import { getGreenDotParts } from "@/lib/accounts";
import { formatAmount, formatCurrency, formatDate, formatDateTime } from "@/lib/formatters";
import { accountMovesSince, balancesAtStartOf } from "@/lib/running-balance";
import { zonedMonth, zonedToday } from "@/lib/zoned-date";
import { useFinanceStore } from "@/store/finance-store";
import { PERSON_LABELS, type Transaction } from "@/types";
import { cn } from "@/lib/utils";

/**
 * The Green Dot card for the two people who share it: how much each of them
 * has on it right now, and every entry since counting began — whose money it
 * moved, by how much, and what that person had left after it. Nothing else.
 *
 * Tap a name to see only that person's entries; tap it again for both.
 */

/** Entries shown before "Show all". */
const FOLD = 7;

/** "+$20.00" / "-$15.00": always with cents, so the column lines up. */
function signed(value: number) {
  return `${value < 0 ? "-" : "+"}${formatAmount(Math.abs(value))}`;
}

/** What an entry was, in a few words. */
function entryLabel(transaction: Transaction): string {
  if (transaction.type === "transfer") return transaction.paymentMethod ?? "Moved between accounts";
  if (transaction.type === "balance_adjustment") return transaction.notes ?? "Balance fix";
  return transaction.category ?? transaction.notes ?? (transaction.type === "income" ? "Income" : "Payment");
}

export function SharedAccountActivity() {
  const accounts = useFinanceStore((state) => state.accounts);
  const transactions = useFinanceStore((state) => state.transactions);
  const greenDotTrackingStartDate = useFinanceStore((state) => state.greenDotTrackingStartDate);
  const setGreenDotTrackingStartDate = useFinanceStore((state) => state.setGreenDotTrackingStartDate);

  // Counting starts on the chosen day, or this month's first when none was chosen.
  const since = greenDotTrackingStartDate ?? `${zonedMonth()}-01`;
  const sinceLabel = formatDate(since);

  const parts = useMemo(() => getGreenDotParts(accounts), [accounts]);
  // Each person's part; an old merged card stands alone under its own name.
  const holders = useMemo(
    () =>
      (parts.length ? parts : getGreenDotAccounts(accounts)).map((account) => ({
        account,
        name: parts.length ? PERSON_LABELS[account.person] : account.name,
      })),
    [parts, accounts]
  );
  const nameOf = (accountId: string) => holders.find((holder) => holder.account.id === accountId)?.name ?? "";

  const moves = useMemo(
    () =>
      accountMovesSince(
        since,
        holders.map((holder) => holder.account.id),
        accounts,
        transactions
      ),
    [since, holders, accounts, transactions]
  );

  const [only, setOnly] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const visible = only ? moves.filter(({ move }) => move.accountId === only) : moves;
  const shown = showAll ? visible : visible.slice(0, FOLD);

  // Starting fresh: count from a new day. Only the day moves; no entry and no balance changes.
  const [restartDay, setRestartDay] = useState<string | null>(null);
  const restartPreview = useMemo(
    () => (restartDay ? balancesAtStartOf(restartDay, accounts, transactions) : null),
    [restartDay, accounts, transactions]
  );
  const today = zonedToday();
  const restartValid = restartDay != null && restartDay <= today && restartDay !== greenDotTrackingStartDate;

  return (
    <>
      <div className="space-y-3 rounded-xl border border-feature/20 bg-feature/5 px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-feature">
            Green Dot · since {sinceLabel}
          </p>
          <GlassButton
            type="button"
            variant="ghost"
            size="sm"
            className="!px-2 !py-1 text-[10px] h-auto"
            onClick={() => setRestartDay(today)}
          >
            <RotateCcw className="h-3 w-3" /> Start fresh
          </GlassButton>
        </div>

        {holders.length ? (
          <div className="grid grid-cols-2 gap-2">
            {holders.map(({ account, name }) => {
              const picked = only === account.id;
              return (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => {
                    setOnly(picked ? null : account.id);
                    setShowAll(false);
                  }}
                  aria-pressed={picked}
                  className={cn(
                    "min-w-0 rounded-xl px-3 py-2 text-left transition-colors",
                    picked
                      ? "bg-feature/15 ring-1 ring-inset ring-feature/50"
                      : "bg-black/[0.03] hover:bg-black/[0.06] dark:bg-white/[0.04] dark:hover:bg-white/[0.07]"
                  )}
                >
                  <p className="truncate text-xs font-semibold">{name}</p>
                  <AnimatedMoney
                    value={account.balance}
                    className={cn(
                      "block text-xl font-semibold tabular-nums",
                      account.balance < 0 ? "text-negative" : "text-foreground"
                    )}
                  />
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted">No Green Dot account yet.</p>
        )}

        <div className="overflow-hidden rounded-xl bg-black/[0.03] dark:bg-white/[0.04]">
          <p className="border-b border-black/5 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted dark:border-white/10">
            {only ? `${nameOf(only)}'s history` : "History"}
          </p>
          {visible.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted">
              {only
                ? `Nothing for ${nameOf(only)} since ${sinceLabel} yet.`
                : `Nothing on Green Dot since ${sinceLabel} yet.`}
            </p>
          ) : (
            <ul className="divide-y divide-black/5 dark:divide-white/10">
              {shown.map(({ transaction, move }) => (
                <li key={`${transaction.id}-${move.accountId}`} className="flex items-start justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">{entryLabel(transaction)}</p>
                    <p className="text-[10px] text-muted">
                      {nameOf(move.accountId)} · {formatDateTime(transaction.date, transaction.time, transaction.timestamp)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p
                      className={cn(
                        "text-xs font-semibold tabular-nums",
                        move.change > 0 ? "text-positive" : "text-foreground"
                      )}
                    >
                      {signed(move.change)}
                    </p>
                    <p className={cn("text-[10px] tabular-nums", move.balance < 0 ? "text-negative" : "text-muted")}>
                      {formatAmount(move.balance)} left
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {visible.length > FOLD ? (
            <button
              type="button"
              onClick={() => setShowAll((open) => !open)}
              aria-expanded={showAll}
              className="flex w-full items-center justify-center gap-1 border-t border-black/5 py-2 text-[11px] font-semibold text-accent dark:border-white/10"
            >
              {showAll ? "Show fewer" : `Show all ${visible.length}`}
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showAll && "rotate-180")} />
            </button>
          ) : null}
        </div>
      </div>

      <GlassModal open={restartDay !== null} onClose={() => setRestartDay(null)} title="Start Green Dot fresh">
        <div className="space-y-4">
          <p className="text-xs text-muted leading-relaxed">
            The history here will start from the day you pick. Nothing is deleted and no balance changes:
            every older entry stays in History.
          </p>
          <div>
            <label htmlFor="greendot-restart-day" className="text-sm font-medium text-muted px-1">
              Start from
            </label>
            <input
              id="greendot-restart-day"
              type="date"
              value={restartDay ?? ""}
              max={today}
              onChange={(event) => setRestartDay(event.target.value)}
              className="glass rounded-2xl px-4 py-3 w-full mt-1.5 outline-none"
            />
          </div>
          {restartPreview ? (
            <div className="rounded-xl bg-black/[0.03] px-3 py-2 dark:bg-white/[0.04]">
              <p className="text-[10px] uppercase tracking-wide text-muted">
                What each had that morning · {restartDay ? formatDate(restartDay) : ""}
              </p>
              {parts.map((part) => (
                <div key={part.id} className="mt-1 flex items-center justify-between text-xs">
                  <span>{PERSON_LABELS[part.person]}</span>
                  <span className="font-semibold tabular-nums">{formatCurrency(restartPreview.get(part.id) ?? 0)}</span>
                </div>
              ))}
            </div>
          ) : null}
          <GlassButton
            className="w-full"
            disabled={!restartValid}
            onClick={() => {
              if (!restartValid || !restartDay) return;
              setGreenDotTrackingStartDate(restartDay);
              setRestartDay(null);
            }}
          >
            {restartDay === greenDotTrackingStartDate
              ? "Already starting from this day"
              : `Start from ${restartDay ? formatDate(restartDay) : "this day"}`}
          </GlassButton>
        </div>
      </GlassModal>
    </>
  );
}
