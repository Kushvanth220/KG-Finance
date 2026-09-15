"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import { ChevronRight, Info, Plus } from "lucide-react";
import { CompactPageShell } from "@/components/ui/compact-page-shell";
import { BetweenArt } from "@/components/art/page-art";
import { BalanceTimeline } from "@/components/balance/balance-timeline";
import { PaidDonut } from "@/components/balance/paid-donut";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassInput } from "@/components/ui/glass-input";
import { GlassModal } from "@/components/ui/glass-modal";
import { useFinanceStore } from "@/store/finance-store";
import { AnimatedMoney } from "@/components/ui/animated-number";
import { formatCurrency, parseAppDateTime } from "@/lib/formatters";
import { buildExternalBalanceMessage } from "@/lib/transaction-messages";
import { getSettlementSummary, getDisplaySettlementHistory } from "@/lib/settlement";
import {
  balanceTimeline,
  classifyEntry,
  monthDelta,
  monthPaid,
  owedSince,
  type EntryKind,
} from "@/lib/balance-insights";
import { PERSON_LABELS, type SettlementEntry, type Person } from "@/types";
import { cn } from "@/lib/utils";

const OTHER_PERSON: Record<Person, Person> = {
  kushvanth: "g",
  g: "kushvanth",
};

type Filter = "all" | "spend" | "outside" | "month";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "spend", label: "Spends" },
  { id: "outside", label: "Cash / outside" },
  { id: "month", label: "This month" },
];

const KIND_TINT: Record<EntryKind, string> = {
  spend: "#007aff",
  outside: "#ff9500",
  other: "#8e8e93",
};

interface Shown {
  entry: SettlementEntry;
  kind: EntryKind;
  linkedTransactionId?: string;
}

