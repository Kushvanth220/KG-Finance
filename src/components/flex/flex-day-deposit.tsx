"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Check, Pencil } from "lucide-react";
import { GlassModal } from "@/components/ui/glass-modal";
import { GlassButton } from "@/components/ui/glass-button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useFinanceStore } from "@/store/finance-store";
import { useRulesStore } from "@/store/rules-store";
import { matchRecordedIncome, splitLanded, type ExpectedPayout } from "@/lib/flex-deposits";
import { confirmFlexDeposit, deleteFlexDeposit, reviseFlexDeposit } from "@/lib/flex-deposit-actions";
import { zonedToday } from "@/lib/zoned-date";
import { evaluateAmount } from "@/lib/amount-expression";
import { formatCurrency, formatDate, formatShortDate } from "@/lib/formatters";
import type { Rule, RuleEntry } from "@/lib/rules/types";
import type { FlexDeposit } from "@/types";
import { cn } from "@/lib/utils";

/**
 * "Deposited" for one day of Flex blocks.
 *
 * A day that has not been deposited shows a button; tapping it asks when the
 * money landed, how much, and into which account, then writes the income.
 * A day that has been deposited shows a chip with the account and date;
 * tapping it reopens the same form to change any of it, or take it back.
 *
 * Days already covered by Flex income recorded on the Income page show as
 * "Recorded" and link there, so nothing is ever written twice.
 */

export type DayDepositStatus =
  | { kind: "pending"; payout: ExpectedPayout }
  | { kind: "deposited"; deposit: FlexDeposit }
  | { kind: "recorded" };

/** Where every day of this rule's blocks stands, keyed by the day it was driven. */
export function useFlexDayDeposits(rule: Rule | undefined, entries: RuleEntry[]) {
  const incomeEntries = useFinanceStore((state) => state.incomeEntries);
  const incomeSources = useFinanceStore((state) => state.incomeSources);
  const flexDeposits = useFinanceStore((state) => state.flexDeposits);
  const today = zonedToday();

  return useMemo(() => {
    const deposits = flexDeposits ?? [];
    if (!rule) {
      const statusFor = (): DayDepositStatus => ({ kind: "recorded" });
      return { ledger: { pending: [] as ExpectedPayout[] }, statusFor, today };
    }
    const ledger = matchRecordedIncome(rule, entries, deposits, incomeEntries, incomeSources, today);
    const pendingByDate = new Map(ledger.pending.map((payout) => [payout.date, payout]));
    const depositByEntry = new Map<string, FlexDeposit>();
    for (const deposit of deposits) for (const part of deposit.parts) depositByEntry.set(part.entryId, deposit);

    const statusFor = (date: string): DayDepositStatus => {
      const pending = pendingByDate.get(date);
      if (pending) return { kind: "pending", payout: pending };
      const deposit = entries.find((entry) => entry.ruleId === rule.id && entry.date === date && depositByEntry.has(entry.id));
      if (deposit) return { kind: "deposited", deposit: depositByEntry.get(deposit.id)! };
      return { kind: "recorded" };
    };

    return { ledger, statusFor, today };
  }, [rule, entries, flexDeposits, incomeEntries, incomeSources, today]);
}

