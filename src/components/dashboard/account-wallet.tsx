"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { GlassModal } from "@/components/ui/glass-modal";
import { StackSwitcher } from "@/components/ui/stack-switcher";
import { AnimatedMoney } from "@/components/ui/animated-number";
import { ACCOUNT_TYPE_META } from "@/components/accounts/account-type-meta";
import { useFinanceStore } from "@/store/finance-store";
import { getAvailableCredit, getCreditUtilization } from "@/lib/calculations";
import { compareByDateTime, formatCurrency, formatDate, formatPercent } from "@/lib/formatters";
import { isMoneyIn } from "@/lib/transaction-messages";
import { CREDIT_LABELS } from "@/lib/settlement";
import type { StackGeometry } from "@/lib/stack-pose";
import { PERSON_LABELS, type Account, type Person, type Transaction } from "@/types";
import { cn } from "@/lib/utils";

/**
 * Every account as a card in a stack you flick through: the phone's wallet.
 *
 * The Home grid answers "how much is where". This answers the next question,
 * which is always about one account — what it holds, what is left on the
 * card, what went through it last — so it shows one account at a time, with
 * the rest a flick away above and below.
 *
 * Phones only. On a wider screen the grid already shows every account at
 * once and a tile goes straight to its page; a stack there would hide what
 * already fits.
 *
 * "Latest" lists only rows where money moved through this account directly —
 * income into it, a spend or payment out of it — because those are the rows
 * whose direction the record alone makes certain (see transaction-reversal).
 * Transfers and cash-withdrawal bookkeeping stay on History, shown in full.
 */

const LATEST_TYPES = new Set<Transaction["type"]>(["income", "expense", "debt_payment", "credit_payment"]);
const LATEST_COUNT = 3;

const GEOMETRY: StackGeometry = { cardHeight: 236, gap: 12, top: 54, peek: 13, depth: 3 };

function latestLabel(transaction: Transaction): string {
  return transaction.category ?? transaction.notes ?? (transaction.type === "income" ? "Income" : "Payment");
}

