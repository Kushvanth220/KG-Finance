import { roundMoney } from "@/lib/money";
import { formatCurrency } from "@/lib/formatters";
import type { Account, Debt, Person } from "@/types";
import { PERSON_LABELS } from "@/types";

/**
 * Moving your own money between your own accounts: cash into BofA, BofA onto
 * a card. Nothing is spent or earned, so it never counts toward spending or
 * income; two balances move and that is all.
 *
 * Money leaving a bank or cash lowers it; leaving a card (a cash advance) adds
 * to what is owed on it. Money arriving at a bank or cash raises it; arriving
 * at a card pays it down, and the debt linked to the card follows.
 */

const out = (account: Account, amount: number) =>
  roundMoney(account.type === "credit" ? account.balance + amount : account.balance - amount);
const into = (account: Account, amount: number) =>
  roundMoney(account.type === "credit" ? account.balance - amount : account.balance + amount);

/** The two accounts after the move, or null when it can't be made. */
export function applyTransfer(
  accounts: Account[],
  debts: Debt[],
  fromId: string,
  toId: string,
  amount: number
): { accounts: Account[]; debts: Debt[] } | null {
  if (fromId === toId || !(amount > 0)) return null;
  const from = accounts.find((account) => account.id === fromId);
  const to = accounts.find((account) => account.id === toId);
  if (!from || !to) return null;

  const balances = new Map([
    [from.id, out(from, amount)],
    [to.id, into(to, amount)],
  ]);
  const nextAccounts = accounts.map((account) =>
    balances.has(account.id) ? { ...account, balance: balances.get(account.id)! } : account
  );
  // A card's debt mirrors what is owed on it.
  const nextDebts = debts.map((debt) => {
    if (!debt.linkedAccountId || !balances.has(debt.linkedAccountId)) return debt;
    const card = nextAccounts.find((account) => account.id === debt.linkedAccountId);
    return card?.type === "credit" ? { ...debt, amount: card.balance } : debt;
  });
  return { accounts: nextAccounts, debts: nextDebts };
}

/** Undo a move: the same amount back the other way. */
export function reverseTransfer(
  accounts: Account[],
  debts: Debt[],
  fromId: string,
  toId: string,
  amount: number
): { accounts: Account[]; debts: Debt[] } | null {
  return applyTransfer(accounts, debts, toId, fromId, amount);
}

/** "Kushvanth moved $200 from Cash to BofA". */
export function buildTransferMessage(opts: { person: Person; amount: number; from: string; to: string }): string {
  return `${PERSON_LABELS[opts.person]} moved ${formatCurrency(opts.amount)} from ${opts.from} to ${opts.to}`;
}

/** What the move does to each side, in words, for the confirmation line. */
export function describeTransferEffect(from: Account, to: Account, amount: number): string {
  const money = formatCurrency(amount);
  const leaving = from.type === "credit" ? `${from.name} owes ${money} more` : `${from.name} goes down ${money}`;
  const arriving = to.type === "credit" ? `${to.name} owes ${money} less` : `${to.name} goes up ${money}`;
  return `${leaving}; ${arriving}.`;
}
