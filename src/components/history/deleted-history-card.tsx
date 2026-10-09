"use client";

import { formatCurrency, formatDateTime } from "@/lib/formatters";
import { resolveAccountLabel } from "@/lib/deleted-history";
import { getTransactionDisplayMessage, getTransactionActor } from "@/lib/transaction-messages";
import {
  PERSON_LABELS,
  type DeletedHistoryRecord,
  type Person,
  type Transaction,
  type TransactionType,
} from "@/types";

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
    <div className="flex gap-2 text-xs leading-relaxed">
      <span className="text-muted shrink-0 w-28">{label}</span>
      <span className="break-all">{value}</span>
    </div>
  );
}

function TransactionDetails({
  transaction,
  record,
}: {
  transaction: Transaction;
  record: DeletedHistoryRecord;
}) {
  const actor = getTransactionActor(transaction);

  return (
    <div className="rounded-xl bg-black/[0.03] dark:bg-white/[0.03] p-3 space-y-1.5">
      <p className="text-xs font-semibold text-negative">
        {typeLabels[transaction.type]} · {PERSON_LABELS[actor]}
      </p>
      <p className="text-sm">{getTransactionDisplayMessage(transaction)}</p>
      <DetailRow label="Amount" value={formatCurrency(transaction.amount)} />
      <DetailRow
        label="When"
        value={formatDateTime(transaction.date, transaction.time, transaction.timestamp)}
      />
      <DetailRow label="Category" value={transaction.category} />
      <DetailRow
        label="Account"
        value={resolveAccountLabel(record, transaction.accountId)}
      />
      <DetailRow
        label="From account"
        value={resolveAccountLabel(record, transaction.sourceAccountId)}
      />
      <DetailRow
        label="To account"
        value={resolveAccountLabel(record, transaction.targetAccountId)}
      />
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
      {transaction.expenseShares && (
        <DetailRow
          label="Shares"
          value={(["kushvanth", "g"] as Person[])
            .filter((p) => (transaction.expenseShares?.[p] ?? 0) > 0)
            .map((p) => `${PERSON_LABELS[p]} ${formatCurrency(transaction.expenseShares![p]!)}`)
            .join(", ")}
        />
      )}
      <DetailRow label="Payment" value={transaction.paymentMethod} />
      <DetailRow label="Notes" value={transaction.notes} />
      <DetailRow label="Auto message" value={transaction.autoMessage} />
      <DetailRow
        label="Budget left"
        value={
          transaction.categoryRemaining != null && transaction.plannedAmount != null
            ? `${formatCurrency(transaction.categoryRemaining)} of ${formatCurrency(transaction.plannedAmount)}`
            : undefined
        }
      />
      <DetailRow
        label="Debt left"
        value={
          transaction.debtRemaining != null
            ? formatCurrency(transaction.debtRemaining)
            : undefined
        }
      />
      <DetailRow
        label="Prev. balance"
        value={
          transaction.previousBalance != null
            ? formatCurrency(transaction.previousBalance)
            : undefined
        }
      />
      <DetailRow label="Transaction ID" value={transaction.id} />
    </div>
  );
}

