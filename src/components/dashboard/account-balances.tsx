"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Banknote, ChevronDown, ChevronRight, CreditCard, Landmark, Wallet } from "lucide-react";
import { AnimatedMoney } from "@/components/ui/animated-number";
import { useFinanceStore } from "@/store/finance-store";
import { getAccountsForPerson } from "@/lib/accounts";
import { roundMoney } from "@/lib/money";
import { formatCurrency } from "@/lib/formatters";
import type { Account, AccountType, Person } from "@/types";
import { cn } from "@/lib/utils";

/**
 * Every account as a small card in a grid, under one headline: what is
 * available. Ten text rows was a bank statement; a wall of cards is the
 * wallet.
 *
 * A grid, not a swipe row: a row that scrolls sideways cannot be moved with
 * a mouse wheel and pokes out of the card's rounded frame, so it looked
 * broken on the desktop and cramped on the phone. Six cards show, the rest
 * unfold.
 *
 * It reads the same store the Accounts page writes to, so the two cannot
 * drift — there is no second copy of a balance anywhere. Money held and
 * money owed stay visually apart: cards in red, the rest in the account's
 * own tint, and the card total named as what it is.
 */

const TYPE_META: Record<AccountType, { label: string; icon: typeof Wallet; tint: string }> = {
  debit: { label: "Bank", icon: Landmark, tint: "#34c759" },
  cash: { label: "Cash", icon: Banknote, tint: "#ffd60a" },
  credit: { label: "Card", icon: CreditCard, tint: "#ff3b30" },
};

/** Cards shown before "Show all": three rows of two on a phone. */
const FOLD = 6;

function AccountCard({ account }: { account: Account }) {
  const meta = TYPE_META[account.type];
  const Icon = meta.icon;
  const isCard = account.type === "credit";
  const left = isCard && account.creditLimit ? account.creditLimit - account.balance : null;

  return (
    <Link
      href={isCard ? "/debts" : "/accounts"}
      className="tap-card flex min-w-0 flex-col justify-between overflow-hidden rounded-xl border border-black/5 px-2.5 py-2 dark:border-white/10"
      style={{
        background: `linear-gradient(135deg, ${meta.tint}2e, ${meta.tint}0a 60%, transparent)`,
      }}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide" style={{ color: meta.tint }}>
          <Icon className="h-3 w-3" /> {meta.label}
        </span>
        {account.shared ? (
          <span className="rounded-full bg-[#5ac8fa]/15 px-1.5 py-0.5 text-[8px] font-semibold text-[#5ac8fa]">SHARED</span>
        ) : null}
      </div>
      <p className="mt-1.5 truncate text-[11px] font-medium">{account.name}</p>
      <p className={cn("truncate text-[15px] font-semibold tabular-nums", isCard && account.balance > 0 && "text-[#ff3b30]")}>
        {formatCurrency(account.balance)}
      </p>
      {left !== null ? (
        <p className="truncate text-[9px] text-muted tabular-nums">{formatCurrency(left)} left</p>
      ) : null}
    </Link>
  );
}

export function AccountBalances({ person }: { person: Person }) {
  const accounts = useFinanceStore((state) => state.accounts);
  const [showAll, setShowAll] = useState(false);

  const { mine, available, owed } = useMemo(() => {
    const mine = getAccountsForPerson(accounts, person);
    const sumOf = (type: AccountType) =>
      mine.filter((account) => account.type === type).reduce((sum, a) => sum + a.balance, 0);
    return {
      mine,
      available: roundMoney(sumOf("debit") + sumOf("cash")),
      owed: roundMoney(sumOf("credit")),
    };
  }, [accounts, person]);

  if (mine.length === 0) {
    return (
      <div className="glass rounded-xl px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold">Accounts</p>
          <Link href="/accounts" className="text-[11px] font-semibold text-[#007aff]">
            Add one
          </Link>
        </div>
        <p className="py-3 text-center text-[11px] text-muted">No accounts yet</p>
      </div>
    );
  }

  // Money first, then what is owed; within each, the fattest first so the
  // cards that matter are the ones above the fold.
  const ordered = [...mine].sort((a, b) => {
    const rank = (t: AccountType) => (t === "credit" ? 1 : 0);
    return rank(a.type) - rank(b.type) || b.balance - a.balance;
  });
  const folded = ordered.length > FOLD && !showAll;
  const shown = folded ? ordered.slice(0, FOLD) : ordered;

  return (
    <div className="glass rounded-xl px-3 py-2.5">
      <div className="mb-2 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-muted">Available</p>
          <AnimatedMoney value={available} className="text-2xl font-semibold text-[#34c759] tabular-nums" />
        </div>
        {owed > 0 ? (
          <div className="min-w-0 text-right">
            <p className="text-[10px] uppercase tracking-wide text-muted">Owed on cards</p>
            <AnimatedMoney value={owed} className="text-base font-semibold text-[#ff3b30] tabular-nums" />
          </div>
        ) : null}
        <Link
          href="/accounts"
          className="mb-1 inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-[#007aff]"
        >
          Manage <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {shown.map((account) => (
          <AccountCard key={account.id} account={account} />
        ))}
      </div>

      {ordered.length > FOLD ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="hit mt-2 flex w-full items-center justify-center gap-1 text-[11px] font-semibold text-[#007aff]"
          aria-expanded={!folded}
        >
          {folded ? `Show all ${ordered.length}` : "Show fewer"}
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !folded && "rotate-180")} />
        </button>
      ) : null}
    </div>
  );
}
