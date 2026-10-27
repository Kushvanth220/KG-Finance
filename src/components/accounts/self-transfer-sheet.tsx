"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpDown } from "lucide-react";
import { GlassModal } from "@/components/ui/glass-modal";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassButton } from "@/components/ui/glass-button";
import { useFinanceStore } from "@/store/finance-store";
import { getAccountsForPerson } from "@/lib/accounts";
import { evaluateAmount, hasOperator } from "@/lib/amount-expression";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { describeTransferEffect } from "@/lib/self-transfer";
import { zonedToday, zonedYesterday } from "@/lib/zoned-date";
import { PERSON_LABELS, type Account, type Person } from "@/types";
import { cn } from "@/lib/utils";

/**
 * A self transfer: your own money from one of your accounts to another — cash
 * paid into BofA, BofA onto a card. Nothing is spent or earned; both balances
 * move and History gets one row saying so. Render it only while open, so each
 * opening starts fresh.
 */

const TYPE_LABEL: Record<Account["type"], string> = { cash: "Cash", debit: "Bank", credit: "Card" };

/** What a chip shows under the name: money held, or owed on a card. */
function balanceLine(account: Account): string {
  return account.type === "credit" ? `${formatCurrency(account.balance)} owed` : formatCurrency(account.balance);
}

export function SelfTransferSheet({
  person: initialPerson,
  fromAccountId,
  onClose,
  onDone,
}: {
  person: Person;
  /** Start with this account as the one the money leaves. */
  fromAccountId?: string;
  onClose: () => void;
  /** After the move is recorded, with the History row's id. */
  onDone?: (transactionId: string) => void;
}) {
  const { accounts, transferBetweenAccounts } = useFinanceStore();
  const [person, setPerson] = useState(initialPerson);
  const mine = useMemo(() => getAccountsForPerson(accounts, person), [accounts, person]);

  const [fromId, setFromId] = useState(
    () =>
      mine.find((a) => a.id === fromAccountId)?.id ??
      mine.find((a) => a.type === "cash")?.id ??
      mine[0]?.id ??
      ""
  );
  const [toId, setToId] = useState(() => mine.find((a) => a.type === "debit" && a.id !== fromId)?.id ?? "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(zonedToday());
  const [notes, setNotes] = useState("");

  const from = mine.find((a) => a.id === fromId);
  const to = mine.find((a) => a.id === toId && a.id !== fromId);
  const value = evaluateAmount(amount) ?? 0;
  const ready = !!from && !!to && value > 0;

  const switchPerson = (next: Person) => {
    setPerson(next);
    const theirs = getAccountsForPerson(accounts, next);
    const nextFrom = theirs.find((a) => a.type === "cash")?.id ?? theirs[0]?.id ?? "";
    setFromId(nextFrom);
    setToId(theirs.find((a) => a.type === "debit" && a.id !== nextFrom)?.id ?? "");
  };

  const pickFrom = (id: string) => {
    setFromId(id);
    if (id === toId) setToId("");
  };

  const swap = () => {
    if (!toId) return;
    setFromId(toId);
    setToId(fromId);
  };

  const save = () => {
    if (!ready) return;
    const id = transferBetweenAccounts({
      person,
      fromAccountId: from.id,
      toAccountId: to.id,
      amount: value,
      notes,
      date: date || zonedToday(),
    });
    if (id) onDone?.(id);
    onClose();
  };

  const chip = (active: boolean) =>
    cn(
      "flex flex-col items-start rounded-lg px-2.5 py-1.5 text-left text-[11px] font-semibold transition-colors",
      active ? "bg-accent text-white" : "glass text-muted hover:text-foreground"
    );

  const accountChips = (selected: string, onPick: (id: string) => void, skip?: string) =>
    mine
      .filter((a) => a.id !== skip)
      .map((a) => (
        <button key={a.id} type="button" onClick={() => onPick(a.id)} aria-pressed={a.id === selected} className={chip(a.id === selected)}>
          <span>{a.name}</span>
          <span className="text-[10px] font-normal tabular-nums opacity-80">
            {TYPE_LABEL[a.type]} · {balanceLine(a)}
          </span>
        </button>
      ));

  return (
    <GlassModal open onClose={onClose} title="Self transfer">
      <div className="space-y-4">
        <div className="glass flex gap-0.5 rounded-lg p-0.5" role="radiogroup" aria-label="Whose money">
          {(Object.keys(PERSON_LABELS) as Person[]).map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={person === p}
              onClick={() => switchPerson(p)}
              className={cn(
                "flex-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-all",
                person === p ? "bg-accent text-white shadow-sm" : "text-muted"
              )}
            >
              {PERSON_LABELS[p]}
            </button>
          ))}
        </div>

        {mine.length < 2 ? (
          <div className="space-y-3 text-sm">
            <p className="text-muted">
              A self transfer needs two accounts, and {PERSON_LABELS[person]} has{" "}
              {mine.length === 0 ? "none" : "only one"} yet.
            </p>
            <Link href="/accounts" className="font-semibold text-accent" onClick={onClose}>
              Add an account
            </Link>
          </div>
        ) : (
          <>
            <GlassInput
              label="Amount"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onBlur={() => {
                if (hasOperator(amount) && evaluateAmount(amount) !== null) setAmount(String(evaluateAmount(amount)));
              }}
              placeholder="0.00"
            />

            <div>
              <p className="px-1 text-sm font-medium text-muted">From</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">{accountChips(fromId, pickFrom)}</div>
            </div>

            <div className="flex justify-center">
              <button
                type="button"
                onClick={swap}
                disabled={!toId}
                aria-label="Swap from and to"
                className="hit flex h-8 w-8 items-center justify-center rounded-full glass text-accent disabled:opacity-40"
              >
                <ArrowUpDown className="h-4 w-4" />
              </button>
            </div>

            <div>
              <p className="px-1 text-sm font-medium text-muted">To</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">{accountChips(toId, setToId, fromId)}</div>
            </div>

            <div>
              <p className="px-1 text-sm font-medium text-muted">When?</p>
              <div className="mt-1.5 flex items-center gap-1.5">
                {[
                  { label: "Today", value: zonedToday() },
                  { label: "Yesterday", value: zonedYesterday() },
                ].map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => setDate(option.value)}
                    className={cn(
                      "rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors",
                      date === option.value ? "bg-accent text-white" : "glass text-muted hover:text-foreground"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
                <input
                  type="date"
                  value={date}
                  max={zonedToday()}
                  onChange={(e) => setDate(e.target.value)}
                  aria-label="Date"
                  className="glass min-w-0 flex-1 rounded-xl px-3 py-1.5 text-xs outline-none"
                />
              </div>
            </div>

            <GlassInput
              label="Note (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Deposited cash at the branch"
            />

            {ready ? (
              <div className="rounded-xl border border-accent/20 bg-accent/5 px-3 py-2 text-xs">
                <p className="font-medium">
                  {formatCurrency(value)} from {from.name} to {to.name}
                  {date && date !== zonedToday() ? ` on ${formatDate(date)}` : ""}
                </p>
                <p className="mt-0.5 text-[11px] text-muted">
                  {describeTransferEffect(from, to, value)} Not counted as spending or income.
                </p>
              </div>
            ) : null}

            <GlassButton className="w-full" onClick={save} disabled={!ready}>
              {ready ? `Move ${formatCurrency(value)}` : "Pick two accounts and an amount"}
            </GlassButton>
          </>
        )}
      </div>
    </GlassModal>
  );
}