function WalletCard({ account, latest }: { account: Account; latest: Transaction[] }) {
  const meta = ACCOUNT_TYPE_META[account.type];
  const isCard = account.type === "credit";
  const hasLimit = isCard && account.creditLimit != null && account.creditLimit > 0;

  return (
    <div
      className="flex h-full flex-col rounded-[var(--card-radius)] border border-black/5 p-4 shadow-[var(--glass-shadow)] dark:border-white/10"
      style={{
        // Opaque on purpose. See-through glass stacked nine deep turns to mud,
        // and the pile behind would show through the card in front.
        background: `linear-gradient(140deg, color-mix(in srgb, ${meta.tint} 24%, var(--modal-surface)), color-mix(in srgb, ${meta.tint} 6%, var(--modal-surface)) 72%)`,
      }}
    >
      {/* Left padding leaves the corner to the floating icon. */}
      <div className="flex items-center justify-between gap-2 pl-9">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: meta.tint }}>
            {meta.label}
          </span>
          {account.shared ? (
            <span className="rounded-full bg-cyan/15 px-1.5 py-0.5 text-[8px] font-semibold text-cyan">SHARED</span>
          ) : null}
        </span>
        <Link
          href={isCard ? "/debts" : "/accounts"}
          className="hit inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-accent"
        >
          {isCard ? "Debts" : "Manage"} <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <p className="mt-2.5 truncate text-[15px] font-semibold">{account.name}</p>

      <div className="mt-1 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-muted">{isCard ? CREDIT_LABELS.cardBalance : "Balance"}</p>
          <AnimatedMoney
            value={account.balance}
            className={cn("block text-2xl font-semibold tabular-nums", isCard && account.balance > 0 && "text-negative")}
          />
        </div>
        {hasLimit ? (
          <div className="shrink-0 text-right">
            <p className="text-[10px] text-muted">{CREDIT_LABELS.leftToSpend}</p>
            <p className="text-[13px] font-semibold text-positive tabular-nums">
              {formatCurrency(getAvailableCredit(account))}
            </p>
            <div className="mt-1 h-1 w-20 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${Math.min(100, getCreditUtilization(account))}%` }}
              />
            </div>
            <p className="mt-0.5 text-[9px] text-muted tabular-nums">{formatPercent(getCreditUtilization(account))} {CREDIT_LABELS.percentUsed}</p>
          </div>
        ) : null}
      </div>

      <div className="mt-3 min-h-0 flex-1 border-t border-black/5 pt-2 dark:border-white/10">
        <p className="text-[10px] uppercase tracking-wide text-muted">Latest</p>
        {latest.length === 0 ? (
          <p className="mt-1 text-[11px] text-muted">Nothing has gone in or out of {account.name} yet.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {latest.map((transaction) => {
              const moneyIn = isMoneyIn(transaction);
              return (
                <li key={transaction.id} className="flex items-baseline gap-2 text-[12px]">
                  <span className="min-w-0 flex-1 truncate">{latestLabel(transaction)}</span>
                  <span className="shrink-0 text-[10px] text-muted tabular-nums">
                    {formatDate(transaction.date, transaction.time, transaction.timestamp)}
                  </span>
                  <span className={cn("w-[72px] shrink-0 text-right font-semibold tabular-nums", moneyIn && "text-positive")}>
                    {moneyIn ? "+" : "-"}
                    {formatCurrency(Math.abs(transaction.amount))}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function WalletIcon({ account }: { account: Account }) {
  const meta = ACCOUNT_TYPE_META[account.type];
  const Icon = meta.icon;
  return (
    <span
      className="flex h-10 w-10 items-center justify-center rounded-full"
      style={{
        // Solid, so it reads on top of whichever card it is passing over.
        background: `color-mix(in srgb, ${meta.tint} 22%, var(--modal-surface))`,
        color: meta.tint,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${meta.tint} 45%, transparent), 0 6px 16px rgba(0, 0, 0, 0.22)`,
      }}
    >
      <Icon className="h-4 w-4" />
    </span>
  );
}

export function AccountWallet({
  open,
  onClose,
  person,
  accounts,
  initialAccountId,
}: {
  open: boolean;
  onClose: () => void;
  person: Person;
  /** In the order the Home grid shows them. */
  accounts: Account[];
  initialAccountId: string | null;
}) {
  const transactions = useFinanceStore((state) => state.transactions);

  const latest = useMemo(() => {
    const ids = new Set(accounts.map((account) => account.id));
    const byAccount = new Map<string, Transaction[]>();
    for (const transaction of transactions) {
      if (!transaction.accountId || !ids.has(transaction.accountId)) continue;
      if (!LATEST_TYPES.has(transaction.type)) continue;
      const list = byAccount.get(transaction.accountId) ?? [];
      list.push(transaction);
      byAccount.set(transaction.accountId, list);
    }
    for (const [id, list] of byAccount) {
      byAccount.set(id, list.sort(compareByDateTime).slice(0, LATEST_COUNT));
    }
    return byAccount;
  }, [accounts, transactions]);

  const initialIndex = Math.max(
    0,
    accounts.findIndex((account) => account.id === initialAccountId)
  );

  return (
    <GlassModal open={open} onClose={onClose} title={`Accounts · ${PERSON_LABELS[person]}`} fill>
      <StackSwitcher
        items={accounts}
        getKey={(account) => account.id}
        cardLabel={(account) => account.name}
        label={`${PERSON_LABELS[person]}'s accounts`}
        initialIndex={initialIndex}
        geometry={GEOMETRY}
        fadeTo="var(--modal-surface)"
        className="-mx-4 min-h-0 flex-1 sm:-mx-5"
        renderCard={(account) => <WalletCard account={account} latest={latest.get(account.id) ?? []} />}
        renderIcon={(account) => <WalletIcon account={account} />}
      />
    </GlassModal>
  );
}
