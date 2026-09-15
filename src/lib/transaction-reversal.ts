import { compareByDateTimeAsc } from "@/lib/formatters";
import { roundMoney } from "@/lib/money";
import type {
  Account,
  Debt,
  IncomeEntry,
  SettlementEntry,
  Person,
  Transaction,
} from "@/types";

function syncLinkedDebt(
  debts: Debt[],
  accountId: string,
  newBalance: number
): Debt[] {
  return debts.map((debt) =>
    debt.linkedAccountId === accountId ? { ...debt, amount: newBalance } : debt
  );
}

/** Undo money leaving an account (reverse of applyPaymentFromAccount). */
export function reversePaymentFromAccount(
  accounts: Account[],
  debts: Debt[],
  amount: number,
  accountId: string,
  cashSourceAccountId?: string
): { accounts: Account[]; debts: Debt[] } | null {
  const account = accounts.find((a) => a.id === accountId);
  if (!account) return null;

  let nextAccounts = [...accounts];
  let nextDebts = [...debts];

  if (account.type === "cash" && cashSourceAccountId) {
    nextAccounts = nextAccounts.map((a) => {
      if (a.id === cashSourceAccountId) return { ...a, balance: a.balance + amount };
      if (a.id === accountId) return { ...a, balance: a.balance + amount };
      return a;
    });
  } else if (account.type === "cash") {
    nextAccounts = nextAccounts.map((a) =>
      a.id === accountId ? { ...a, balance: a.balance + amount } : a
    );
  } else if (account.type === "debit") {
    nextAccounts = nextAccounts.map((a) =>
      a.id === accountId ? { ...a, balance: a.balance + amount } : a
    );
  } else if (account.type === "credit") {
    const newBalance = Math.max(0, account.balance - amount);
    nextAccounts = nextAccounts.map((a) =>
      a.id === accountId ? { ...a, balance: newBalance } : a
    );
    nextDebts = syncLinkedDebt(nextDebts, accountId, newBalance);
  }

  return { accounts: nextAccounts, debts: nextDebts };
}

export function reverseDepositToAccount(
  accounts: Account[],
  accountId: string,
  amount: number
): Account[] {
  return accounts.map((a) =>
    a.id === accountId ? { ...a, balance: a.balance - amount } : a
  );
}

export function recalculateSettlementState(entries: SettlementEntry[]) {
  const sorted = [...entries].sort(compareByDateTimeAsc);
  let balance = 0;

  const withBalances = sorted.map((entry) => {
    if (entry.paidBy === "kushvanth" && entry.benefited === "g") {
      balance += entry.amount;
    } else if (entry.paidBy === "g" && entry.benefited === "kushvanth") {
      balance -= entry.amount;
    }
    // Round for DISPLAY only — the accumulator stays raw. Rounding the running
    // total at every step would re-round legacy half-cent entries (12.105) and
    // silently move the historical balance; here each entry still contributes
    // its exact stored amount.
    return { ...entry, runningBalance: roundMoney(balance) };
  });

  return {
    settlementHistory: [...withBalances].reverse(),
    // Only the final total is snapped, which removes accumulated float dust
    // (7220.620000000004) without changing what any entry contributed.
    settlementBalance: roundMoney(balance),
  };
}

/** Undo one Balance history entry from the current balance (inverse of spend). */
export function reverseSettlementEntryEffect(
  balance: number,
  entry: SettlementEntry
): number {
  if (entry.paidBy === "kushvanth" && entry.benefited === "g") {
    return balance - entry.amount;
  }
  if (entry.paidBy === "g" && entry.benefited === "kushvanth") {
    return balance + entry.amount;
  }
  return balance;
}

function shouldRemoveSettlementEntry(
  target: Transaction,
  entry: SettlementEntry
): boolean {
  if (entry.autoMessage === "Starting balance") return false;
  if (entry.autoMessage === "Manual balance adjustment") return false;

  if (entry.sourceTransactionId === target.id) return true;
  if (entry.sourceTransactionId) return false;

  const paidBy = target.paidByPerson ?? target.person;
  if (entry.date !== target.date || entry.time !== target.time) return false;
  if (entry.paidBy !== paidBy) return false;

  if (target.expenseShares) {
    const share = target.expenseShares[entry.benefited];
    return share != null && Math.abs(share - entry.amount) < 0.01;
  }

  if (target.beneficiaryPerson) {
    return (
      entry.benefited === target.beneficiaryPerson &&
      Math.abs(entry.amount - target.amount) < 0.01
    );
  }

  return false;
}

