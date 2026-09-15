"use client";

import { formatCurrency, formatDateTime } from "@/lib/formatters";
import { getTransactionDisplayMessage, getTransactionActor } from "@/lib/transaction-messages";
import { useFinanceStore } from "@/store/finance-store";
import { PERSON_LABELS, type Person, type Transaction, type TransactionType } from "@/types";

const typeLabels: Record<TransactionType, string> = {
  income: "Income",
  expense: "Expense",
  transfer: "Transfer",
  cash_withdrawal: "Cash Withdrawal",
  cash_deposit: "Cash Deposit",
  debt_payment: "Debt Payment",
  credit_payment: "Credit Payment",
  settlement: "Settlement",
  balance_adjustment: "Balance update",
};

function DetailRow({ label, value }: { label: string; value?: string | number | null }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex gap-2 text-[10px] leading-relaxed">
      <span className="text-muted shrink-0 w-24">{label}</span>
      <span className="break-words">{value}</span>
    </div>
  );
}

function resolveAccountLabel(
  accountId: string | undefined,
  accounts: ReturnType<typeof useFinanceStore.getState>["accounts"]
) {
  if (!accountId) return undefined;
  const account = accounts.find((item) => item.id === accountId);
  return account ? `${account.name} (${account.type})` : accountId;
}

export function ActiveTransactionDetails({ transaction }: { transaction: Transaction }) {
  const accounts = useFinanceStore((state) => state.accounts);
  const actor = getTransactionActor(transaction);

  return (
    <details className="group mt-1">
      <summary className="text-[10px] text-[#007aff] cursor-pointer list-none flex items-center gap-1">
        <span className="group-open:rotate-90 transition-transform inline-block">›</span>
        Details
      </summary>
      <div className="mt-1.5 rounded-lg bg-black/[0.03] dark:bg-white/[0.03] p-2.5 space-y-1">
        <p className="text-[10px] font-semibold text-muted">
          {typeLabels[transaction.type]} · {PERSON_LABELS[actor]}
        </p>
        <p className="text-[10px] leading-snug">{getTransactionDisplayMessage(transaction)}</p>
        <DetailRow label="Amount" value={formatCurrency(transaction.amount)} />
        <DetailRow
          label="When"
          value={formatDateTime(transaction.date, transaction.time, transaction.timestamp)}
        />
        <DetailRow label="Category" value={transaction.category} />
        <DetailRow label="Note" value={transaction.notes} />
        <DetailRow label="Account" value={resolveAccountLabel(transaction.accountId, accounts)} />
        <DetailRow
          label="From"
          value={resolveAccountLabel(transaction.sourceAccountId, accounts)}
        />
        <DetailRow label="To" value={resolveAccountLabel(transaction.targetAccountId, accounts)} />
        <DetailRow
          label="Paid by"
          value={transaction.paidByPerson ? PERSON_LABELS[transaction.paidByPerson] : undefined}
        />
        <DetailRow
          label="For"
          value={
            transaction.beneficiaryPerson
              ? PERSON_LABELS[transaction.beneficiaryPerson]
              : transaction.expenseOwner
                ? PERSON_LABELS[transaction.expenseOwner]
                : undefined
          }
        />
        {transaction.expenseShares ? (
          <DetailRow
            label="Shares"
            value={(["kushvanth", "g"] as Person[])
              .filter((person) => (transaction.expenseShares?.[person] ?? 0) > 0)
              .map(
                (person) =>
                  `${PERSON_LABELS[person]} ${formatCurrency(transaction.expenseShares![person]!)}`
              )
              .join(", ")}
          />
        ) : null}
        <DetailRow label="Payment" value={transaction.paymentMethod} />
        {transaction.categoryRemaining != null && transaction.plannedAmount != null ? (
          <DetailRow
            label="Budget left"
            value={`${formatCurrency(transaction.categoryRemaining)} of ${formatCurrency(transaction.plannedAmount)}`}
          />
        ) : null}
        {transaction.debtRemaining != null ? (
          <DetailRow label="Debt left" value={formatCurrency(transaction.debtRemaining)} />
        ) : null}
      </div>
    </details>
  );
}
