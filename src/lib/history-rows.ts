import { categoryLook } from "@/lib/category-look";
import { isRefund } from "@/lib/transaction-messages";
import type { Account, SpendCategory, Transaction } from "@/types";

/**
 * How History shows a row: a short title, an icon, and one line of who and
 * where. Each row used to be the whole auto-written sentence ("Kushvanth paid
 * $15 for Settelment via Green Dot · Debit Account (shared: …)"), which had to
 * be read to the end to find out what it was. The sentence is still there,
 * under Details.
 */

/** A few words for what the row was. */
export function historyTitle(transaction: Transaction): string {
  const note = transaction.notes?.trim();
  const withNote = (title: string) => (note && !title.toLowerCase().includes(note.toLowerCase()) ? `${title} · ${note}` : title);
  switch (transaction.type) {
    case "expense": {
      const title = withNote(transaction.category ?? "Spend");
      return isRefund(transaction) ? `Refund · ${title}` : title;
    }
    case "income":
      return withNote(transaction.category ?? "Income");
    case "transfer":
      return withNote(transaction.paymentMethod ?? "Moved between accounts");
    case "settlement":
      return withNote("Settle up");
    case "balance_adjustment":
      return withNote(`Balance fix · ${transaction.paymentMethod ?? "account"}`);
    case "debt_payment":
    case "credit_payment":
      return withNote(`Paid ${transaction.category ?? "a debt"}`);
    case "cash_withdrawal":
      return `Cash from ${transaction.paymentMethod ?? "the bank"}`;
    default:
      return withNote(transaction.category ?? "Entry");
  }
}

const TYPE_ICON: Partial<Record<Transaction["type"], string>> = {
  income: "💵",
  transfer: "⇄",
  settlement: "🤝",
  balance_adjustment: "✎",
  debt_payment: "🏦",
  credit_payment: "💳",
  cash_withdrawal: "🏧",
};

/** The row's icon: its category's own for a spend, one per kind otherwise. */
export function historyIcon(transaction: Transaction, categories: SpendCategory[]): string {
  if (transaction.type === "expense") {
    const name = transaction.category ?? "";
    const category = categories.find((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase());
    return categoryLook(category ?? { name }).emoji;
  }
  return TYPE_ICON[transaction.type] ?? "•";
}

/** The account a row is about, by name. */
export function historyAccountName(transaction: Transaction, accounts: Map<string, Account>): string | null {
  const id = transaction.type === "transfer" ? transaction.sourceAccountId : transaction.accountId;
  return (id ? accounts.get(id)?.name : undefined) ?? null;
}

/**
 * Whether a row matches what was typed: any word of its title, the full
 * sentence, the note, the account, or the amount ("19.67", "19", "$19.67").
 */
export function matchesSearch(transaction: Transaction, query: string, extra: string[] = []): boolean {
  const words = query.toLowerCase().replace(/[$,]/g, "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = [
    historyTitle(transaction),
    transaction.autoMessage,
    transaction.notes,
    transaction.category,
    transaction.paymentMethod,
    Math.abs(transaction.amount).toFixed(2),
    ...extra,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[$,]/g, "");
  return words.every((word) => haystack.includes(word));
}

/** Money that left: spends and payments, not moves, settlements or fixes. */
const isOut = (t: Transaction) =>
  (t.type === "expense" && !isRefund(t)) || t.type === "debt_payment" || t.type === "credit_payment";
const isIn = (t: Transaction) => t.type === "income" || isRefund(t);

export interface HistoryDay {
  date: string;
  rows: Transaction[];
  out: number;
  in: number;
}

/** Rows (already newest first) cut into days, each with what went out and came in. */
export function groupByDay(rows: Transaction[]): HistoryDay[] {
  const days: HistoryDay[] = [];
  for (const row of rows) {
    let day = days[days.length - 1];
    if (!day || day.date !== row.date) {
      day = { date: row.date, rows: [], out: 0, in: 0 };
      days.push(day);
    }
    day.rows.push(row);
    if (isOut(row)) day.out += Math.abs(row.amount);
    else if (isIn(row)) day.in += Math.abs(row.amount);
  }
  return days;
}
