"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { ArrowDownLeft, ArrowUpRight, ChevronRight, SlidersHorizontal } from "lucide-react";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassModal } from "@/components/ui/glass-modal";
import { getGreenDotActivitySummary, getGreenDotLedgerEntries } from "@/lib/account-activity";
import { formatGreenDotTrackingLabel } from "@/lib/greendot-tracking";
import { formatCurrency, formatDateTime } from "@/lib/formatters";
import { useFinanceStore } from "@/store/finance-store";
import { PERSON_LABELS, type Person } from "@/types";

interface SharedAccountActivityProps {
  accountId: string;
  accountName: string;
}

function PersonActivityRow({
  person,
  earnedThisMonth,
  spentThisMonth,
  netThisMonth,
  adjustmentsThisMonth,
  onViewHistory,
}: {
  person: Person;
  earnedThisMonth: number;
  spentThisMonth: number;
  netThisMonth: number;
  adjustmentsThisMonth: number;
  onViewHistory: (person: Person) => void;
}) {
  // Net folds in balance corrections, so show them whenever they exist —
  // otherwise earned - spent visibly fails to equal the net underneath it.
  const hasAdjustment = Math.abs(adjustmentsThisMonth) > 0.009;
  return (
    <button
      type="button"
      onClick={() => onViewHistory(person)}
      className="w-full rounded-lg bg-black/[0.03] dark:bg-white/[0.04] px-2.5 py-2 space-y-2 text-left hover:bg-black/[0.06] dark:hover:bg-white/[0.07] transition-colors"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">{PERSON_LABELS[person]}</p>
        <ChevronRight className="w-3.5 h-3.5 text-muted shrink-0" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-[10px] text-muted flex items-center gap-1">
            <ArrowDownLeft className="w-3 h-3 text-[#34c759]" />
            Earned
          </p>
          <p className="text-sm font-bold text-[#34c759] tabular-nums">
            +{formatCurrency(earnedThisMonth)}
          </p>
        </div>
        <div>
          <p className="text-[10px] text-muted flex items-center gap-1">
            <ArrowUpRight className="w-3 h-3 text-[#ff3b30]" />
            Spent
          </p>
          <p className="text-sm font-bold text-[#ff3b30] tabular-nums">
            -{formatCurrency(spentThisMonth)}
          </p>
        </div>
      </div>
      {hasAdjustment ? (
        <div className="flex items-center justify-between text-[10px] border-t border-black/5 dark:border-white/10 pt-1.5">
          <span className="text-muted flex items-center gap-1">
            <SlidersHorizontal className="w-3 h-3" />
            Balance fixes
          </span>
          <span
            className={`font-semibold tabular-nums ${
              adjustmentsThisMonth >= 0 ? "text-[#34c759]" : "text-[#ff3b30]"
            }`}
          >
            {adjustmentsThisMonth >= 0 ? "+" : "-"}
            {formatCurrency(Math.abs(adjustmentsThisMonth))}
          </span>
        </div>
      ) : null}
      <div className="flex items-center justify-between text-[10px] border-t border-black/5 dark:border-white/10 pt-1.5">
        <span className="text-muted">Net this month</span>
        <span
          className={`font-semibold tabular-nums ${
            netThisMonth >= 0 ? "text-[#34c759]" : "text-[#ff3b30]"
          }`}
        >
          {netThisMonth >= 0 ? "+" : "-"}
          {formatCurrency(Math.abs(netThisMonth))}
        </span>
      </div>
    </button>
  );
}

