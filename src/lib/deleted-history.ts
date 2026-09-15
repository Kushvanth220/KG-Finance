import { v4 as uuidv4 } from "uuid";
import { getTransactionDisplayMessage } from "@/lib/transaction-messages";
import type {
  Account,
  Debt,
  DeletedHistoryRecord,
  IncomeEntry,
  IncomeSource,
  SettlementEntry,
  MonthlyExpense,
  Person,
  Transaction,
} from "@/types";
import { PERSON_LABELS } from "@/types";

export function buildDeletedHistoryRecord(opts: {
  primaryTransactionId: string;
  removedTransactions: Transaction[];
  removedSettlementEntries: SettlementEntry[];
  removedIncomeEntry?: IncomeEntry;
  monthlyExpense?: MonthlyExpense;
  accounts: Account[];
  debts: Debt[];
  incomeSources: IncomeSource[];
  deletedBy: Person;
  deletedAt?: string;
}): DeletedHistoryRecord {
  const {
    primaryTransactionId,
    removedTransactions,
    removedSettlementEntries,
    removedIncomeEntry,
    monthlyExpense,
    accounts,
    debts,
    incomeSources,
    deletedBy,
    deletedAt = new Date().toISOString(),
  } = opts;

  const primary =
    removedTransactions.find((t) => t.id === primaryTransactionId) ??
    removedTransactions[0];

  const summaryParts: string[] = [
    `Deleted by ${PERSON_LABELS[deletedBy]}`,
  ];
  if (primary) {
    summaryParts.push(getTransactionDisplayMessage(primary));
  }
  if (removedTransactions.length > 1) {
    summaryParts.push(`${removedTransactions.length - 1} linked transaction(s)`);
  }
  if (removedSettlementEntries.length > 0) {
    summaryParts.push(`${removedSettlementEntries.length} Balance entry(ies) reversed`);
  }
  if (removedIncomeEntry) {
    summaryParts.push("income entry removed");
  }
  if (monthlyExpense) {
    summaryParts.push(`monthly expense "${monthlyExpense.name}" marked unpaid`);
  }

  return {
    id: uuidv4(),
    deletedAt,
    deletedBy,
    primaryTransactionId,
    transactions: removedTransactions.map((t) => ({ ...t })),
    removedSettlementEntries: removedSettlementEntries.map((e) => ({ ...e })),
    removedIncomeEntry: removedIncomeEntry ? { ...removedIncomeEntry } : undefined,
    monthlyExpense: monthlyExpense
      ? {
          id: monthlyExpense.id,
          name: monthlyExpense.name,
          person: monthlyExpense.person,
          amount: monthlyExpense.amount,
          isVariable: monthlyExpense.isVariable,
          isRecurring: monthlyExpense.isRecurring,
        }
      : undefined,
    context: {
      accounts: Object.fromEntries(
        accounts.map((a) => [
          a.id,
          { name: a.name, type: a.type, person: a.person },
        ])
      ),
      debts: Object.fromEntries(
        debts.map((d) => [d.id, { name: d.name, person: d.person }])
      ),
      incomeSources: Object.fromEntries(
        incomeSources.map((s) => [s.id, { name: s.name, person: s.person }])
      ),
    },
    summary: summaryParts.join(" · "),
  };
}

export function resolveAccountLabel(
  record: DeletedHistoryRecord,
  accountId?: string
): string | undefined {
  if (!accountId) return undefined;
  const account = record.context.accounts[accountId];
  return account ? `${account.name} (${account.type})` : accountId;
}
