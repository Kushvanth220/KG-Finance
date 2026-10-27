import { compareByDateTime, parseAppDateTime } from "@/lib/formatters";
import { roundMoney } from "@/lib/money";
import type { Account, Transaction } from "@/types";

/**
 * What was left in an account right after each History row.
 *
 * Nothing stores it, so it is worked out backwards from today's balances: the
 * newest row left today's balance, undoing that row gives what the row before
 * it left, and so on down the list. Worked out this way it always ends at the
 * balance the Accounts page shows, and deleting a row, or logging one late
 * with an earlier date, can never leave a stale figure behind on the others.
 *
 * A balance fix is the one row that records what came before it
 * (`previousBalance`), so the walk takes that number rather than undoing a
 * guess — anything the app never saw stays on the far side of the fix.
 */

export interface BalanceAfter {
  accountId: string;
  /** The account's stored balance right after the row: money held, or owed on a card. */
  balance: number;
}

/** Cents, and never −0: undoing $5 from $5 can land on −0, which prints as "-$0". */
const cents = (value: number) => roundMoney(value) || 0;

interface BalanceEffect {
  accountId: string;
  /** + raised the stored balance, − lowered it. On a card the balance is what is owed. */
  delta: number;
}

/** What one row did to each account it moved, mirroring how the store applied it. */
export function balanceEffects(transaction: Transaction, byId: Map<string, Account>): BalanceEffect[] {
  const { amount } = transaction;
  switch (transaction.type) {
    case "expense":
    case "debt_payment":
    case "credit_payment": {
      const effects: BalanceEffect[] = [];
      const account = transaction.accountId ? byId.get(transaction.accountId) : undefined;
      if (account?.type === "cash" && transaction.sourceAccountId) {
        // Cash taken out for this spend: the bank pays, the wallet only passes it on.
        effects.push({ accountId: transaction.sourceAccountId, delta: -amount });
      } else if (account) {
        effects.push({ accountId: account.id, delta: account.type === "credit" ? amount : -amount });
      }
      // Paying a card's debt pays the card down.
      if (transaction.type !== "expense" && transaction.targetAccountId) {
        effects.push({ accountId: transaction.targetAccountId, delta: -amount });
      }
      return effects;
    }
    case "income":
      return transaction.accountId ? [{ accountId: transaction.accountId, delta: amount }] : [];
    case "transfer": {
      const from = transaction.sourceAccountId ? byId.get(transaction.sourceAccountId) : undefined;
      const to = transaction.targetAccountId ? byId.get(transaction.targetAccountId) : undefined;
      if (!from || !to) return [];
      return [
        { accountId: from.id, delta: from.type === "credit" ? amount : -amount },
        { accountId: to.id, delta: to.type === "credit" ? -amount : amount },
      ];
    }
    default:
      // A cash withdrawal's money moves on its spend row, and a settlement or
      // a debt note moves no account at all.
      return [];
  }
}

/** One account's share of a row: how much it moved and what it left. */
export interface AccountMove {
  accountId: string;
  /** + raised the stored balance, − lowered it. */
  change: number;
  /** The balance right after the row. */
  balance: number;
}

/**
 * Walk back from today's balances, newest row first, undoing each row in turn.
 * `keepGoing` ends the walk at the first row it turns down; `onRow` sees every
 * row walked, with what it did to each account it moved. Returns the balances
 * as they stood before the last row undone.
 */
function walkBack(
  accounts: Account[],
  transactions: Transaction[],
  keepGoing?: (transaction: Transaction) => boolean,
  onRow?: (transaction: Transaction, moves: AccountMove[]) => void
): Map<string, number> {
  const byId = new Map(accounts.map((account) => [account.id, account]));
  // Raw running totals; only what is shown is rounded, so cents never drift.
  const running = new Map(accounts.map((account) => [account.id, account.balance]));

  // Newest first. The sort is stable, so rows written in one go keep the order
  // they were stored in, which is newest first too.
  for (const transaction of [...transactions].sort(compareByDateTime)) {
    if (keepGoing && !keepGoing(transaction)) break;
    const moves: AccountMove[] = [];

    if (transaction.type === "balance_adjustment") {
      const id = transaction.accountId;
      const balance = id ? running.get(id) : undefined;
      if (id && balance != null) {
        const before = transaction.previousBalance ?? balance;
        moves.push({ accountId: id, change: cents(balance - before), balance: cents(balance) });
        running.set(id, before);
      }
    } else {
      for (const { accountId, delta } of balanceEffects(transaction, byId)) {
        const balance = running.get(accountId);
        if (balance == null) continue;
        moves.push({ accountId, change: cents(delta), balance: cents(balance) });
        running.set(accountId, balance - delta);
      }
    }

    onRow?.(transaction, moves);
  }

  return running;
}

/** For every row that moved an account, each such account's balance right after it. */
export function balancesAfter(accounts: Account[], transactions: Transaction[]): Map<string, BalanceAfter[]> {
  const after = new Map<string, BalanceAfter[]>();
  walkBack(accounts, transactions, undefined, (transaction, moves) => {
    if (moves.length) after.set(transaction.id, moves.map(({ accountId, balance }) => ({ accountId, balance })));
  });
  return after;
}

/** True for a row on or after the start of a day (yyyy-MM-dd), read the way the walk orders rows. */
const fromDay = (day: string) => {
  const start = parseAppDateTime(day, "00:00:00").getTime();
  return (transaction: Transaction) =>
    parseAppDateTime(transaction.date, transaction.time, transaction.timestamp).getTime() >= start;
};

/**
 * Each account's balance at the start of a day (yyyy-MM-dd): today's balance
 * with every row from that day on undone.
 */
export function balancesAtStartOf(day: string, accounts: Account[], transactions: Transaction[]): Map<string, number> {
  const running = walkBack(accounts, transactions, fromDay(day));
  return new Map([...running].map(([id, balance]) => [id, cents(balance)]));
}

/** Every move on these accounts since a day, newest first: the row, how much, and what was left. */
export function accountMovesSince(
  day: string,
  accountIds: string[],
  accounts: Account[],
  transactions: Transaction[]
): { transaction: Transaction; move: AccountMove }[] {
  const wanted = new Set(accountIds);
  const found: { transaction: Transaction; move: AccountMove }[] = [];
  walkBack(accounts, transactions, fromDay(day), (transaction, moves) => {
    for (const move of moves) if (wanted.has(move.accountId)) found.push({ transaction, move });
  });
  return found;
}