export function partitionSettlementEntriesForTransaction(
  target: Transaction,
  history: SettlementEntry[]
): { kept: SettlementEntry[]; removed: SettlementEntry[] } {
  const kept: SettlementEntry[] = [];
  const removed: SettlementEntry[] = [];

  for (const entry of history) {
    if (shouldRemoveSettlementEntry(target, entry)) {
      removed.push(entry);
    } else {
      kept.push(entry);
    }
  }

  return { kept, removed };
}

/** Keep stored balance when history alone does not include the opening amount. */
export function ensureSettlementBaseline(
  history: SettlementEntry[],
  balance: number
): { settlementHistory: SettlementEntry[]; settlementBalance: number } {
  const recalculated = recalculateSettlementState(history);
  const gap = balance - recalculated.settlementBalance;

  if (Math.abs(gap) < 0.01) {
    return {
      settlementHistory: recalculated.settlementHistory,
      settlementBalance: recalculated.settlementBalance,
    };
  }

  const hasOpening = history.some((entry) => entry.autoMessage === "Starting balance");
  if (hasOpening) {
    return { settlementHistory: recalculated.settlementHistory, settlementBalance: balance };
  }

  const paidBy: Person = gap > 0 ? "kushvanth" : "g";
  const benefited: Person = gap > 0 ? "g" : "kushvanth";
  const openingEntry: SettlementEntry = {
    id: "opening-balance",
    date: "2020-01-01",
    time: "00:00",
    amount: Math.abs(gap),
    paidBy,
    benefited,
    autoMessage: "Starting balance",
    runningBalance: Math.abs(gap),
  };

  const merged = recalculateSettlementState([openingEntry, ...history]);
  return {
    settlementHistory: merged.settlementHistory,
    settlementBalance: merged.settlementBalance,
  };
}

function applySettlementRemoval(
  currentBalance: number,
  history: SettlementEntry[],
  removed: SettlementEntry[]
): { settlementBalance: number; settlementHistory: SettlementEntry[] } {
  let settlementBalance = currentBalance;
  for (const entry of removed) {
    settlementBalance = reverseSettlementEntryEffect(settlementBalance, entry);
  }

  const settlementHistory = recalculateSettlementState(history).settlementHistory;
  return { settlementBalance, settlementHistory };
}

function findRelatedTransactionIds(
  target: Transaction,
  transactions: Transaction[]
): Set<string> {
  const ids = new Set<string>([target.id]);

  if (
    target.type === "expense" ||
    target.type === "debt_payment" ||
    target.type === "credit_payment"
  ) {
    for (const tx of transactions) {
      if (tx.type !== "cash_withdrawal") continue;
      if (tx.person !== target.person) continue;
      if (tx.date !== target.date || tx.time !== target.time) continue;
      if (tx.accountId === target.accountId || tx.sourceAccountId === target.sourceAccountId) {
        ids.add(tx.id);
      }
    }
  }

  return ids;
}

/** Inverse of findMatchingIncomeEntry — the History row an income entry created. */
export function findIncomeTransactionForEntry(
  entry: IncomeEntry,
  transactions: Transaction[]
): Transaction | undefined {
  return transactions.find(
    (transaction) =>
      transaction.type === "income" &&
      transaction.person === entry.person &&
      transaction.amount === entry.amount &&
      transaction.date === entry.date &&
      transaction.accountId === entry.depositAccountId
  );
}

function findMatchingIncomeEntry(
  transaction: Transaction,
  incomeEntries: IncomeEntry[]
): IncomeEntry | undefined {
  return incomeEntries.find(
    (entry) =>
      entry.person === transaction.person &&
      entry.amount === transaction.amount &&
      entry.date === transaction.date &&
      entry.depositAccountId === transaction.accountId
  );
}

