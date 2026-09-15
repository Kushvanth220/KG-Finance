"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Landmark, Settings2, Trash2 } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassModal } from "@/components/ui/glass-modal";
import { GlassButton } from "@/components/ui/glass-button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useFinanceStore } from "@/store/finance-store";
import { useRulesStore } from "@/store/rules-store";
import { reconcileFlex } from "@/lib/flex-income";
import { expectedPayouts, splitLanded, type ExpectedPayout } from "@/lib/flex-deposits";
import { confirmFlexDeposit, deleteFlexDeposit, reviseFlexDeposit } from "@/lib/flex-deposit-actions";
import { zonedToday } from "@/lib/zoned-date";
import { evaluateAmount } from "@/lib/amount-expression";
import { formatCurrency, formatDate, formatShortDate } from "@/lib/formatters";
import { FLEX_BLUE } from "@/lib/flex";
import type { Rule, RuleEntry } from "@/lib/rules/types";
import type { FlexDeposit } from "@/types";
import { cn } from "@/lib/utils";

/**
 * Where Flex money is: on its way, or landed.
 *
 * Expected payouts are grouped by the Tuesday or Friday they belong to, each
 * with a "Landed" button; tapping it asks what the bank actually showed and
 * writes the income for that day. Under that, the deposits already
 * confirmed, with the difference from what the blocks added up to — the
 * missing $20 has a date to be traced to.
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
  const [confirming, setConfirming] = useState<ExpectedPayout | null>(null);
  const [revising, setRevising] = useState<FlexDeposit | null>(null);
  const [removing, setRemoving] = useState<FlexDeposit | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [openDeposit, setOpenDeposit] = useState<string | null>(null);

  const today = zonedToday();
  const deposits = useMemo(
    () => [...(flexDeposits ?? [])].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [flexDeposits]
  );
  const depositAccounts = useMemo(
    () => accounts.filter((a) => a.person === "kushvanth" && a.type !== "credit"),
    [accounts]
  );
  const configured = Boolean(rule.payout.accountId && rule.payout.postFrom);
  const accountName = (id: string) => accounts.find((a) => a.id === id)?.name ?? "an account";

  const payouts = useMemo(
    () =>
      configured
        ? expectedPayouts(rule, entries, flexDeposits ?? [], incomeEntries, rule.payout.postFrom!, today)
        : [],
    [configured, rule, entries, flexDeposits, incomeEntries, today]
  );
  const recon = useMemo(
    () => reconcileFlex(rule, entries, incomeEntries, incomeSources),
    [rule, entries, incomeEntries, incomeSources]
  );
  const onItsWay = payouts.reduce((sum, p) => sum + p.total, 0);

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
            {configured ? accountName(rule.payout.accountId!) : "Set up"}
          </button>
        </div>

        {!configured ? (
          <div className="rounded-xl border border-dashed border-black/15 px-3 py-3 text-center dark:border-white/20">
            <p className="text-[12px] font-medium">Amazon pays on Tuesdays and Fridays.</p>
            <p className="mt-0.5 text-[11px] text-muted">
              Pick the account it lands in and the day to start counting from, and every payout will be
              listed here with a button for when it arrives.
            </p>
            <GlassButton size="sm" className="mt-2" onClick={() => setSettingsOpen(true)}>
              Set up deposits
            </GlassButton>
          </div>
        ) : (
          <>
            {/* The one-line reconciliation: what the blocks say versus what the bank says. */}
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
                <p className="text-[9px] uppercase tracking-wide text-muted">On its way</p>
                <p className={cn("text-[13px] font-semibold tabular-nums", onItsWay > 0 ? "text-[#ff9500]" : "text-muted")}>
                  {formatCurrency(onItsWay)}
                </p>
              </div>
            </div>

            {payouts.length === 0 ? (
              <p className="py-2 text-center text-[11px] text-muted">
                Nothing on its way — every block since {formatDate(rule.payout.postFrom!)} is deposited.
              </p>
            ) : (
              <div className="space-y-1.5">
                {payouts.map((payout) => {
                  const due = payout.status === "due";
                  return (
                    <div
                      key={payout.date}
                      className={cn(
                        "flex items-center gap-3 rounded-xl border px-3 py-2",
                        due && payout.overdueDays > 0
                          ? "border-[#ff9500]/40 bg-[#ff9500]/[0.07]"
                          : "border-black/5 bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.03]"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-semibold">
                          {weekday(payout.date)} {formatShortDate(payout.date)}
                          <span className="font-normal text-muted"> · {whenLabel(payout.date, today)}</span>
                        </p>
                        <p className="text-[10px] text-muted tabular-nums">
                          {payout.blocks} {payout.blocks === 1 ? "block" : "blocks"} · base {formatCurrency(payout.base)}
                          {payout.tips > 0 ? ` + tips ${formatCurrency(payout.tips)}` : ""}
                        </p>
                        {due && payout.overdueDays > 0 ? (
                          <p className="text-[10px] font-medium text-[#ff9500]">Not confirmed yet — did it land?</p>
                        ) : null}
                      </div>
                      <p className="shrink-0 text-[14px] font-semibold tabular-nums">{formatCurrency(payout.total)}</p>
                      <button
                        type="button"
                        onClick={() => setConfirming(payout)}
                        className={cn(
                          "hit inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold",
                          due ? "bg-[#34c759] text-white" : "glass text-[#34c759]"
                        )}
                      >
                        <Check className="h-3.5 w-3.5" /> Landed
                      </button>
                    </div>
                  );
                })}
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
                      const diff = Math.round((deposit.actual - deposit.expected) * 100) / 100;
                      const open = openDeposit === deposit.id;
                      const blocks = new Set(deposit.parts.map((p) => p.entryId)).size;
                      return (
                        <div key={deposit.id} className="py-1.5">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setOpenDeposit(open ? null : deposit.id)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <p className="text-[12px] font-medium">
                                {weekday(deposit.date)} {formatShortDate(deposit.date)}
                                <span className="font-normal text-muted">
                                  {" "}· {blocks} {blocks === 1 ? "block" : "blocks"} · {accountName(deposit.accountId)}
                                  {deposit.auto ? " · auto" : ""}
                                </span>
                              </p>
                              {deposit.note ? <p className="truncate text-[10px] text-muted">{deposit.note}</p> : null}
                            </button>
                            <div className="shrink-0 text-right">
                              <p className="text-[12px] font-semibold tabular-nums text-[#34c759]">{formatCurrency(deposit.actual)}</p>
                              {Math.abs(diff) >= 0.005 ? (
                                <p className={cn("text-[10px] font-medium tabular-nums", diff < 0 ? "text-[#ff3b30]" : "text-[#34c759]")}>
                                  {diff > 0 ? "+" : "−"}{formatCurrency(Math.abs(diff))} vs blocks
                                </p>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              onClick={() => setRevising(deposit)}
                              className="hit shrink-0 rounded-md px-1.5 py-1 text-[10px] font-semibold text-[#007aff] hover:bg-black/5 dark:hover:bg-white/10"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setRemoving(deposit)}
                              aria-label="Remove this deposit"
                              className="hit shrink-0 rounded-md p-1 text-[#ff3b30] hover:bg-black/5 dark:hover:bg-white/10"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {open ? (
                            <div className="mt-1 space-y-0.5 rounded-lg bg-black/[0.03] px-2 py-1.5 dark:bg-white/[0.04]">
                              {deposit.parts.map((part) => (
                                <p key={`${part.entryId}-${part.part}`} className="flex justify-between text-[10px] tabular-nums">
                                  <span className="text-muted">
                                    {formatShortDate(part.blockDate)} block · {part.part === "base" ? "base pay" : "tips"}
                                  </span>
                                  <span>{formatCurrency(part.amount)}</span>
                                </p>
                              ))}
                              <p className="flex justify-between border-t border-black/5 pt-1 text-[10px] font-semibold tabular-nums dark:border-white/10">
                                <span>Blocks added up to</span>
                                <span>{formatCurrency(deposit.expected)}</span>
                              </p>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}

            <p className="mt-2 text-[10px] text-muted">
              {rule.payout.autoPost
                ? "Payouts are written as income on their day by themselves; correct the amount here if the bank shows something else."
                : "Nothing is written as income until you tap Landed. Turn on payout-day confirmation in settings to skip the tap."}
            </p>
          </>
        )}
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

      {confirming ? (
        <LandedSheet
          key={confirming.date}
          title="Payout landed?"
          date={confirming.date}
          expectedBase={confirming.base}
          expectedTips={confirming.tips}
          accountId={rule.payout.accountId!}
          accounts={depositAccounts.map((a) => ({ id: a.id, name: a.name }))}
          today={today}
          onClose={() => setConfirming(null)}
          onSave={({ date, actual, accountId, note }) => {
            confirmFlexDeposit({ date, actual, accountId, note, parts: confirming.parts });
            setConfirming(null);
          }}
        />
      ) : null}

      {revising ? (
        <LandedSheet
          key={revising.id}
          title="Edit this deposit"
          date={revising.date}
          actual={revising.actual}
          note={revising.note}
          expectedBase={revising.parts.filter((p) => p.part === "base").reduce((s, p) => s + p.amount, 0)}
          expectedTips={revising.parts.filter((p) => p.part === "tip").reduce((s, p) => s + p.amount, 0)}
          accountId={revising.accountId}
          accounts={depositAccounts.map((a) => ({ id: a.id, name: a.name }))}
          today={today}
          onClose={() => setRevising(null)}
          onSave={(next) => {
            reviseFlexDeposit(revising.id, next);
            setRevising(null);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={removing !== null}
        title="Remove this deposit?"
        message={
          removing
            ? `The ${formatCurrency(removing.actual)} deposit on ${formatDate(removing.date)} and its income entries will be removed, and its blocks go back to "on its way".`
            : ""
        }
        confirmLabel="Remove deposit"
        onConfirm={() => {
          if (removing) deleteFlexDeposit(removing.id);
          setRemoving(null);
        }}
        onCancel={() => setRemoving(null)}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */

function LandedSheet({
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
            <label className="text-[11px] font-medium text-muted">Landed on</label>
            <input type="date" value={date} max={today} onChange={(e) => e.target.value && setDate(e.target.value)} className={field} />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted">Amount landed</label>
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
          <label className="text-[11px] font-medium text-muted">Into</label>
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
          <GlassButton variant="ghost" className="flex-1" onClick={onClose}>
            Cancel
          </GlassButton>
          <GlassButton className="flex-1" disabled={!canSave} onClick={() => onSave({ date, actual, accountId, note: note.trim() || undefined })}>
            {initialActual === undefined ? "Confirm" : "Save"}
          </GlassButton>
        </div>
      </div>
    </GlassModal>
  );
}

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
  onSave: (payout: { accountId: string; postFrom: string; autoPost: boolean }) => void;
}) {
  const today = zonedToday();
  const [accountId, setAccountId] = useState(rule.payout.accountId ?? accounts[0]?.id ?? "");
  const [postFrom, setPostFrom] = useState(rule.payout.postFrom ?? today);
  const [autoPost, setAutoPost] = useState(rule.payout.autoPost === true);
  const field = "mt-1 w-full glass rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#007aff]/40";

  return (
    <GlassModal open onClose={onClose} title="Deposit settings">
      <div className="space-y-3">
        <div>
          <label className="text-[11px] font-medium text-muted">Flex pays into</label>
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
          <label className="text-[11px] font-medium text-muted">Count blocks from</label>
          <input type="date" value={postFrom} max={today} onChange={(e) => e.target.value && setPostFrom(e.target.value)} className={field} />
          <p className="mt-1 text-[10px] text-muted">
            Blocks before this day were deposited by hand already and are never asked about. Use the day after
            your last hand-logged Flex deposit.
          </p>
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
            <span className="font-semibold">Confirm on payout day automatically</span>
            <span className="block text-[11px] text-muted">
              Each Tuesday and Friday the expected amount is written as income without a tap. You can still
              correct it to what the bank shows. Off means nothing is written until you tap Landed.
            </span>
          </span>
        </label>

        <div className="flex gap-2">
          <GlassButton variant="ghost" className="flex-1" onClick={onClose}>
            Cancel
          </GlassButton>
          <GlassButton className="flex-1" disabled={!accountId || !postFrom} onClick={() => onSave({ accountId, postFrom, autoPost })}>
            Save
          </GlassButton>
        </div>
      </div>
    </GlassModal>
  );
}
