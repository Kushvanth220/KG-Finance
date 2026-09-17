"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Landmark, Settings2 } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassModal } from "@/components/ui/glass-modal";
import { GlassButton } from "@/components/ui/glass-button";
import { useFinanceStore } from "@/store/finance-store";
import { useRulesStore } from "@/store/rules-store";
import { reconcileFlex } from "@/lib/flex-income";
import { FlexDayDepositControl, useFlexDayDeposits } from "@/components/flex/flex-day-deposit";
import { formatCurrency, formatShortDate } from "@/lib/formatters";
import { FLEX_BLUE } from "@/lib/flex";
import type { Rule, RuleEntry } from "@/lib/rules/types";
import { cn } from "@/lib/utils";

/**
 * Where Flex money is: deposited, or not yet.
 *
 * Three numbers, then the driven days whose money has not been deposited —
 * each with the same "Deposited" button the History list has — and, folded
 * away, every deposit made so far, each editable.
 */

function weekday(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" });
}

function whenLabel(date: string, today: string): string {
  if (date === today) return "today";
  const days = Math.round((new Date(`${date}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) / 86_400_000);
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

export function FlexDepositsCard({ rule, entries }: { rule: Rule; entries: RuleEntry[] }) {
  const incomeEntries = useFinanceStore((state) => state.incomeEntries);
  const incomeSources = useFinanceStore((state) => state.incomeSources);
  const accounts = useFinanceStore((state) => state.accounts);
  const flexDeposits = useFinanceStore((state) => state.flexDeposits);
  const updateRule = useRulesStore((state) => state.updateRule);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  const { ledger, statusFor, today } = useFlexDayDeposits(rule, entries);
  const deposits = useMemo(
    () => [...(flexDeposits ?? [])].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [flexDeposits]
  );
  const depositAccounts = useMemo(
    () => accounts.filter((a) => a.person === "kushvanth" && a.type !== "credit"),
    [accounts]
  );
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? "removed account";
  const hasAccount = Boolean(rule.payout.accountId) && accounts.some((a) => a.id === rule.payout.accountId);

  const recon = useMemo(
    () => reconcileFlex(rule, entries, incomeEntries, incomeSources),
    [rule, entries, incomeEntries, incomeSources]
  );
  const notYet = ledger.pending.reduce((sum, p) => sum + p.total, 0);

  return (
    <>
      <GlassCard className="!p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold">
            <Landmark className="h-3.5 w-3.5" style={{ color: FLEX_BLUE }} /> Deposits
          </p>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="hit inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-[11px] font-medium text-[#007aff] hover:bg-black/5 dark:hover:bg-white/10"
          >
            <Settings2 className="h-3.5 w-3.5" />
            {hasAccount ? accountName(rule.payout.accountId!) : "Settings"}
          </button>
        </div>

        <div className="mb-2 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-black/[0.03] px-2 py-1.5 dark:bg-white/[0.04]">
            <p className="text-[9px] uppercase tracking-wide text-muted">Earned</p>
            <p className="text-[13px] font-semibold tabular-nums">{formatCurrency(recon.earned)}</p>
          </div>
          <div className="rounded-xl bg-black/[0.03] px-2 py-1.5 dark:bg-white/[0.04]">
            <p className="text-[9px] uppercase tracking-wide text-muted">Deposited</p>
            <p className="text-[13px] font-semibold tabular-nums text-[#34c759]">{formatCurrency(recon.deposited)}</p>
          </div>
          <div className="rounded-xl bg-black/[0.03] px-2 py-1.5 dark:bg-white/[0.04]">
            <p className="text-[9px] uppercase tracking-wide text-muted">Not yet</p>
            <p className={cn("text-[13px] font-semibold tabular-nums", notYet > 0 ? "text-[#ff9500]" : "text-muted")}>
              {formatCurrency(notYet)}
            </p>
          </div>
        </div>

        {ledger.pending.length === 0 ? (
          <p className="py-2 text-center text-[11px] text-muted">Every day driven so far is deposited.</p>
        ) : (
          <div className="space-y-1.5">
            {ledger.pending.map((payout) => (
              <div
                key={payout.date}
                className="flex items-center gap-3 rounded-xl border border-black/5 bg-black/[0.02] px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold">
                    {weekday(payout.date)} {formatShortDate(payout.date)}
                    <span className="font-normal text-muted"> · driven {whenLabel(payout.date, today)}</span>
                  </p>
                  <p className="text-[10px] text-muted tabular-nums">
                    {payout.blocks} {payout.blocks === 1 ? "block" : "blocks"} · base {formatCurrency(payout.base)}
                    {payout.tips > 0 ? ` + tips ${formatCurrency(payout.tips)}` : ""}
                  </p>
                </div>
                <p className="shrink-0 text-[14px] font-semibold tabular-nums">{formatCurrency(payout.total)}</p>
                <FlexDayDepositControl rule={rule} date={payout.date} status={statusFor(payout.date)} today={today} size="md" />
              </div>
            ))}
          </div>
        )}

        {deposits.length > 0 ? (
          <div className="mt-2 border-t border-black/5 pt-2 dark:border-white/10">
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              className="hit flex w-full items-center justify-between text-[11px] font-semibold"
              aria-expanded={historyOpen}
            >
              <span>
                Deposits so far <span className="text-muted">({deposits.length})</span>
              </span>
              <ChevronDown className={cn("h-3.5 w-3.5 text-muted transition-transform", historyOpen && "rotate-180")} />
            </button>
            {historyOpen ? (
              <div className="mt-1.5 divide-y divide-black/5 dark:divide-white/[0.07]">
                {deposits.map((deposit) => {
                  const blockDates = [...new Set(deposit.parts.map((p) => p.blockDate))].sort();
                  const blocks = new Set(deposit.parts.map((p) => p.entryId)).size;
                  const firstDay = blockDates[0] ?? deposit.date;
                  return (
                    <div key={deposit.id} className="flex items-center gap-3 py-1.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-medium tabular-nums">
                          {formatCurrency(deposit.actual)}
                          <span className="font-normal text-muted"> · {blocks} {blocks === 1 ? "block" : "blocks"} of {blockDates.map(formatShortDate).join(", ")}</span>
                        </p>
                        {deposit.note ? <p className="truncate text-[10px] text-muted">{deposit.note}</p> : null}
                      </div>
                      <FlexDayDepositControl rule={rule} date={firstDay} status={{ kind: "deposited", deposit }} today={today} />
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}

        <p className="mt-2 text-[10px] text-muted">
          Tap Deposited on a day once the money is in the bank — it asks for the date, amount and account, and
          everything can be changed later. Flex income recorded on the Income page counts too.
        </p>
      </GlassCard>

      {/* Mounted fresh each time, so the form always opens on the saved settings. */}
      {settingsOpen ? (
        <DepositSettings
          onClose={() => setSettingsOpen(false)}
          rule={rule}
          accounts={depositAccounts.map((a) => ({ id: a.id, name: a.name }))}
          onSave={(payout) => {
            updateRule(rule.id, { payout: { ...rule.payout, kind: "income", ...payout } });
            setSettingsOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Settings                                                             */
/* ------------------------------------------------------------------ */

function DepositSettings({
  onClose,
  rule,
  accounts,
  onSave,
}: {
  onClose: () => void;
  rule: Rule;
  accounts: { id: string; name: string }[];
  onSave: (payout: { accountId: string; autoPost: boolean }) => void;
}) {
  const [accountId, setAccountId] = useState(rule.payout.accountId ?? accounts[0]?.id ?? "");
  const [autoPost, setAutoPost] = useState(rule.payout.autoPost === true);
  const field = "mt-1 w-full glass rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#007aff]/40";

  return (
    <GlassModal open onClose={onClose} title="Deposit settings">
      <div className="space-y-3">
        <div>
          <label className="text-[11px] font-medium text-muted">Usually deposited into</label>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={field}>
            {accounts.length === 0 ? <option value="">Add a bank account first</option> : null}
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[10px] text-muted">Preselected in the Deposited form; you can still pick another account each time.</p>
        </div>

        <label className="flex items-start gap-3 rounded-xl border border-black/10 p-3 dark:border-white/15">
          <button
            type="button"
            role="switch"
            aria-checked={autoPost}
            onClick={() => setAutoPost((v) => !v)}
            className={cn("relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors", autoPost ? "bg-[#34c759]" : "bg-black/15 dark:bg-white/20")}
          >
            <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform", autoPost ? "translate-x-4" : "translate-x-0.5")} />
          </button>
          <span className="text-[12px]">
            <span className="font-semibold">Deposit automatically on the expected day</span>
            <span className="block text-[11px] text-muted">
              Writes each day&apos;s money as Flex income by itself about two days after driving. Leave this off
              if you tap Deposited yourself — otherwise the same money is written twice.
            </span>
          </span>
        </label>

        <div className="flex gap-2">
          <GlassButton variant="ghost" className="flex-1" onClick={onClose}>
            Cancel
          </GlassButton>
          <GlassButton className="flex-1" disabled={!accountId} onClick={() => onSave({ accountId, autoPost })}>
            Save
          </GlassButton>
        </div>
      </div>
    </GlassModal>
  );
}
