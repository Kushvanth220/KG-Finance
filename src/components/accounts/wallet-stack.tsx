"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeftRight, Pencil, Plus, SlidersHorizontal, Trash2 } from "lucide-react";
import { AnimatedMoney } from "@/components/ui/animated-number";
import { SharedAccountActivity } from "@/components/accounts/shared-account-activity";
import { getAvailableCredit, getCreditUtilization } from "@/lib/calculations";
import { compareByDateTime, formatAmount, formatCurrency, formatDate, formatPercent } from "@/lib/formatters";
import { isSharedAccount } from "@/lib/accounts";
import { roundMoney } from "@/lib/money";
import { CREDIT_LABELS } from "@/lib/settlement";
import { isMoneyIn } from "@/lib/transaction-messages";
import { PERSON_LABELS, type Account, type Transaction } from "@/types";
import { cn } from "@/lib/utils";

/**
 * The person's accounts as a wallet: a stack of cards, each showing its top
 * edge (name and balance) above the one in front of it, and the front card in
 * full. Tap any card and it slides to the front; everything for that account
 * (adding money, moving it, fixing the balance, renaming, deleting, its latest
 * rows and, for the shared one, who did what) sits right under the stack.
 *
 * The Green Dot card is one card in the stack on both people's tabs: its
 * face shows what the card holds and, under that, each person's part. Its
 * buttons work on the part belonging to whoever's tab it is.
 */

// How much of each card shows above the one in front of it.
const STRIP = 58;
const CARD_HEIGHT = 196;
const TYPE_ORDER: Record<Account["type"], number> = { debit: 0, cash: 1, credit: 2 };
const TYPE_LABEL: Record<Account["type"], string> = { debit: "Bank", cash: "Cash", credit: "Card" };
const LATEST = 4;

const EASE = [0.16, 1, 0.3, 1] as const;

function faceColors(account: Account, usedByBoth: boolean): [string, string] {
  if (usedByBoth) return ["#af52de", "#5856d6"];
  if (account.type === "credit") return ["#ff9f0a", "#c2410c"];
  if (account.type === "cash") return ["#2fb350", "#0f6b33"];
  return ["#0a84ff", "#5856d6"];
}

/** The balance as the card's edge says it: money held, or owed on a card. */
const edgeBalance = (account: Account) =>
  account.type === "credit" ? `${formatAmount(account.balance)} owed` : formatAmount(account.balance);

/** A row's words: what it was, as History would put it in a few words. */
function rowLabel(transaction: Transaction): string {
  if (transaction.type === "transfer") return transaction.paymentMethod ?? "Moved between accounts";
  return transaction.category ?? transaction.notes ?? (transaction.type === "income" ? "Income" : "Payment");
}

/** A row's amount from this account's side: in, out, or moved. */
function rowAmount(transaction: Transaction, accountId: string): { text: string; tone: string } {
  const money = formatAmount(Math.abs(transaction.amount));
  if (transaction.type === "transfer") {
    return { text: `${transaction.targetAccountId === accountId ? "+" : "−"}${money}`, tone: "text-accent" };
  }
  return isMoneyIn(transaction) ? { text: `+${money}`, tone: "text-positive" } : { text: `−${money}`, tone: "" };
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  tone = "default",
}: {
  icon: typeof Plus;
  label: string;
  onClick: () => void;
  tone?: "default" | "good" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl px-3 text-[12px] font-semibold transition-colors",
        tone === "good" && "bg-positive/15 text-positive hover:bg-positive/25",
        tone === "danger" && "bg-negative/10 text-negative hover:bg-negative/20",
        tone === "default" && "bg-accent/12 text-accent hover:bg-accent/20"
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden /> {label}
    </button>
  );
}

const NO_PARTS: Account[] = [];

// Whether $0 accounts are folded away: this phone's choice, folded unless opened.
const FOLD_KEY = "kg-fold-empty-accounts";
const foldListeners = new Set<() => void>();
let foldMemory = true;
function readFold(): boolean {
  try {
    const saved = window.localStorage.getItem(FOLD_KEY);
    return saved === null ? foldMemory : saved === "1";
  } catch {
    return foldMemory;
  }
}
function writeFold(next: boolean) {
  foldMemory = next;
  try {
    window.localStorage.setItem(FOLD_KEY, next ? "1" : "0");
  } catch {
    // Remembered for this visit only.
  }
  foldListeners.forEach((listener) => listener());
}
function subscribeFold(listener: () => void) {
  foldListeners.add(listener);
  return () => {
    foldListeners.delete(listener);
  };
}

