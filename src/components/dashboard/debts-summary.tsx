"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ChevronRight, CreditCard, HandCoins } from "lucide-react";
import { AnimatedMoney } from "@/components/ui/animated-number";
import { useFinanceStore } from "@/store/finance-store";
import { getPersonDebtOutstandingSummary } from "@/lib/calculations";
import { roundMoney } from "@/lib/money";
import { upcomingFor, whenLabel } from "@/lib/upcoming";
import { formatCurrency } from "@/lib/formatters";
import type { Debt, Person } from "@/types";

/**
 * Debts on the home page as two figures, because they are two different
 * things: money owed to people (an IOU, a loan) and money owed on cards
 * (a bill that arrives every month). Each shows its total and count; the
 * next payment due, when a bill in Memory names a debt or its card, sits
 * under the one it belongs to. The per-debt bars stay on the Debts page.
 */

function nextPaymentFor(
  debts: Debt[],
  accountNames: Map<string, string>,
  due: ReturnType<typeof upcomingFor>
) {
  if (debts.length === 0) return null;
  const names = debts.flatMap((debt) => {
    const own = debt.name.trim().toLowerCase();
    const card = debt.linkedAccountId ? accountNames.get(debt.linkedAccountId)?.trim().toLowerCase() : undefined;
    return card ? [own, card] : [own];
  });
  return (
    due.find((item) => {
      const bill = item.name.trim().toLowerCase();
      return names.some((name) => bill.includes(name) || name.includes(bill));
    }) ?? null
  );
}

export function DebtsSummary({ person }: { person: Person }) {
  const debts = useFinanceStore((state) => state.debts);
  const accounts = useFinanceStore((state) => state.accounts);
  const monthlyExpenses = useFinanceStore((state) => state.monthlyExpenses);
  const transactions = useFinanceStore((state) => state.transactions);

  const view = useMemo(() => {
    const summary = getPersonDebtOutstandingSummary(debts, person);
    const cards = summary.activeDebts.filter((debt) => !!debt.linkedAccountId);
    const own = summary.activeDebts.filter((debt) => !debt.linkedAccountId);
    const accountNames = new Map(accounts.map((a) => [a.id, a.name]));
    const due = upcomingFor(monthlyExpenses, transactions, [], person, 45);
    return {
      any: summary.activeDebts.length > 0 || summary.clearedDebts.length > 0,
      own: {
        total: roundMoney(own.reduce((sum, d) => sum + d.amount, 0)),
        count: own.length,
        next: nextPaymentFor(own, accountNames, due),
      },
      cards: {
        total: roundMoney(cards.reduce((sum, d) => sum + d.amount, 0)),
        count: cards.length,
        next: nextPaymentFor(cards, accountNames, due),
      },
    };
  }, [debts, accounts, monthlyExpenses, transactions, person]);

  if (!view.any) return null;

  const rows = [
    {
      key: "own",
      icon: HandCoins,
      tint: "#ff9500",
      label: "Own debts",
      hint: "loans & IOUs",
      ...view.own,
    },
    {
      key: "cards",
      icon: CreditCard,
      tint: "#ff3b30",
      label: "Credit card debts",
      hint: "card bills",
      ...view.cards,
    },
  ];

  return (
    <div className="glass rounded-xl px-3 py-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">Debts owed</p>
        <Link href="/debts" className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-[#007aff]">
          Manage <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <Link
              key={row.key}
              href="/debts"
              className="tap-card flex min-w-0 flex-col rounded-xl border border-black/5 px-2.5 py-2 dark:border-white/10"
              style={{ background: `linear-gradient(135deg, ${row.tint}26, ${row.tint}08 60%, transparent)` }}
            >
              <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide" style={{ color: row.tint }}>
                <Icon className="h-3 w-3" /> {row.label}
              </span>
              <AnimatedMoney
                value={row.total}
                className="mt-1 text-[17px] font-semibold tabular-nums"
              />
              <span className="truncate text-[10px] text-muted">
                {row.count === 0
                  ? `No ${row.hint}`
                  : `${row.count} ${row.count === 1 ? "open" : "open"}`}
                {row.next
                  ? ` · ${row.next.name}${row.next.amount ? ` ${formatCurrency(row.next.amount)}` : ""} ${whenLabel(row.next.daysUntil).toLowerCase()}`
                  : ""}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
