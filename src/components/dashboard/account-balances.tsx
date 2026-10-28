"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { AnimatedMoney } from "@/components/ui/animated-number";
import { ACCOUNT_TYPE_META } from "@/components/accounts/account-type-meta";
import { AccountWallet } from "@/components/dashboard/account-wallet";
import { useFinanceStore } from "@/store/finance-store";
import { getAccountsForPerson, getGreenDotCardBalance, isGreenDotPart } from "@/lib/accounts";
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
 *
 * On a phone a tile opens the wallet (AccountWallet) on that account, the
 * rest a flick above and below it; on a wider screen it goes to its page.
 */

/** Cards shown before "Show all": three rows of two on a phone. */
const FOLD = 6;

/** Below Tailwind's `md`, where the app switches to its phone layout. */
function isPhoneLayout() {
  return window.matchMedia("(max-width: 767px)").matches;
}

/**
 * The tile grows into the wallet card instead of the screen cutting to it. A
 * plain shape in the tile's colours is laid out where the card opens and
 * played back from the tile (transform and opacity only, which a phone runs on
 * its own), and the wallet appears under it as it fades.
 */
function growInto(from: HTMLElement, tint: string, open: () => void) {
  const box = from.getBoundingClientRect();
  const width = Math.min(window.innerWidth - 32, 448) - 24;
  const height = 236;
  const left = (window.innerWidth - width) / 2;
  const top = Math.max(64, window.innerHeight * 0.18);
  const ghost = document.createElement("div");
  Object.assign(ghost.style, {
    position: "fixed",
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${height}px`,
    borderRadius: "var(--card-radius)",
    zIndex: "85",
    pointerEvents: "none",
    transformOrigin: "0 0",
    background: `linear-gradient(140deg, color-mix(in srgb, ${tint} 24%, var(--modal-surface)), color-mix(in srgb, ${tint} 6%, var(--modal-surface)) 72%)`,
    boxShadow: "var(--glass-shadow)",
  });
  document.body.appendChild(ghost);
  const grow = ghost.animate(
    [
      { transform: `translate(${box.left - left}px, ${box.top - top}px) scale(${box.width / width}, ${box.height / height})`, opacity: 0.9 },
      { transform: "none", opacity: 1, offset: 0.7 },
      { transform: "none", opacity: 0 },
    ],
    { duration: 600, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }
  );
  window.setTimeout(open, 320);
  const done = () => ghost.remove();
  grow.finished.then(done, done);
}

function AccountCard({
  account,
  cardTotal,
  onOpen,
}: {
  account: Account;
  /** For a part of the Green Dot card: what the whole card holds. */
  cardTotal: number | null;
  onOpen: (accountId: string, from: HTMLElement | null, tint: string) => void;
}) {
  const meta = ACCOUNT_TYPE_META[account.type];
  const Icon = meta.icon;
  const isCard = account.type === "credit";
  const left = isCard && account.creditLimit ? account.creditLimit - account.balance : null;
  const tile = useRef<HTMLAnchorElement>(null);

  return (
    <Link
      ref={tile}
      href={isCard ? "/debts" : "/accounts"}
      // onNavigate, not onClick: a Cmd/Ctrl-click still opens the page in a
      // new tab, and only an ordinary tap on a phone becomes the wallet.
      onNavigate={(event) => {
        if (!isPhoneLayout()) return;
        event.preventDefault();
        onOpen(account.id, tile.current, meta.tint);
      }}
      className="tap-card flex min-w-0 flex-col justify-between overflow-hidden rounded-xl border border-black/5 px-2.5 py-2 dark:border-white/10"
      style={{
        // color-mix, because the tint is a CSS variable: appending hex alpha
        // to `var(--success)` is not a colour, and the gradient was dropped.
        background: `linear-gradient(135deg, color-mix(in srgb, ${meta.tint} 18%, transparent), color-mix(in srgb, ${meta.tint} 4%, transparent) 60%, transparent)`,
      }}
    >
      <div className="flex items-center justify-between gap-1">
        <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide" style={{ color: meta.tint }}>
          <Icon className="h-3 w-3" /> {meta.label}
        </span>
        {account.shared || cardTotal !== null ? (
          <span className="rounded-full bg-cyan/15 px-1.5 py-0.5 text-[8px] font-semibold text-cyan">SHARED</span>
        ) : null}
      </div>
      <p className="mt-1.5 truncate text-[11px] font-medium">
        {account.name}
        {cardTotal !== null ? <span className="text-muted"> · part</span> : null}
      </p>
      <p
        className={cn(
          "truncate text-[15px] font-semibold tabular-nums",
          ((isCard && account.balance > 0) || (cardTotal !== null && account.balance < 0)) && "text-negative"
        )}
      >
        {formatCurrency(account.balance)}
      </p>
      {left !== null ? (
        <p className="truncate text-[9px] text-muted tabular-nums">{formatCurrency(left)} left</p>
      ) : cardTotal !== null ? (
        <p className="truncate text-[9px] text-muted tabular-nums">of {formatCurrency(cardTotal)} on the card</p>
      ) : null}
    </Link>
  );
}

export function AccountBalances({ person }: { person: Person }) {
  const accounts = useFinanceStore((state) => state.accounts);
  const still = useReducedMotion();
  const [showAll, setShowAll] = useState(false);
  const [walletAt, setWalletAt] = useState<string | null>(null);

  const { mine, available, owed, cardTotal } = useMemo(() => {
    const mine = getAccountsForPerson(accounts, person);
    const sumOf = (type: AccountType) =>
      mine.filter((account) => account.type === type).reduce((sum, a) => sum + a.balance, 0);
    return {
      mine,
      available: roundMoney(sumOf("debit") + sumOf("cash")),
      owed: roundMoney(sumOf("credit")),
      cardTotal: roundMoney(getGreenDotCardBalance(accounts)),
    };
  }, [accounts, person]);

  if (mine.length === 0) {
    return (
      <div className="glass rounded-xl px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold">Accounts</p>
          <Link href="/accounts" className="text-[11px] font-semibold text-accent">
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
          <AnimatedMoney value={available} className="text-2xl font-semibold text-positive tabular-nums" />
        </div>
        {owed > 0 ? (
          <div className="min-w-0 text-right">
            <p className="text-[10px] uppercase tracking-wide text-muted">Owed on cards</p>
            <AnimatedMoney value={owed} className="text-base font-semibold text-negative tabular-nums" />
          </div>
        ) : null}
        <Link
          href="/accounts"
          className="mb-1 inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-accent"
        >
          Manage <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {shown.map((account) => (
          <AccountCard
            key={account.id}
            account={account}
            cardTotal={isGreenDotPart(account) ? cardTotal : null}
            onOpen={(id, from, tint) => {
              if (still || !from) setWalletAt(id);
              else growInto(from, tint, () => setWalletAt(id));
            }}
          />
        ))}
      </div>

      {ordered.length > FOLD ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="hit mt-2 flex w-full items-center justify-center gap-1 text-[11px] font-semibold text-accent"
          aria-expanded={!folded}
        >
          {folded ? `Show all ${ordered.length}` : "Show fewer"}
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !folded && "rotate-180")} />
        </button>
      ) : null}

      <AccountWallet
        open={walletAt !== null}
        onClose={() => setWalletAt(null)}
        person={person}
        accounts={ordered}
        initialAccountId={walletAt}
      />
    </div>
  );
}
