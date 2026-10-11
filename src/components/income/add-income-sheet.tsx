"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Plus } from "lucide-react";
import { GlassModal } from "@/components/ui/glass-modal";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassButton } from "@/components/ui/glass-button";
import { useFinanceStore } from "@/store/finance-store";
import { getAccountsForPerson } from "@/lib/accounts";
import { formatCurrency } from "@/lib/formatters";
import { zonedToday, zonedYesterday } from "@/lib/zoned-date";
import { PERSON_LABELS, type Person } from "@/types";
import { cn } from "@/lib/utils";

/**
 * Income in one sheet, from anywhere: how much, from where, into which
 * account, and when.
 *
 * It makes the same entry as the Accounts page's "Add money" (the account is
 * credited and History gets its row), but here the account is chosen in the
 * sheet rather than first. The account and source this person used last are
 * already picked, since income mostly repeats. Render it only while open, so
 * each opening starts fresh.
 */
export function AddIncomeSheet({ person, onClose }: { person: Person; onClose: () => void }) {
  const { accounts, incomeSources, incomeEntries, addIncome, addIncomeSource } = useFinanceStore();

  const depositAccounts = useMemo(
    () => getAccountsForPerson(accounts, person).filter((a) => a.type !== "credit"),
    [accounts, person]
  );
  const sources = useMemo(() => incomeSources.filter((s) => s.person === person), [incomeSources, person]);

  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(zonedToday());
  const [notes, setNotes] = useState("");
  const [newSource, setNewSource] = useState<string | null>(null);
  // What this person used last, when it still exists.
  const [picked] = useState(() => {
    const last = incomeEntries
      .filter((e) => e.person === person)
      .sort((a, b) => b.date.localeCompare(a.date) || (b.time ?? "").localeCompare(a.time ?? ""))[0];
    return {
      accountId: depositAccounts.some((a) => a.id === last?.depositAccountId)
        ? last!.depositAccountId
        : (depositAccounts[0]?.id ?? ""),
      sourceId: sources.some((s) => s.id === last?.sourceId) ? last!.sourceId : (sources[0]?.id ?? ""),
    };
  });
  const [accountId, setAccountId] = useState(picked.accountId);
  const [sourceId, setSourceId] = useState(picked.sourceId);

  const account = depositAccounts.find((a) => a.id === accountId);
  const source = sources.find((s) => s.id === sourceId);
  const value = parseFloat(amount);
  const ready = !!account && !!source && value > 0;

  const saveSource = () => {
    const name = newSource?.trim();
    if (!name) return;
    const existing = sources.find((s) => s.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      setSourceId(existing.id);
    } else {
      addIncomeSource(person, name);
      const created = useFinanceStore
        .getState()
        .incomeSources.find((s) => s.person === person && s.name === name);
      if (created) setSourceId(created.id);
    }
    setNewSource(null);
  };

  const save = () => {
    if (!ready) return;
    addIncome({
      person,
      sourceId: source.id,
      amount: value,
      date: date || zonedToday(),
      notes: notes.trim() || undefined,
      depositType: account.type === "cash" ? "cash" : "debit",
      depositAccountId: account.id,
    });
    onClose();
  };

  const chip = (active: boolean) =>
    cn(
      "rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors",
      active ? "bg-positive text-white" : "glass text-muted hover:text-foreground"
    );

  return (
    <GlassModal open onClose={onClose} title={`Add income · ${PERSON_LABELS[person]}`}>
      {depositAccounts.length === 0 ? (
        <div className="space-y-3 text-sm">
          <p className="text-muted">Income lands in a bank or cash account, and {PERSON_LABELS[person]} has none yet.</p>
          <Link href="/accounts" className="font-semibold text-accent" onClick={onClose}>
            Add an account
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <GlassInput
            label="Amount"
            type="number"
            inputMode="decimal"
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
          />

          <div>
            <p className="px-1 text-sm font-medium text-muted">From</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {sources.map((s) => (
                <button key={s.id} type="button" onClick={() => setSourceId(s.id)} aria-pressed={s.id === sourceId} className={chip(s.id === sourceId)}>
                  {s.name}
                </button>
              ))}
              {newSource === null ? (
                <button type="button" onClick={() => setNewSource("")} className={cn(chip(false), "inline-flex items-center gap-1")}>
                  <Plus className="h-3 w-3" /> New source
                </button>
              ) : null}
            </div>
            {newSource !== null ? (
              <div className="mt-2 flex items-center gap-1.5">
                <input
                  autoFocus
                  value={newSource}
                  onChange={(e) => setNewSource(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveSource();
                    if (e.key === "Escape") setNewSource(null);
                  }}
                  placeholder="e.g. Salary, Campus job"
                  aria-label="New source name"
                  className="glass min-w-0 flex-1 rounded-xl px-3 py-2 text-sm outline-none"
                />
                <button type="button" onClick={saveSource} className="rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-white">
                  Add
                </button>
              </div>
            ) : null}
          </div>

          <div>
            <p className="px-1 text-sm font-medium text-muted">Into</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {depositAccounts.map((a) => (
                <button key={a.id} type="button" onClick={() => setAccountId(a.id)} aria-pressed={a.id === accountId} className={chip(a.id === accountId)}>
                  {a.name}
                  <span className="ml-1 font-normal opacity-75 tabular-nums">{formatCurrency(a.balance)}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="px-1 text-sm font-medium text-muted">When did you get it?</p>
            <div className="mt-1.5 flex items-center gap-1.5">
              {[
                { label: "Today", value: zonedToday() },
                { label: "Yesterday", value: zonedYesterday() },
              ].map((option) => (
                <button key={option.label} type="button" onClick={() => setDate(option.value)} className={chip(date === option.value)}>
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
            placeholder="e.g. Campus job shift, refund"
          />

          {ready ? (
            <div className="rounded-xl border border-positive/20 bg-positive/5 px-3 py-2 text-xs">
              {source.name} → {formatCurrency(value)} into {account.name}
              {date && date !== zonedToday() ? ` on ${format(new Date(`${date}T12:00:00`), "EEE d MMM")}` : ""}
            </div>
          ) : null}

          <GlassButton className="w-full" onClick={save} disabled={!ready}>
            Add & record income
          </GlassButton>
        </div>
      )}
    </GlassModal>
  );
}