export default function BetweenPage() {
  const router = useRouter();
  const { settlementBalance, settlementHistory, transactions, recordExternalBalance } =
    useFinanceStore();

  const [showAdd, setShowAdd] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [paidBy, setPaidBy] = useState<Person>("g");
  const [benefited, setBenefited] = useState<Person>("kushvanth");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [filterPerson, setFilterPerson] = useState<Person | null>(null);
  const [filter, setFilter] = useState<Filter>("all");

  const parsedAmount = parseFloat(amount) || 0;
  const notesValid = notes.trim().length >= 3;
  const canSubmit = parsedAmount > 0 && paidBy !== benefited && notesValid;

  const previewMessage =
    parsedAmount > 0 && paidBy !== benefited
      ? buildExternalBalanceMessage({ paidBy, benefited, amount: parsedAmount })
      : null;

  const handleRecord = () => {
    if (!canSubmit) return;
    recordExternalBalance({
      paidBy,
      benefited,
      amount: parsedAmount,
      notes: notes.trim(),
    });
    setAmount("");
    setNotes("");
    setShowAdd(false);
  };

  // Whoever owes is the one most likely handing money over, so the sheet
  // opens pointed that way; the full balance is one tap, never pre-filled.
  const ower: Person = settlementBalance < 0 ? "kushvanth" : "g";
  const openAdd = () => {
    setPaidBy(ower);
    setBenefited(OTHER_PERSON[ower]);
    setAmount("");
    setNotes("");
    setShowAdd(true);
  };

  const balanceSummary = getSettlementSummary(settlementBalance);
  const sortedHistory = useMemo(
    () => getDisplaySettlementHistory(settlementHistory),
    [settlementHistory]
  );

  const timeline = useMemo(() => balanceTimeline(sortedHistory, 30), [sortedHistory]);
  const delta = useMemo(() => monthDelta(sortedHistory), [sortedHistory]);
  const since = useMemo(() => owedSince(sortedHistory), [sortedHistory]);
  const paidThisMonth = useMemo(() => monthPaid(sortedHistory), [sortedHistory]);

  const classified = useMemo<Shown[]>(
    () => sortedHistory.map((entry) => ({ entry, ...classifyEntry(entry, transactions) })),
    [sortedHistory, transactions]
  );

  const shown = useMemo(() => {
    const now = new Date();
    const monthKey = format(now, "yyyy-MM");
    return classified.filter(({ entry, kind }) => {
      if (filterPerson && entry.paidBy !== filterPerson) return false;
      if (filter === "spend") return kind === "spend";
      if (filter === "outside") return kind === "outside";
      if (filter === "month") return entry.date.startsWith(monthKey);
      return true;
    });
  }, [classified, filterPerson, filter]);

  // Newest first, grouped by day; the day header carries the balance at the
  // end of that day, so each row only has to say what it was.
  const groups = useMemo(() => {
    const out: { date: string; items: Shown[]; closing: number }[] = [];
    for (const item of shown) {
      const last = out[out.length - 1];
      if (last && last.date === item.entry.date) last.items.push(item);
      else out.push({ date: item.entry.date, items: [item], closing: item.entry.runningBalance });
    }
    return out;
  }, [shown]);

  // "up $220 this month · owed since May" — the figure's direction and age.
  const owedTo = settlementBalance > 0 ? "kushvanth" : "g";
  const storyLine = useMemo(() => {
    const parts: string[] = [];
    if (Math.abs(delta) >= 0.005) {
      const towardOwed = (delta > 0) === (settlementBalance > 0);
      parts.push(`${towardOwed ? "up" : "down"} ${formatCurrency(Math.abs(delta))} this month`);
    } else {
      parts.push("no change this month");
    }
    if (since && Math.abs(settlementBalance) >= 0.005) {
      parts.push(`owed to ${PERSON_LABELS[owedTo]} since ${format(since, "MM/dd/yyyy")}`);
    }
    return parts.join(" · ");
  }, [delta, since, settlementBalance, owedTo]);

  const monthName = format(new Date(), "MMMM");
  const hasFilter = filter !== "all" || filterPerson !== null;

  return (
    <CompactPageShell
      title="Shared Balance"
      subtitle="Shared balance — bank spends update automatically"
      action={
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowInfo(true)}
            className="hit flex h-8 w-8 items-center justify-center rounded-xl glass text-muted hover:text-foreground"
            aria-label="How the shared balance updates"
          >
            <Info className="h-4 w-4" />
          </button>
          <GlassButton size="sm" onClick={openAdd}>
            <Plus className="w-3.5 h-3.5" /> Add
          </GlassButton>
        </div>
      }
      className="max-w-lg"
    >
      <GlassCard strong className="!py-4 text-center space-y-1">
        {/* The arrow flies from whoever owes to whoever is owed, so the picture
            and the sentence under it can never disagree. */}
        <div className="mx-auto mb-1 h-24 max-w-[280px]">
          <BetweenArt
            balance={settlementBalance}
            showAmount={false}
            picked={filterPerson}
            onPick={(person) => setFilterPerson((current) => (current === person ? null : person))}
          />
        </div>
        <p className="text-xs text-muted">{balanceSummary.label}</p>
        <p className="text-3xl font-bold tracking-tight text-[#007aff] kg-figure">
          <AnimatedMoney value={balanceSummary.amount} />
        </p>
        <p className="text-[11px] text-muted tabular-nums">{storyLine}</p>

        <BalanceTimeline points={timeline} className="mx-auto mt-2 max-w-[320px] px-1 text-left" />

        <p className="text-[10px] text-muted">Tap a person to see what they paid.</p>
      </GlassCard>

      <GlassCard className="!p-0 overflow-hidden">
        {/* This month at a glance: who has been paying for whom. */}
        <div className="flex items-center gap-3 px-3 py-2.5">
          <PaidDonut paid={paidThisMonth} />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold">{monthName}</p>
            <p className="text-[11px] leading-snug text-muted tabular-nums">
              <span className="font-semibold text-[#007aff]">{PERSON_LABELS.kushvanth}</span> paid{" "}
              {formatCurrency(paidThisMonth.kushvanth)} for {PERSON_LABELS.g} ·{" "}
              <span className="font-semibold text-[#af52de]">{PERSON_LABELS.g}</span> paid{" "}
              {formatCurrency(paidThisMonth.g)} for {PERSON_LABELS.kushvanth}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto border-y border-black/5 px-3 py-2 dark:border-white/10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {FILTERS.map((item) => {
            const active = filter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={cn(
                  "hit shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
                  active ? "bg-[#007aff] text-white" : "glass text-muted"
                )}
                aria-pressed={active}
              >
                {item.label}
              </button>
            );
          })}
          {filterPerson ? (
            <button
              type="button"
              onClick={() => setFilterPerson(null)}
              className="hit shrink-0 rounded-full bg-[color-mix(in_srgb,var(--accent-cyan)_18%,transparent)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--accent-cyan)]"
            >
              {PERSON_LABELS[filterPerson]} paid ×
            </button>
          ) : null}
          <span className="ml-auto shrink-0 text-[10px] text-muted tabular-nums">
            {shown.length}{hasFilter ? ` of ${sortedHistory.length}` : ""}
          </span>
        </div>

        {shown.length === 0 ? (
          <p className="text-xs text-muted p-4 text-center">
            {hasFilter ? "Nothing matches this filter" : "No entries yet"}
          </p>
        ) : (
          <div>
            {groups.map((group) => (
              <div key={group.date}>
                <div className="sticky top-16 z-10 flex items-center justify-between bg-[var(--glass-bg)] px-3 py-1 text-[10px] backdrop-blur-md md:top-[72px]">
                  <span className="font-semibold uppercase tracking-wide text-muted">
                    {format(parseAppDateTime(group.date), "EEE MM/dd/yyyy")}
                  </span>
                  <span className="text-muted tabular-nums">
                    Bal <span className="font-semibold text-foreground">{formatCurrency(Math.abs(group.closing))}</span>
                  </span>
                </div>
                <div className="divide-y divide-black/5 dark:divide-white/10">
                  {group.items.map(({ entry, kind, linkedTransactionId }) => {
                    const isClickable = Boolean(linkedTransactionId);
                    const message =
                      entry.autoMessage ??
                      `${PERSON_LABELS[entry.paidBy]} paid ${formatCurrency(entry.amount)} for ${PERSON_LABELS[entry.benefited]}`;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        disabled={!isClickable}
                        onClick={() => {
                          if (linkedTransactionId) router.push(`/history?txn=${linkedTransactionId}`);
                        }}
                        className={cn(
                          "flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors",
                          isClickable && "hover:bg-[#007aff]/5 cursor-pointer"
                        )}
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: KIND_TINT[kind] }}
                          aria-label={kind === "spend" ? "From a spend" : kind === "outside" ? "Outside the accounts" : undefined}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium leading-snug">{message}</p>
                          <p className="flex items-center gap-1.5 text-[10px] text-muted">
                            <span className="shrink-0 tabular-nums">
                              {format(parseAppDateTime(entry.date, entry.time, entry.timestamp), "hh:mm a")}
                            </span>
                            {entry.notes && entry.notes !== entry.autoMessage ? (
                              <span className="min-w-0 truncate">· {entry.notes}</span>
                            ) : null}
                          </p>
                        </div>
                        <span
                          className={cn(
                            "shrink-0 text-sm font-semibold tabular-nums",
                            entry.paidBy === "kushvanth" ? "text-[#007aff]" : "text-[#af52de]"
                          )}
                        >
                          {formatCurrency(entry.amount)}
                        </span>
                        {isClickable ? <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted" /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      <GlassModal open={showInfo} onClose={() => setShowInfo(false)} title="How the shared balance updates">
        <div className="space-y-3 text-sm leading-relaxed">
          <p>
            <strong>Spend page</strong> — paying from a bank account for the other person, or for both of
            you, updates the balance and History automatically. Those rows show a{" "}
            <span className="inline-block h-2 w-2 rounded-full bg-[#007aff] align-middle" /> blue dot.
          </p>
          <p>
            <strong>Add button</strong> — for cash or money from outside your accounts (e.g.{" "}
            {PERSON_LABELS.g} gave you $1,000 from another source). It needs a note and shows
            in History with an <span className="inline-block h-2 w-2 rounded-full bg-[#ff9500] align-middle" />{" "}
            orange dot. It does not change any account balance.
          </p>
          <p className="text-muted">
            The arrow always points from whoever owes to whoever is owed; the line under the figure is
            the last 30 days of the balance.
          </p>
        </div>
      </GlassModal>

      <GlassModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title="Add outside money"
      >
        <div className="space-y-4">
          <p className="text-xs text-muted leading-relaxed">
            Money that moved between you but not through your linked accounts — cash, Zelle from
            another account, a gift. Account balances do not change.
          </p>

          <div>
            <p className="text-sm font-medium mb-2">Who gave the money?</p>
            <div className="glass rounded-xl p-0.5 flex gap-0.5">
              {(["kushvanth", "g"] as Person[]).map((person) => (
                <button
                  key={person}
                  type="button"
                  onClick={() => {
                    setPaidBy(person);
                    setBenefited(OTHER_PERSON[person]);
                  }}
                  className={cn(
                    "flex-1 py-2 rounded-lg text-xs font-medium transition-all",
                    paidBy === person ? "bg-[#007aff] text-white" : "text-muted"
                  )}
                >
                  {PERSON_LABELS[person]}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-muted">
              to {PERSON_LABELS[benefited]}
              {paidBy === ower && Math.abs(settlementBalance) >= 0.005
                ? ` — the way that brings the balance down`
                : ""}
            </p>
          </div>

          <div>
            <GlassInput
              label="Amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
            {Math.abs(settlementBalance) >= 0.005 && paidBy === ower ? (
              <button
                type="button"
                onClick={() => setAmount(String(Math.abs(settlementBalance)))}
                className="hit mt-1.5 rounded-full glass px-2.5 py-1 text-[11px] font-semibold text-[#007aff]"
              >
                Full balance · {formatCurrency(Math.abs(settlementBalance))}
              </button>
            ) : null}
          </div>

          <div>
            <GlassInput
              label="What is this for? (required)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={`e.g. ${PERSON_LABELS[paidBy]} sent it from another account`}
            />
            {!notesValid && notes.length > 0 && (
              <p className="text-[10px] text-muted mt-1">Please add at least a few words</p>
            )}
          </div>

          {previewMessage && (
            <div className="rounded-xl bg-[#34c759]/10 border border-[#34c759]/20 px-3 py-2 text-xs">
              <p className="font-semibold text-[#34c759] mb-0.5">Preview</p>
              <p>{previewMessage}</p>
              {notes.trim() && <p className="text-muted mt-1">Note: {notes.trim()}</p>}
              <p className="text-[10px] text-muted mt-1.5">
                Saved to the balance and History with today&apos;s date and time.
              </p>
            </div>
          )}

          <GlassButton className="w-full" onClick={handleRecord} disabled={!canSubmit}>
            Add to Balance
          </GlassButton>
        </div>
      </GlassModal>
    </CompactPageShell>
  );
}
