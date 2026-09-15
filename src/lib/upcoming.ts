import { getDueDateForExpense, getMonthlyExpensePaid } from "@/lib/monthly-expense-tracker";
import { daysUntilDue, type Reminder } from "@/lib/ai/reminders";
import type { MonthlyExpense, Person, Transaction } from "@/types";

/**
 * What is about to land: bills from Memory's list and reminders from
 * Jarvis's, each with how many days away it is. The home page's "Coming up"
 * strip and the greeting's one-line nudge read the same list, so they can
 * never disagree about what is due.
 */

export interface Upcoming {
  key: string;
  name: string;
  daysUntil: number;
  amount: number | null;
  kind: "bill" | "reminder";
}

export function whenLabel(days: number): string {
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

export function upcomingFor(
  monthlyExpenses: MonthlyExpense[],
  transactions: Transaction[],
  reminders: Reminder[],
  person: Person,
  daysAhead = 7,
  now: Date = new Date()
): Upcoming[] {
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayDiff = (due: Date) =>
    Math.round(
      (new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime() - todayStart.getTime()) / 86400000
    );

  const list: Upcoming[] = [];

  for (const bill of monthlyExpenses) {
    if (bill.person !== person) continue;
    let due = getDueDateForExpense(bill, now);
    if (!due) continue;
    let days = dayDiff(due);
    // A recurring bill whose day has passed this month is next month's.
    if (days < 0 && bill.isRecurring) {
      const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      due = getDueDateForExpense(bill, next);
      if (!due) continue;
      days = dayDiff(due);
    }
    if (days < 0 || days > daysAhead) continue;
    if (!bill.isRecurring && bill.isPaid) continue;
    if (bill.isRecurring && bill.amount && getMonthlyExpensePaid(transactions, bill, due) >= bill.amount) continue;
    list.push({ key: `bill-${bill.id}`, name: bill.name, daysUntil: days, amount: bill.amount, kind: "bill" });
  }

  for (const reminder of reminders) {
    if (reminder.done) continue;
    const days = daysUntilDue(reminder, now);
    if (days === null || days < 0 || days > daysAhead) continue;
    list.push({ key: `rem-${reminder.id}`, name: reminder.text, daysUntil: days, amount: null, kind: "reminder" });
  }

  return list.sort((a, b) => a.daysUntil - b.daysUntil);
}