/** Each person's part of the Green Dot card, on its face; the part these buttons change is lit. */
function CardParts({ parts, active, still }: { parts: Account[]; active: string; still: boolean }) {
  return (
    <div className="mt-2 grid grid-cols-2 gap-1.5">
      {parts.map((part, index) => (
        <motion.div
          key={part.id}
          initial={still ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={still ? { duration: 0 } : { delay: 0.15 + index * 0.08, duration: 0.45, ease: EASE }}
          className={cn(
            "min-w-0 rounded-xl px-2.5 py-1.5",
            part.id === active ? "bg-white/25 ring-1 ring-inset ring-white/45" : "bg-black/15"
          )}
        >
          <p className="truncate text-[9.5px] font-semibold uppercase tracking-[0.1em] opacity-85">
            {PERSON_LABELS[part.person]}&apos;s part
          </p>
          <AnimatedMoney value={part.balance} className="block text-[15px] font-semibold leading-tight tabular-nums" />
        </motion.div>
      ))}
    </div>
  );
}

export function WalletStack({
  accounts,
  greenDotParts = NO_PARTS,
  transactions,
  onAddAccount,
  onAddMoney,
  onTransfer,
  onAdjust,
  onRename,
  onDelete,
}: {
  /** This person's accounts. */
  accounts: Account[];
  /**
   * Every person's part of the Green Dot card. The one in `accounts` stands
   * for the whole card in the stack, and its buttons change that part.
   */
  greenDotParts?: Account[];
  transactions: Transaction[];
  onAddAccount: () => void;
  onAddMoney: (account: Account) => void;
  /** A self transfer starting from this account. */
  onTransfer: (account: Account) => void;
  onAdjust: (account: Account) => void;
  onRename: (account: Account) => void;
  onDelete: (account: Account) => void;
}) {
  const still = useReducedMotion();
  const [picked, setPicked] = useState<string | null>(null);

  // Banks first, then cash, then cards: the money you have before the money you owe.
  const sorted = useMemo(
    () =>
      accounts
        .map((account, index) => ({ account, index }))
        .sort((a, b) => TYPE_ORDER[a.account.type] - TYPE_ORDER[b.account.type] || a.index - b.index)
        .map(({ account }) => account),
    [accounts]
  );
  const partIds = useMemo(() => new Set(greenDotParts.map((part) => part.id)), [greenDotParts]);
  const cardTotal = roundMoney(greenDotParts.reduce((sum, part) => sum + part.balance, 0));
  const isCardPart = (account: Account) => partIds.has(account.id);
  const usedByBoth = (account: Account) => isSharedAccount(account) || isCardPart(account);

  // Accounts sitting at $0 fold into one line until opened, so the cards in use
  // aren't pushed down under the tab bar. Never all of them, and never Green Dot.
  const foldEmpty = useSyncExternalStore(subscribeFold, readFold, () => true);
  const empty = sorted.filter((account) => Math.abs(account.balance) < 0.005 && !isCardPart(account));
  const folded = foldEmpty && empty.length > 0 && empty.length < sorted.length;
  const shown = folded ? sorted.filter((account) => !empty.includes(account)) : sorted;

  // A card picked on the other person's tab, folded away or since deleted, falls back to the first.
  const front = shown.find((account) => account.id === picked) ?? shown[0];
  const stack = front ? [...shown.filter((account) => account.id !== front.id), front] : [];
  // The Green Dot card keeps its history in its own panel below, both people together.
  const frontIsCard = front != null && partIds.has(front.id);

  const latest = useMemo(() => {
    if (!front) return [];
    return transactions
      .filter((t) => t.accountId === front.id || t.sourceAccountId === front.id || t.targetAccountId === front.id)
      .sort(compareByDateTime)
      .slice(0, LATEST);
  }, [transactions, front]);

  if (!front) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[var(--card-radius)] border border-dashed border-black/15 px-4 py-10 text-center dark:border-white/20">
        <p className="text-sm font-semibold">No accounts yet</p>
        <p className="text-xs text-muted">Add a bank, a card or your cash wallet to start.</p>
        <button
          type="button"
          onClick={onAddAccount}
          className="inline-flex items-center gap-1 rounded-xl bg-accent px-3 py-2 text-[12px] font-semibold text-white"
        >
          <Plus className="h-3.5 w-3.5" /> Add account
        </button>
      </div>
    );
  }

  const credit = front.type === "credit";
  const used = credit && front.creditLimit != null ? getCreditUtilization(front) : null;

  return (
    <div className="space-y-3">
      {empty.length > 0 && empty.length < sorted.length ? (
        <div className="flex items-center justify-between gap-2 px-1 text-[11px] text-muted">
          <span>
            {folded
              ? `${empty.length} account${empty.length === 1 ? "" : "s"} at $0 folded away`
              : `Showing ${empty.length} account${empty.length === 1 ? "" : "s"} at $0`}
          </span>
          <button type="button" onClick={() => writeFold(!folded)} className="font-semibold text-accent">
            {folded ? "Show" : "Fold away"}
          </button>
        </div>
      ) : null}
      <div
        className="relative transition-[height] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{ height: (stack.length - 1) * STRIP + CARD_HEIGHT }}
      >
        {stack.map((account, place) => {
          const isFront = account.id === front.id;
          const isCard = isCardPart(account);
          const [from, to] = faceColors(account, usedByBoth(account));
          return (
            <motion.button
              key={account.id}
              type="button"
              onClick={() => setPicked(account.id)}
              aria-pressed={isFront}
              aria-label={isFront ? `${account.name}, in front` : `Bring ${account.name} to the front`}
              initial={false}
              animate={{ y: place * STRIP }}
              transition={still ? { duration: 0 } : { type: "spring", stiffness: 320, damping: 32 }}
              // A button centres what it holds; the card's name belongs on its top edge, where it shows in the stack.
              className="absolute inset-x-0 top-0 flex flex-col justify-start overflow-hidden rounded-[22px] p-4 text-left text-white shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.55)]"
              style={{ height: CARD_HEIGHT, zIndex: place, background: `linear-gradient(135deg, ${from}, ${to})` }}
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full"
                style={{ background: "radial-gradient(circle, rgba(255,255,255,0.22), transparent 65%)" }}
              />
              <div className="relative flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold">{account.name}</p>
                  <p className="text-[10.5px] opacity-85">
                    {TYPE_LABEL[account.type]}
                    {usedByBoth(account) ? " · used by both of you" : ""}
                  </p>
                </div>
                {isFront ? (
                  usedByBoth(account) ? (
                    <span className="shrink-0 rounded-md bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold">SHARED</span>
                  ) : null
                ) : (
                  <span className="shrink-0 text-[14px] font-semibold tabular-nums">
                    {isCard ? formatAmount(cardTotal) : edgeBalance(account)}
                  </span>
                )}
              </div>
              {isFront && isCard ? (
                <div className="absolute inset-x-4 bottom-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] opacity-85">On the card</p>
                  <AnimatedMoney value={cardTotal} className="block text-[26px] font-bold leading-tight tabular-nums" />
                  <CardParts parts={greenDotParts} active={account.id} still={Boolean(still)} />
                </div>
              ) : isFront ? (
                <div className="absolute inset-x-4 bottom-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] opacity-85">
                    {credit ? CREDIT_LABELS.cardBalance : "Available"}
                  </p>
                  <AnimatedMoney value={account.balance} className="block text-[28px] font-bold leading-tight tabular-nums" />
                  {credit && account.creditLimit != null ? (
                    <div className="mt-2">
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/25">
                        <div className="h-full rounded-full bg-white" style={{ width: `${Math.min(100, used ?? 0)}%` }} />
                      </div>
                      <p className="mt-1 text-[11px] opacity-90">
                        {formatPercent(used ?? 0)} {CREDIT_LABELS.percentUsed} · {formatCurrency(getAvailableCredit(account))}{" "}
                        {CREDIT_LABELS.leftToSpend.toLowerCase()} · limit {formatCurrency(account.creditLimit)}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </motion.button>
          );
        })}
      </div>
      {stack.length > 1 || frontIsCard ? (
        <p className="px-1 text-[10px] text-muted">
          {stack.length > 1 ? "Tap a card to bring it to the front." : null}
          {frontIsCard ? ` The buttons below change ${PERSON_LABELS[front.person]}'s part.` : null}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        {!credit ? <ActionButton icon={Plus} label="Add money" tone="good" onClick={() => onAddMoney(front)} /> : null}
        <ActionButton icon={ArrowLeftRight} label="Self transfer" onClick={() => onTransfer(front)} />
        <ActionButton
          icon={SlidersHorizontal}
          label={credit ? "Update balance" : "Fix balance"}
          onClick={() => onAdjust(front)}
        />
        <ActionButton icon={Pencil} label="Rename" onClick={() => onRename(front)} />
        <ActionButton icon={Trash2} label="Delete" tone="danger" onClick={() => onDelete(front)} />
      </div>

      {frontIsCard ? (
        <SharedAccountActivity />
      ) : (
        <>
          <div className="glass overflow-hidden rounded-xl">
            <div className="flex items-center justify-between border-b border-black/5 px-3 py-2 dark:border-white/10">
              <p className="text-xs font-semibold">Latest on {front.name}</p>
              <Link href="/history" className="text-[10px] font-medium text-accent">
                All in History
              </Link>
            </div>
            {latest.length === 0 ? (
              <p className="px-3 py-3 text-xs text-muted">Nothing on {front.name} yet.</p>
            ) : (
              <ul className="divide-y divide-black/5 dark:divide-white/10">
                {latest.map((transaction) => {
                  const amount = rowAmount(transaction, front.id);
                  return (
                    <li key={transaction.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">{rowLabel(transaction)}</p>
                        <p className="text-[10px] text-muted">{formatDate(transaction.date, transaction.time, transaction.timestamp)}</p>
                      </div>
                      <span className={cn("shrink-0 text-xs font-semibold tabular-nums", amount.tone)}>{amount.text}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {isSharedAccount(front) ? <SharedAccountActivity /> : null}
        </>
      )}
    </div>
  );
}
