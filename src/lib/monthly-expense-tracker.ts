import { isSameMonth } from "date-fns";
import { parseAppDateTime } from "@/lib/formatters";
import type { MonthlyExpense, Person, Transaction } from "@/types";

export interface MonthlyExpenseProgress {
  expenseId: string;
  name: string;
  person: Person;
  planned: number;
  paidThisMonth: number;
  remainingThisMonth: number;
  monthKey: string;
  isVariable: boolean;
}

export function getMonthKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function getMonthLabel(date: Date = new Date()): string {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** Sum all payments toward this expense category in the given calendar month (any payer). */
export function getMonthlyExpensePaid(
  transactions: Transaction[],
  expense: MonthlyExpense,
  monthDate: Date = new Date()
): number {
  return transactions
    .filter((t) => {
      if (t.type !== "expense") return false;

      const txnDate = parseAppDateTime(t.date, t.time, t.timestamp);
      if (!isSameMonth(txnDate, monthDate)) return false;

      if (t.monthlyExpenseId === expense.id) return true;

      if (t.category !== expense.name) return false;

      const owner =
        t.expenseOwner ?? t.beneficiaryPerson ?? (t.person === expense.person ? t.person : null);
      return owner === expense.person;
    })
    .reduce((sum, t) => sum + t.amount, 0);
}

export function getMonthlyExpenseProgress(
  expense: MonthlyExpense,
  transactions: Transaction[],
  monthDate: Date = new Date(),
  pendingPayment = 0
): MonthlyExpenseProgress | null {
  if (expense.amount == null || expense.isVariable) return null;

  const paidThisMonth = getMonthlyExpensePaid(transactions, expense, monthDate);
  const planned = expense.amount;
  const remainingThisMonth = Math.max(0, planned - paidThisMonth - pendingPayment);

  return {
    expenseId: expense.id,
    name: expense.name,
    person: expense.person,
    planned,
    paidThisMonth,
    remainingThisMonth,
    monthKey: getMonthKey(monthDate),
    isVariable: false,
  };
}

export function getDueDateForExpense(
  expense: MonthlyExpense,
  ref: Date = new Date()
): Date | null {
  if (!expense.isRecurring && expense.oneTimeMonth && expense.oneTimeYear) {
    if (expense.dueDate) {
      return parseAppDateTime(expense.dueDate);
    }
    return new Date(expense.oneTimeYear, expense.oneTimeMonth - 1, expense.dueDayOfMonth ?? 1);
  }

  if (expense.dueDayOfMonth) {
    const day = Math.min(expense.dueDayOfMonth, daysInMonth(ref.getFullYear(), ref.getMonth()));
    return new Date(ref.getFullYear(), ref.getMonth(), day, 9, 0, 0);
  }

  return null;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export interface ExpenseDueReminder {
  expense: MonthlyExpense;
  dueDate: Date;
  daysUntil: number;
  label: string;
}

export function getUpcomingExpenseReminders(
  expenses: MonthlyExpense[],
  daysAhead = 3,
  fromDate: Date = new Date()
): ExpenseDueReminder[] {
  const reminders: ExpenseDueReminder[] = [];
  const todayStart = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());

  for (const expense of expenses) {
    const due = getDueDateForExpense(expense, fromDate);
    if (!due) continue;

    const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    const diffMs = dueStart.getTime() - todayStart.getTime();
    const daysUntil = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (daysUntil >= 0 && daysUntil <= daysAhead) {
      let label = "";
      if (daysUntil === 0) label = "Due today";
      else if (daysUntil === 1) label = "Due tomorrow";
      else label = `Due in ${daysUntil} days`;

      reminders.push({ expense, dueDate: due, daysUntil, label });
    }
  }

  return reminders.sort((a, b) => a.daysUntil - b.daysUntil);
}

export function reminderKey(expenseId: string, dueDate: Date): string {
  return `${expenseId}-${dueDate.getFullYear()}-${dueDate.getMonth() + 1}-${dueDate.getDate()}`;
}