export function FlexDayDepositControl({
  rule,
  date,
  status,
  today,
  size = "sm",
}: {
  rule: Rule;
  date: string;
  status: DayDepositStatus;
  today: string;
  size?: "sm" | "md";
}) {
  const accounts = useFinanceStore((state) => state.accounts);
  const updateRule = useRulesStore((state) => state.updateRule);
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  const depositAccounts = useMemo(
    () => accounts.filter((a) => a.person === "kushvanth" && a.type !== "credit").map((a) => ({ id: a.id, name: a.name })),
    [accounts]
  );
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? "removed account";
  const pad = size === "md" ? "px-2.5 py-1.5 text-[11px]" : "px-2 py-1 text-[10px]";

  if (status.kind === "recorded") {
    return (
      <Link
        href="/income"
        className={cn("hit shrink-0 rounded-lg font-semibold text-muted hover:text-[#007aff]", pad)}
        title="Recorded as Flex income on the Income page — edit it there"
      >
        Recorded
      </Link>
    );
  }

  const deposit = status.kind === "deposited" ? status.deposit : null;
  const payout = status.kind === "pending" ? status.payout : null;
  // The account used last time is the likeliest one this time.
  const lastAccount = rule.payout.accountId && accounts.some((a) => a.id === rule.payout.accountId) ? rule.payout.accountId : depositAccounts[0]?.id ?? "";

  return (
    <>
      {deposit ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn("hit inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#34c759]/15 font-semibold text-[#34c759]", pad)}
          title={`Deposited ${formatCurrency(deposit.actual)} into ${accountName(deposit.accountId)} on ${formatDate(deposit.date)} — tap to edit`}
        >
          <Check className="h-3 w-3" />
          {formatShortDate(deposit.date)} · {accountName(deposit.accountId)}
          <Pencil className="h-2.5 w-2.5 opacity-70" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn("hit inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#34c759] font-semibold text-white", pad)}
        >
          <Check className="h-3 w-3" /> Deposited
        </button>
      )}

      {open ? (
        <FlexDepositSheet
          key={deposit?.id ?? date}
          title={deposit ? "Edit deposit" : `Deposited — blocks of ${formatShortDate(date)}`}
          date={deposit?.date ?? today}
          actual={deposit?.actual}
          note={deposit?.note}
          expectedBase={(deposit?.parts ?? payout?.parts ?? []).filter((p) => p.part === "base").reduce((s, p) => s + p.amount, 0)}
          expectedTips={(deposit?.parts ?? payout?.parts ?? []).filter((p) => p.part === "tip").reduce((s, p) => s + p.amount, 0)}
          accountId={deposit?.accountId ?? lastAccount}
          accounts={depositAccounts}
          today={today}
          onClose={() => setOpen(false)}
          onRemove={deposit ? () => setRemoving(true) : undefined}
          onSave={(next) => {
            if (deposit) {
              reviseFlexDeposit(deposit.id, next);
            } else if (payout) {
              confirmFlexDeposit({ ...next, parts: payout.parts });
            }
            if (next.accountId !== rule.payout.accountId) {
              updateRule(rule.id, { payout: { ...rule.payout, kind: "income", accountId: next.accountId } });
            }
            setOpen(false);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={removing}
        title="Remove this deposit?"
        message={
          deposit
            ? `The ${formatCurrency(deposit.actual)} deposit on ${formatDate(deposit.date)} and its income entries will be removed; the blocks go back to not deposited.`
            : ""
        }
        confirmLabel="Remove deposit"
        onConfirm={() => {
          if (deposit) deleteFlexDeposit(deposit.id);
          setRemoving(false);
          setOpen(false);
        }}
        onCancel={() => setRemoving(false)}
      />
    </>
  );
}

/** The form: when, how much, into which account. Base stays what Amazon quoted; tips take any difference. */
export function FlexDepositSheet({
  title,
  date: initialDate,
  actual: initialActual,
  note: initialNote,
  expectedBase,
  expectedTips,
  accountId: initialAccount,
  accounts,
  today,
  onClose,
  onSave,
  onRemove,
}: {
  title: string;
  date: string;
  actual?: number;
  note?: string;
  expectedBase: number;
  expectedTips: number;
  accountId: string;
  accounts: { id: string; name: string }[];
  today: string;
  onClose: () => void;
  onSave: (next: { date: string; actual: number; accountId: string; note?: string }) => void;
  onRemove?: () => void;
}) {
  const expected = Math.round((expectedBase + expectedTips) * 100) / 100;
  const [date, setDate] = useState(initialDate > today ? today : initialDate);
  const [amount, setAmount] = useState(String(initialActual ?? expected));
  const [accountId, setAccountId] = useState(initialAccount);
  const [note, setNote] = useState(initialNote ?? "");

  const actual = evaluateAmount(amount) ?? 0;
  const split = splitLanded(actual, expectedBase, expectedTips);
  const canSave = actual > 0 && Boolean(accountId) && Boolean(date);
  const field = "mt-1 w-full glass rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#007aff]/40";

  return (
    <GlassModal open onClose={onClose} title={title}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] font-medium text-muted">Deposited on</label>
            <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} className={field} />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted">Amount</label>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={cn(field, "font-semibold tabular-nums")}
              autoFocus
            />
          </div>
        </div>

        <div>
          <label className="text-[11px] font-medium text-muted">Deposited into</label>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={field}>
            {accounts.length === 0 ? <option value="">Add a bank account first</option> : null}
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[11px] font-medium text-muted">Note (optional)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. tip adjustment on Friday's block" className={field} />
        </div>

        <div className="rounded-xl border border-[#007aff]/25 bg-[#007aff]/[0.07] px-3 py-2 text-[11px] tabular-nums">
          <p className="flex justify-between">
            <span>Blocks added up to</span>
            <span className="font-semibold">{formatCurrency(expected)}</span>
          </p>
          <p className="flex justify-between text-muted">
            <span>Written as base pay</span>
            <span>{formatCurrency(split.base)}</span>
          </p>
          <p className="flex justify-between text-muted">
            <span>Written as tips</span>
            <span>{formatCurrency(split.tips)}</span>
          </p>
          {Math.abs(split.difference) >= 0.005 ? (
            <p className={cn("mt-1 font-medium", split.difference < 0 ? "text-[#ff3b30]" : "text-[#34c759]")}>
              {split.difference < 0
                ? `${formatCurrency(-split.difference)} less than the blocks — a tip adjusted, or a block missing.`
                : `${formatCurrency(split.difference)} more than the blocks — a tip came in higher, or a block isn't logged.`}
            </p>
          ) : (
            <p className="mt-1 font-medium text-[#34c759]">Matches the blocks exactly.</p>
          )}
        </div>

        <div className="flex gap-2">
          {onRemove ? (
            <GlassButton variant="ghost" className="text-[#ff3b30]" onClick={onRemove}>
              Remove
            </GlassButton>
          ) : null}
          <GlassButton variant="ghost" className="flex-1" onClick={onClose}>
            Cancel
          </GlassButton>
          <GlassButton className="flex-1" disabled={!canSave} onClick={() => onSave({ date, actual, accountId, note: note.trim() || undefined })}>
            Save
          </GlassButton>
        </div>
      </div>
    </GlassModal>
  );
}
