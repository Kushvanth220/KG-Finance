import { compareByDateTime, parseAppDateTime } from "@/lib/formatters";
import {
  getGreenDotMonthRange,
  getGreenDotTrackingRange,
  isOnOrAfterGreenDotTracking,
} from "@/lib/greendot-tracking";
import { isGreenDotAccount, SHARED_GREEN_DOT_ID } from "@/lib/accounts";
import type { Account, IncomeEntry, Person, Transaction, TransactionType } from "@/types";

const OUTFLOW_TYPES: TransactionType[] = [
  "expense",
  "debt_payment",
  "credit_payment",
  "cash_withdrawal",
];

export function isGreenDotAccountRef(account: Account) {
  // Both people's parts, and an old merged card — by the same name rule as
  // isGreenDotPart, so the two can never disagree about which accounts are it.
  return account.id === SHARED_GREEN_DOT_ID || isGreenDotAccount(account);
}

export function getGreenDotAccounts(accounts: Account[]): Account[] {
  return accounts.filter(isGreenDotAccountRef);
}

export function getGreenDotCombinedBalance(accounts: Account[]): number {
  return getGreenDotAccounts(accounts).reduce((sum, account) => sum + account.balance, 0);
}

/** Strict GreenDot ids only — never other debit/credit accounts. */
export function collectGreenDotAccountIds(
  accounts: Account[],
  transactions: Transaction[] = [],
  incomeEntries: IncomeEntry[] = []
): Set<string> {
  const ids = new Set<string>([SHARED_GREEN_DOT_ID]);

  for (const account of accounts) {
    if (isGreenDotAccountRef(account)) {
      ids.add(account.id);
    }
  }

  for (const entry of incomeEntries) {
    if (ids.has(entry.depositAccountId)) continue;
    const account = accounts.find((item) => item.id === entry.depositAccountId);
    if (account && isGreenDotAccountRef(account)) {
      ids.add(entry.depositAccountId);
    }
  }

  for (const transaction of transactions) {
    // A move's label names both ends ("Cash → GreenDot"); only the GreenDot end is GreenDot,
    // and the accounts check above already found it.
    if (transaction.type === "transfer") continue;
    const method = transaction.paymentMethod?.toLowerCase() ?? "";
    if (!method.includes("greendot")) continue;
    if (transaction.accountId) ids.add(transaction.accountId);
    if (transaction.sourceAccountId) ids.add(transaction.sourceAccountId);
    if (transaction.targetAccountId) ids.add(transaction.targetAccountId);
  }

  return ids;
}

export function transactionTouchesAccount(
  transaction: Transaction,
  accountIds: Set<string>
): boolean {
  return (
    (transaction.accountId != null && accountIds.has(transaction.accountId)) ||
    (transaction.sourceAccountId != null && accountIds.has(transaction.sourceAccountId)) ||
    (transaction.targetAccountId != null && accountIds.has(transaction.targetAccountId))
  );
}

function inDateRange(
  date: string,
  time: string | undefined,
  timestamp: string | undefined,
  start: Date,
  end: Date
) {
  const parsed = parseAppDateTime(date, time, timestamp);
  return parsed >= start && parsed <= end;
}

function getTransactionPayer(transaction: Transaction): Person {
  return transaction.paidByPerson ?? transaction.person;
}

function isOutflow(transaction: Transaction, accountIds: Set<string>): boolean {
  if (transaction.type === "cash_withdrawal") {
    return Boolean(
      transaction.sourceAccountId && accountIds.has(transaction.sourceAccountId)
    );
  }
  if (!transaction.accountId || !accountIds.has(transaction.accountId)) return false;
  return OUTFLOW_TYPES.includes(transaction.type);
}

/**
 * What a move between one's own accounts did to these accounts: + when it came
 * in, − when it went out, nothing when both ends are among them.
 */
export function transferDelta(transaction: Transaction, accountIds: Set<string>): number {
  if (transaction.type !== "transfer") return 0;
  const fromHere = Boolean(transaction.sourceAccountId && accountIds.has(transaction.sourceAccountId));
  const toHere = Boolean(transaction.targetAccountId && accountIds.has(transaction.targetAccountId));
  if (fromHere === toHere) return 0;
  return toHere ? transaction.amount : -transaction.amount;
}

