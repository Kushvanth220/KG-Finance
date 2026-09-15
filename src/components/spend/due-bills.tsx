"use client";

import { useMemo, useState } from "react";
import { Check, ReceiptText } from "lucide-react";
import { useFinanceStore } from "@/store/finance-store";
import { getDueDateForExpense, getMonthlyExpensePaid } from "@/lib/monthly-expense-tracker";
import { formatCurrency } from "@/lib/formatters";
import type { Person } from "@/types";
import { cn } from "@/lib/utils";

/**
 * Recurring bills that are due and not yet paid this month, each with one
 * button.
 *
 * "Auto-logged" without the tap would be a phantom expense — the exact thing
 * this app once did by accident and must never do again. So the bill is laid
 * out ready, account chosen, amount filled, and one tap records it.
 */
export function DueBills({ person, className }: { person: Person; className?: string }) {
  const bills = useFinanceStore((state) => state.monthlyExpenses);
  const transactions = useFinanceStore((state) => state.transactions);
  const accounts = useFinanceStore((state) => state.accounts);
  const categories = useFinanceStore((state) => state.spendCategories);
  const spend = useFinanceStore((state) => state.spend);

  const [accountFor, setAccountFor] = useState<Record<string, string>>({});
  const [justPaid, setJustPaid] = useState<Record<string, boolean>>({});

  // Debit first: a bill is paid from the bank far more often than by card.
  const mine = useMemo(
    () =>
      accounts
        .filter((a) => a.person === person && a.type !== "cash")
        .sort((a, b) => (a.type === b.type ? 0 : a.type === "debit" ? -1 : 1)),
    [accounts, person]
  );

  const due = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return bills
      .filter((bill) => bill.person === person && bill.isRecurring && (bill.amount ?? 0) > 0)
      .map((bill) => {
        const dueDate = getDueDateForExpense(bill, now);
        if (!dueDate) return null;
        const days = Math.round(
          (new Date(dueDate.getFullYear(), dueDate.getMonth(), dueDate.getDate()).getTime() - todayStart) / 86400000
        );
        if (days > 0) return null;
        const paid = getMonthlyExpensePaid(transactions, bill, now);
        if (paid >= (bill.amount ?? 0)) return null;
        return { bill, days, remaining: Math.round(((bill.amount ?? 0) - paid) * 100) / 100 };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => a.days - b.days);
  }, [bills, transactions, person]);

  if (due.length === 0) return null;

  const categoryFor = (name: string) =>
    categories.find((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase())?.name ?? name;

  return (
    <div className={cn("glass rounded-xl px-3 py-2.5", className)}>
      <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#ff9500]">
        <ReceiptText className="h-3 w-3" /> Due now
      </p>
      <div className="space-y-1.5">
        {due.map(({ bill, days, remaining }) => {
          const accountId = accountFor[bill.id] ?? mine[0]?.id ?? "";
          const paid = justPaid[bill.id];
          return (
            <div key={bill.id} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium">{bill.name}</p>
                <p className="text-[10px] text-muted tabular-nums">
                  {formatCurrency(remaining)} · {days === 0 ? "due today" : `${-days} ${-days === 1 ? "day" : "days"} overdue`}
                </p>
              </div>
              {paid ? (
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#34c759]">
                  <Check className="h-3.5 w-3.5" /> Paid
                </span>
              ) : (
                <>
                  <select
                    value={accountId}
                    onChange={(event) => setAccountFor((current) => ({ ...current, [bill.id]: event.target.value }))}
                    className="glass max-w-[110px] rounded-lg px-2 py-1 text-[11px] outline-none"
                    aria-label={`Pay ${bill.name} from`}
                  >
                    {mine.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!accountId}
                    onClick={() => {
                      spend({
                        person,
                        amount: remaining,
                        accountId,
                        category: categoryFor(bill.name),
                        monthlyExpenseId: bill.id,
                        plannedAmount: bill.amount ?? undefined,
                        notes: `${bill.name} — monthly`,
                      });
                      setJustPaid((current) => ({ ...current, [bill.id]: true }));
                    }}
                    className="rounded-lg bg-[#34c759] px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
                  >
                    Paid
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