export function SharedAccountActivity({ accountName }: SharedAccountActivityProps) {
  const accounts = useFinanceStore((state) => state.accounts);
  const transactions = useFinanceStore((state) => state.transactions);
  const greenDotTrackingStartDate = useFinanceStore((state) => state.greenDotTrackingStartDate);

  const [historyPerson, setHistoryPerson] = useState<Person | "all" | null>(null);

  const activity = useMemo(
    () => getGreenDotActivitySummary(accounts, transactions, new Date(), greenDotTrackingStartDate),
    [accounts, transactions, greenDotTrackingStartDate]
  );

  const monthLabel = format(new Date(), "MMMM");
  const trackingLabel = formatGreenDotTrackingLabel(greenDotTrackingStartDate);
  const monthRange = useMemo(() => {
    const now = new Date();
    const trackingStart = greenDotTrackingStartDate
      ? new Date(`${greenDotTrackingStartDate}T00:00:00`)
      : null;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    if (trackingStart && trackingStart > monthEnd) return null;

    return {
      start: trackingStart && trackingStart > monthStart ? trackingStart : monthStart,
      end: monthEnd,
    };
  }, [greenDotTrackingStartDate]);

  const ledgerEntries = useMemo(() => {
    if (!historyPerson || !monthRange) return [];
    return getGreenDotLedgerEntries(
      accounts,
      transactions,
      monthRange,
      historyPerson === "all" ? undefined : historyPerson,
      greenDotTrackingStartDate
    );
  }, [historyPerson, accounts, transactions, monthRange, greenDotTrackingStartDate]);

  const ledgerNet = ledgerEntries.reduce((sum, entry) => sum + entry.signedAmount, 0);

  return (
    <>
      <div className="rounded-xl border border-[#af52de]/20 bg-[#af52de]/5 px-3 py-2.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#af52de]">
              GreenDot · {monthLabel}
            </p>
            {trackingLabel ? (
              <p className="text-[10px] text-muted mt-0.5">
                New tracking since {trackingLabel} · started at $0
              </p>
            ) : null}
          </div>
          <GlassButton
            type="button"
            variant="ghost"
            size="sm"
            className="!px-2 !py-1 text-[10px] h-auto"
            onClick={() => setHistoryPerson("all")}
          >
            View all
          </GlassButton>
        </div>

        <PersonActivityRow
          person="kushvanth"
          {...activity.kushvanth}
          onViewHistory={setHistoryPerson}
        />
        <PersonActivityRow
          person="g"
          {...activity.g}
          onViewHistory={setHistoryPerson}
        />

        {Math.abs(activity.greenDotAdjustmentsThisMonth) > 0.009 && (
          <div className="flex items-center justify-between rounded-lg bg-black/[0.03] dark:bg-white/[0.04] px-2.5 py-2 text-[10px]">
            <span className="text-muted flex items-center gap-1">
              <SlidersHorizontal className="w-3 h-3" />
              GreenDot balance fixes
            </span>
            <span
              className={`font-semibold tabular-nums ${
                activity.greenDotAdjustmentsThisMonth >= 0 ? "text-[#34c759]" : "text-[#ff3b30]"
              }`}
            >
              {activity.greenDotAdjustmentsThisMonth >= 0 ? "+" : "-"}
              {formatCurrency(Math.abs(activity.greenDotAdjustmentsThisMonth))}
            </span>
          </div>
        )}

        <div className="rounded-lg border border-[#af52de]/15 px-2.5 py-2 text-[10px] space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-muted">Combined net · {monthLabel}</span>
            <span
              className={`font-semibold tabular-nums ${
                activity.combinedNetThisMonth >= 0 ? "text-[#34c759]" : "text-[#ff3b30]"
              }`}
            >
              {activity.combinedNetThisMonth >= 0 ? "+" : "-"}
              {formatCurrency(Math.abs(activity.combinedNetThisMonth))}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted">GreenDot balance</span>
            <span className="font-semibold tabular-nums">
              {formatCurrency(activity.currentBalance)}
            </span>
          </div>
        </div>

        <p className="text-[10px] text-muted px-0.5">
          Tap a name for GreenDot activity since{" "}
          {trackingLabel ?? "tracking started"}. Main History still keeps older lines.
        </p>
      </div>

      <GlassModal
        open={historyPerson !== null}
        onClose={() => setHistoryPerson(null)}
        title={
          historyPerson === "all"
            ? `GreenDot · ${monthLabel}`
            : `${PERSON_LABELS[historyPerson as Person]} · GreenDot · ${monthLabel}`
        }
      >
        {!monthRange || ledgerEntries.length === 0 ? (
          <p className="text-sm text-muted py-4 text-center">
            No GreenDot activity yet
            {trackingLabel ? ` since ${trackingLabel}` : ""}
            {historyPerson && historyPerson !== "all"
              ? ` for ${PERSON_LABELS[historyPerson]}`
              : ""}
            .
          </p>
        ) : (
          <>
            <div className="max-h-[60vh] overflow-y-auto divide-y divide-black/5 dark:divide-white/10 -mx-1">
              {ledgerEntries.map((entry) => (
                <div key={entry.id} className="px-1 py-2.5 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{entry.label}</p>
                    <p className="text-[10px] text-muted mt-0.5">
                      {PERSON_LABELS[entry.person]} ·{" "}
                      {formatDateTime(entry.date, entry.time, entry.timestamp)}
                    </p>
                    <p className="text-[10px] text-muted capitalize mt-0.5">{entry.kind}</p>
                  </div>
                  <p
                    className={`text-sm font-bold tabular-nums shrink-0 ${
                      entry.signedAmount >= 0 ? "text-[#34c759]" : "text-[#ff3b30]"
                    }`}
                  >
                    {entry.signedAmount >= 0 ? "+" : "-"}
                    {formatCurrency(Math.abs(entry.signedAmount))}
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-black/5 dark:border-white/10 flex items-center justify-between text-xs">
              <span className="text-muted">Net in this list</span>
              <span
                className={`font-bold tabular-nums ${
                  ledgerNet >= 0 ? "text-[#34c759]" : "text-[#ff3b30]"
                }`}
              >
                {ledgerNet >= 0 ? "+" : "-"}
                {formatCurrency(Math.abs(ledgerNet))}
              </span>
            </div>
          </>
        )}
      </GlassModal>
    </>
  );
}