function isGreenDotIncomeTransaction(transaction: Transaction, accountIds: Set<string>): boolean {
  return (
    transaction.type === "income" &&
    Boolean(transaction.accountId && accountIds.has(transaction.accountId))
  );
}

/** Replay each GreenDot account separately so merged balances don't break adjustments. */
export function computeBalanceAdjustmentDeltas(
  accounts: Account[],
  transactions: Transaction[]
): Map<string, number> {
  const deltas = new Map<string, number>();
  const greenDotAccounts = getGreenDotAccounts(accounts);

  for (const account of greenDotAccounts) {
    const accountId = account.id;
    const related = transactions
      .filter(
        (transaction) =>
          transaction.accountId === accountId ||
          transaction.sourceAccountId === accountId ||
          transaction.targetAccountId === accountId
      )
      .sort((a, b) => compareByDateTime(a, b));

    let balance = account.balance;

    for (const transaction of related) {
      if (transaction.type === "transfer") {
        balance -= transferDelta(transaction, new Set([accountId]));
        continue;
      }

      if (transaction.type === "balance_adjustment" && transaction.accountId === accountId) {
        const previousBalance = transaction.previousBalance ?? balance - transaction.amount;
        deltas.set(transaction.id, balance - previousBalance);
        balance = previousBalance;
        continue;
      }

      if (isGreenDotIncomeTransaction(transaction, new Set([accountId]))) {
        balance -= transaction.amount;
        continue;
      }

      if (isOutflow(transaction, new Set([accountId]))) {
        balance += transaction.amount;
      }
    }
  }

  return deltas;
}

/** Income deposited to GreenDot — uses transactions (matches balance + history). */
export function getGreenDotIncomeTotal(
  transactions: Transaction[],
  accountIds: Set<string>,
  range?: { start: Date; end: Date },
  person?: Person,
  trackingStartDate?: string
): number {
  return transactions.reduce((sum, transaction) => {
    if (!isGreenDotIncomeTransaction(transaction, accountIds)) return sum;
    if (!isOnOrAfterGreenDotTracking(transaction, trackingStartDate)) return sum;
    if (person && transaction.person !== person) return sum;
    if (
      range &&
      !inDateRange(
        transaction.date,
        transaction.time,
        transaction.timestamp,
        range.start,
        range.end
      )
    ) {
      return sum;
    }
    return sum + transaction.amount;
  }, 0);
}

export function getAccountSpentTotal(
  transactions: Transaction[],
  accountIds: Set<string>,
  range?: { start: Date; end: Date },
  person?: Person,
  trackingStartDate?: string
): number {
  return transactions.reduce((sum, transaction) => {
    if (!isOutflow(transaction, accountIds)) return sum;
    if (!isOnOrAfterGreenDotTracking(transaction, trackingStartDate)) return sum;
    if (person && getTransactionPayer(transaction) !== person) return sum;
    if (
      range &&
      !inDateRange(
        transaction.date,
        transaction.time,
        transaction.timestamp,
        range.start,
        range.end
      )
    ) {
      return sum;
    }
    return sum + transaction.amount;
  }, 0);
}

/** Money moved in (+) and out (−) of these accounts from the person's other accounts. */
export function getAccountMovedTotal(
  transactions: Transaction[],
  accountIds: Set<string>,
  range?: { start: Date; end: Date },
  person?: Person,
  trackingStartDate?: string
): number {
  return transactions.reduce((sum, transaction) => {
    const delta = transferDelta(transaction, accountIds);
    if (!delta) return sum;
    if (person && transaction.person !== person) return sum;
    if (!isOnOrAfterGreenDotTracking(transaction, trackingStartDate)) return sum;
    if (
      range &&
      !inDateRange(transaction.date, transaction.time, transaction.timestamp, range.start, range.end)
    ) {
      return sum;
    }
    return sum + delta;
  }, 0);
}