export function applyTransactionDeletion(state: {
  accounts: Account[];
  debts: Debt[];
  transactions: Transaction[];
  incomeEntries: IncomeEntry[];
  settlementHistory: SettlementEntry[];
  settlementBalance: number;
  monthlyExpenses: import("@/types").MonthlyExpense[];
  transactionId: string;
}) {
  const target = state.transactions.find((t) => t.id === state.transactionId);
  if (!target) return null;

  const removeIds = findRelatedTransactionIds(target, state.transactions);
  let accounts = state.accounts;
  let debts = state.debts;
  let incomeEntries = state.incomeEntries;
  let settlementHistory = state.settlementHistory;
  let settlementBalance = state.settlementBalance;
  let monthlyExpenses = state.monthlyExpenses;
  let removedSettlementEntries: SettlementEntry[] = [];
  let removedIncomeEntry: IncomeEntry | undefined;
  let affectedMonthlyExpense: import("@/types").MonthlyExpense | undefined;

  switch (target.type) {
    case "expense":
    case "debt_payment":
    case "credit_payment": {
      if (target.accountId) {
        const reversed = reversePaymentFromAccount(
          accounts,
          debts,
          target.amount,
          target.accountId,
          target.sourceAccountId
        );
        if (reversed) {
          accounts = reversed.accounts;
          debts = reversed.debts;
        }
      }

      if (
        (target.type === "debt_payment" || target.type === "credit_payment") &&
        target.category
      ) {
        const debt = debts.find((d) => d.name === target.category && d.person === target.person);
        if (debt) {
          debts = debts.map((d) =>
            d.id === debt.id ? { ...d, amount: d.amount + target.amount } : d
          );
          if (debt.linkedAccountId) {
            const linked = accounts.find((a) => a.id === debt.linkedAccountId);
            if (linked) {
              const newBal = linked.balance + target.amount;
              accounts = accounts.map((a) =>
                a.id === debt.linkedAccountId ? { ...a, balance: newBal } : a
              );
              debts = syncLinkedDebt(debts, debt.linkedAccountId!, newBal);
            }
          }
        }
      }

      const partitioned = partitionSettlementEntriesForTransaction(
        target,
        settlementHistory
      );
      if (partitioned.removed.length > 0) {
        settlementHistory = partitioned.kept;
        removedSettlementEntries = partitioned.removed;
      }

      if (target.monthlyExpenseId && target.plannedAmount != null) {
        affectedMonthlyExpense = monthlyExpenses.find(
          (expense) => expense.id === target.monthlyExpenseId
        );
        monthlyExpenses = monthlyExpenses.map((expense) =>
          expense.id === target.monthlyExpenseId ? { ...expense, isPaid: false } : expense
        );
      }
      break;
    }

    case "cash_withdrawal": {
      if (target.accountId && target.sourceAccountId) {
        const reversed = reversePaymentFromAccount(
          accounts,
          debts,
          target.amount,
          target.accountId,
          target.sourceAccountId
        );
        if (reversed) {
          accounts = reversed.accounts;
          debts = reversed.debts;
        }
      }
      break;
    }

    case "income": {
      if (target.accountId) {
        accounts = reverseDepositToAccount(accounts, target.accountId, target.amount);
      }
      const incomeEntry = findMatchingIncomeEntry(target, incomeEntries);
      if (incomeEntry) {
        removedIncomeEntry = incomeEntry;
        incomeEntries = incomeEntries.filter((e) => e.id !== incomeEntry.id);
      }
      break;
    }

    case "settlement": {
      const partitioned = partitionSettlementEntriesForTransaction(
        target,
        settlementHistory
      );
      if (partitioned.removed.length > 0) {
        settlementHistory = partitioned.kept;
        removedSettlementEntries = partitioned.removed;
      }
      break;
    }

    case "balance_adjustment": {
      if (target.accountId && target.previousBalance != null) {
        accounts = accounts.map((a) =>
          a.id === target.accountId ? { ...a, balance: target.previousBalance! } : a
        );
        const updated = accounts.find((a) => a.id === target.accountId);
        if (updated?.type === "credit") {
          debts = syncLinkedDebt(debts, target.accountId, updated.balance);
        }
      }
      break;
    }

    default:
      break;
  }

  if (removedSettlementEntries.length > 0) {
    const interState = applySettlementRemoval(
      settlementBalance,
      settlementHistory,
      removedSettlementEntries
    );
    settlementBalance = interState.settlementBalance;
    settlementHistory = interState.settlementHistory;
  }

  const transactions = state.transactions.filter((t) => !removeIds.has(t.id));
  const removedTransactions = state.transactions.filter((t) => removeIds.has(t.id));

  return {
    accounts,
    debts,
    incomeEntries,
    monthlyExpenses,
    transactions,
    settlementHistory,
    settlementBalance,
    deletionAudit: {
      primaryTransactionId: state.transactionId,
      removedTransactions,
      removedSettlementEntries,
      removedIncomeEntry,
      monthlyExpense: affectedMonthlyExpense,
    },
  };
}

export type ExpenseShares = Partial<Record<Person, number>>;

export function getSettlementUpdatesFromShares(
  paidBy: Person,
  shares: ExpenseShares
): { benefited: Person; amount: number }[] {
  const updates: { benefited: Person; amount: number }[] = [];
  for (const person of ["kushvanth", "g"] as Person[]) {
    const share = shares[person] ?? 0;
    if (share > 0 && person !== paidBy) {
      updates.push({ benefited: person, amount: share });
    }
  }
  return updates;
}