export function DeletedHistoryCard({ record }: { record: DeletedHistoryRecord }) {
  const primary =
    record.transactions.find((t) => t.id === record.primaryTransactionId) ??
    record.transactions[0];

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-negative/15 text-negative">
              Deleted
            </span>
            {record.deletedBy ? (
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo/15 text-indigo">
                By {PERSON_LABELS[record.deletedBy]}
              </span>
            ) : null}
            <span className="text-xs text-muted">
              Removed {formatDateTime(record.deletedAt.slice(0, 10), record.deletedAt.slice(11, 19), record.deletedAt)}
            </span>
          </div>
          <p className="font-medium mt-2 text-sm leading-snug">{record.summary}</p>
          {primary && (
            <p className="text-xs text-muted mt-1">
              Originally recorded{" "}
              {formatDateTime(primary.date, primary.time, primary.timestamp)}
            </p>
          )}
        </div>
        {primary && (
          <span className="font-semibold text-negative shrink-0">
            -{formatCurrency(primary.amount)}
          </span>
        )}
      </div>

      <details className="group">
        <summary className="text-xs text-accent cursor-pointer list-none flex items-center gap-1">
          <span className="group-open:rotate-90 transition-transform inline-block">›</span>
          Full deleted details
        </summary>
        <div className="mt-3 space-y-3">
          <DetailRow
            label="Deleted by"
            value={record.deletedBy ? PERSON_LABELS[record.deletedBy] : "Not recorded"}
          />
          <DetailRow
            label="Deleted at"
            value={formatDateTime(
              record.deletedAt.slice(0, 10),
              record.deletedAt.slice(11, 19),
              record.deletedAt
            )}
          />

          {record.transactions.map((transaction) => (
            <TransactionDetails
              key={transaction.id}
              transaction={transaction}
              record={record}
            />
          ))}

          {record.removedSettlementEntries.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted uppercase tracking-wide">
                Balance entries reversed
              </p>
              {record.removedSettlementEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-xl bg-black/[0.03] dark:bg-white/[0.03] p-3 space-y-1.5"
                >
                  <DetailRow
                    label="When"
                    value={formatDateTime(entry.date, entry.time, entry.timestamp)}
                  />
                  <DetailRow label="Amount" value={formatCurrency(entry.amount)} />
                  <DetailRow label="Paid by" value={PERSON_LABELS[entry.paidBy]} />
                  <DetailRow label="Benefited" value={PERSON_LABELS[entry.benefited]} />
                  <DetailRow label="Running balance" value={formatCurrency(entry.runningBalance)} />
                  <DetailRow label="Notes" value={entry.notes} />
                  <DetailRow label="Auto message" value={entry.autoMessage} />
                  <DetailRow label="Source txn" value={entry.sourceTransactionId} />
                  <DetailRow label="Entry ID" value={entry.id} />
                </div>
              ))}
            </div>
          )}

          {record.removedIncomeEntry && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted uppercase tracking-wide">
                Income entry removed
              </p>
              <div className="rounded-xl bg-black/[0.03] dark:bg-white/[0.03] p-3 space-y-1.5">
                <DetailRow label="Person" value={PERSON_LABELS[record.removedIncomeEntry.person]} />
                <DetailRow label="Amount" value={formatCurrency(record.removedIncomeEntry.amount)} />
                <DetailRow
                  label="When"
                  value={formatDateTime(
                    record.removedIncomeEntry.date,
                    record.removedIncomeEntry.time,
                    record.removedIncomeEntry.timestamp
                  )}
                />
                <DetailRow
                  label="Source"
                  value={record.context.incomeSources[record.removedIncomeEntry.sourceId]?.name}
                />
                <DetailRow
                  label="Deposited to"
                  value={resolveAccountLabel(record, record.removedIncomeEntry.depositAccountId)}
                />
                <DetailRow label="Deposit type" value={record.removedIncomeEntry.depositType} />
                <DetailRow label="Notes" value={record.removedIncomeEntry.notes} />
                <DetailRow label="Entry ID" value={record.removedIncomeEntry.id} />
              </div>
            </div>
          )}

          {record.monthlyExpense && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted uppercase tracking-wide">
                Monthly expense marked unpaid again
              </p>
              <div className="rounded-xl bg-black/[0.03] dark:bg-white/[0.03] p-3 space-y-1.5">
                <DetailRow label="Name" value={record.monthlyExpense.name} />
                <DetailRow label="Person" value={PERSON_LABELS[record.monthlyExpense.person]} />
                <DetailRow
                  label="Planned"
                  value={
                    record.monthlyExpense.amount != null
                      ? formatCurrency(record.monthlyExpense.amount)
                      : "Variable"
                  }
                />
                <DetailRow label="Expense ID" value={record.monthlyExpense.id} />
              </div>
            </div>
          )}

          <DetailRow label="Audit record ID" value={record.id} />
        </div>
      </details>
    </div>
  );
}