export function getAccountAdjustmentsTotal(
  transactions: Transaction[],
  accountIds: Set<string>,
  adjustmentDeltas: Map<string, number>,
  range?: { start: Date; end: Date },
  person?: Person,
  trackingStartDate?: string
): number {
  return transactions.reduce((sum, transaction) => {
    if (transaction.type !== "balance_adjustment") return sum;
    if (!transaction.accountId || !accountIds.has(transaction.accountId)) return sum;
    if (person && transaction.person !== person) return sum;
    if (!isOnOrAfterGreenDotTracking(transaction, trackingStartDate)) return sum;
    if (
      range &&
      !inDateRange(
        transaction.date,
        transaction.time,
        transaction.timestamp,
        range.start,
        range.end
      )
    ) {
      return sum;
    }
    return sum + (adjustmentDeltas.get(transaction.id) ?? 0);
  }, 0);
}

export interface PersonAccountActivity {
  earnedThisMonth: number;
  spentThisMonth: number;
  netThisMonth: number;
  earnedAllTime: number;
  spentAllTime: number;
  netAllTime: number;
  /**
   * Balance corrections attributed to this person. Exposed so the UI can show
   * why net != earned - spent; without it the three numbers visibly disagree.
   */
  adjustmentsThisMonth: number;
  adjustmentsAllTime: number;
  /** Own money moved in from (+) or out to (−) the person's other accounts. Part of net. */
  movedThisMonth: number;
  movedAllTime: number;
}

export interface GreenDotActivitySummary {
  kushvanth: PersonAccountActivity;
  g: PersonAccountActivity;
  greenDotAdjustmentsThisMonth: number;
  greenDotAdjustmentsAllTime: number;
  combinedNetThisMonth: number;
  combinedNetAllTime: number;
  currentBalance: number;
  startingBalance: number;
  trackingStartDate?: string;
}

export function getGreenDotActivitySummary(
  accounts: Account[],
  transactions: Transaction[],
  date: Date = new Date(),
  trackingStartDate?: string
): GreenDotActivitySummary {
  const accountIds = collectGreenDotAccountIds(accounts, transactions, []);
  const adjustmentDeltas = computeBalanceAdjustmentDeltas(accounts, transactions);
  const currentBalance = getGreenDotCombinedBalance(accounts);

  const monthRange = getGreenDotMonthRange(date, trackingStartDate);
  const trackingRange = getGreenDotTrackingRange(date, trackingStartDate);

  const greenDotAdjustmentsThisMonth = monthRange
    ? getAccountAdjustmentsTotal(
        transactions,
        accountIds,
        adjustmentDeltas,
        monthRange,
        undefined,
        trackingStartDate
      )
    : 0;
  const greenDotAdjustmentsAllTime = getAccountAdjustmentsTotal(
    transactions,
    accountIds,
    adjustmentDeltas,
    trackingRange,
    undefined,
    trackingStartDate
  );

  const build = (person: Person): PersonAccountActivity => {
    const earnedThisMonth = monthRange
      ? getGreenDotIncomeTotal(
          transactions,
          accountIds,
          monthRange,
          person,
          trackingStartDate
        )
      : 0;
    const spentThisMonth = monthRange
      ? getAccountSpentTotal(
          transactions,
          accountIds,
          monthRange,
          person,
          trackingStartDate
        )
      : 0;
    const earnedAllTime = getGreenDotIncomeTotal(
      transactions,
      accountIds,
      trackingRange,
      person,
      trackingStartDate
    );
    const spentAllTime = getAccountSpentTotal(
      transactions,
      accountIds,
      trackingRange,
      person,
      trackingStartDate
    );
    const adjustmentsThisMonth = monthRange
      ? getAccountAdjustmentsTotal(
          transactions,
          accountIds,
          adjustmentDeltas,
          monthRange,
          person,
          trackingStartDate
        )
      : 0;
    const adjustmentsAllTime = getAccountAdjustmentsTotal(
      transactions,
      accountIds,
      adjustmentDeltas,
      trackingRange,
      person,
      trackingStartDate
    );

    const movedThisMonth = monthRange
      ? getAccountMovedTotal(transactions, accountIds, monthRange, person, trackingStartDate)
      : 0;
    const movedAllTime = getAccountMovedTotal(transactions, accountIds, trackingRange, person, trackingStartDate);

    return {
      earnedThisMonth,
      spentThisMonth,
      netThisMonth: earnedThisMonth - spentThisMonth + adjustmentsThisMonth + movedThisMonth,
      earnedAllTime,
      spentAllTime,
      netAllTime: earnedAllTime - spentAllTime + adjustmentsAllTime + movedAllTime,
      adjustmentsThisMonth,
      adjustmentsAllTime,
      movedThisMonth,
      movedAllTime,
    };
  };

  const kushvanth = build("kushvanth");
  const g = build("g");

  const combinedNetThisMonth = kushvanth.netThisMonth + g.netThisMonth;
  const combinedNetAllTime = kushvanth.netAllTime + g.netAllTime;
  const startingBalance = trackingStartDate
    ? 0
    : currentBalance - combinedNetAllTime;

  return {
    kushvanth,
    g,
    greenDotAdjustmentsThisMonth,
    greenDotAdjustmentsAllTime,
    combinedNetThisMonth,
    combinedNetAllTime,
    currentBalance,
    startingBalance,
    trackingStartDate,
  };
}

export type AccountLedgerKind = "earned" | "spent" | "adjustment" | "moved";

export interface AccountLedgerEntry {
  id: string;
  date: string;
  time?: string;
  timestamp?: string;
  person: Person;
  kind: AccountLedgerKind;
  label: string;
  amount: number;
  signedAmount: number;
}

export function getGreenDotLedgerEntries(
  accounts: Account[],
  transactions: Transaction[],
  range?: { start: Date; end: Date },
  person?: Person,
  trackingStartDate?: string
): AccountLedgerEntry[] {
  const accountIds = collectGreenDotAccountIds(accounts, transactions, []);
  const adjustmentDeltas = computeBalanceAdjustmentDeltas(accounts, transactions);
  const entries: AccountLedgerEntry[] = [];
  const seenIncomeKeys = new Set<string>();

  for (const transaction of transactions) {
    if (!transactionTouchesAccount(transaction, accountIds)) continue;
    if (!isOnOrAfterGreenDotTracking(transaction, trackingStartDate)) continue;
    if (
      range &&
      !inDateRange(
        transaction.date,
        transaction.time,
        transaction.timestamp,
        range.start,
        range.end
      )
    ) {
      continue;
    }

    if (isGreenDotIncomeTransaction(transaction, accountIds)) {
      const key = `${transaction.person}-${transaction.date}-${transaction.amount}-${transaction.accountId}`;
      if (seenIncomeKeys.has(key)) continue;
      seenIncomeKeys.add(key);

      if (person && transaction.person !== person) continue;

      entries.push({
        id: transaction.id,
        date: transaction.date,
        time: transaction.time,
        timestamp: transaction.timestamp,
        person: transaction.person,
        kind: "earned",
        label: transaction.category ?? transaction.autoMessage ?? "Income",
        amount: transaction.amount,
        signedAmount: transaction.amount,
      });
      continue;
    }

    const moved = transferDelta(transaction, accountIds);
    if (moved) {
      if (person && transaction.person !== person) continue;
      entries.push({
        id: transaction.id,
        date: transaction.date,
        time: transaction.time,
        timestamp: transaction.timestamp,
        person: transaction.person,
        kind: "moved",
        label: transaction.notes ?? transaction.autoMessage ?? "Moved between accounts",
        amount: transaction.amount,
        signedAmount: moved,
      });
      continue;
    }

    if (isOutflow(transaction, accountIds)) {
      const payer = getTransactionPayer(transaction);
      if (person && payer !== person) continue;

      entries.push({
        id: transaction.id,
        date: transaction.date,
        time: transaction.time,
        timestamp: transaction.timestamp,
        person: payer,
        kind: "spent",
        label: transaction.category ?? transaction.notes ?? transaction.autoMessage ?? "Payment",
        amount: transaction.amount,
        signedAmount: -transaction.amount,
      });
      continue;
    }

    if (
      transaction.type === "balance_adjustment" &&
      transaction.accountId &&
      accountIds.has(transaction.accountId)
    ) {
      const signed = adjustmentDeltas.get(transaction.id) ?? 0;
      if (Math.abs(signed) < 0.0001) continue;
      if (person && transaction.person !== person) continue;

      entries.push({
        id: transaction.id,
        date: transaction.date,
        time: transaction.time,
        timestamp: transaction.timestamp,
        person: transaction.person,
        kind: "adjustment",
        label: transaction.notes ?? transaction.autoMessage ?? "GreenDot balance fix",
        amount: Math.abs(signed),
        signedAmount: signed,
      });
    }
  }

  return entries.sort((a, b) => -compareByDateTime(a, b));
}
