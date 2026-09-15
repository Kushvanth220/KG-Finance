import { getExpenseCategoryColor } from "@/components/dashboard/dashboard-charts";
import { getTransactionExpenseShare } from "@/lib/calculations";
import { parseAppDateTime } from "@/lib/formatters";
import { matchSpendCategoryFromNote } from "@/lib/spend-categories";
import type { Person, SpendCategory, Transaction } from "@/types";

export interface CategorySpendRow {
  name: string;
  amount: number;
  color: string;
}

function resolveTransactionSpendCategory(
  tx: Transaction,
  spendCategories: SpendCategory[]
): string | null {
  const categoryField = tx.category?.trim();
  if (categoryField) {
    const exact = spendCategories.find(
      (c) => c.name.toLowerCase() === categoryField.toLowerCase()
    );
    if (exact) return exact.name;
  }

  const searchText = [tx.category, tx.notes, tx.autoMessage].filter(Boolean).join(" ");
  const matched = matchSpendCategoryFromNote(searchText, spendCategories);
  return matched?.name ?? null;
}

function sumMappedSpending(
  transactions: Transaction[],
  person: Person,
  spendCategories: SpendCategory[]
): Map<string, number> {
  const spent = new Map<string, number>();

  for (const tx of transactions) {
    if (tx.type !== "expense") continue;
    const share = getTransactionExpenseShare(tx, person);
    if (share === 0) continue;

    const categoryName = resolveTransactionSpendCategory(tx, spendCategories);
    if (!categoryName) continue;

    spent.set(categoryName, (spent.get(categoryName) ?? 0) + share);
  }

  return spent;
}

function hasMappedSpendingOutsidePeriod(
  transactions: Transaction[],
  person: Person,
  spendCategories: SpendCategory[],
  categoryName: string,
  periodStart: Date,
  periodEnd: Date
): boolean {
  for (const tx of transactions) {
    if (tx.type !== "expense") continue;
    if (getTransactionExpenseShare(tx, person) === 0) continue;
    if (resolveTransactionSpendCategory(tx, spendCategories) !== categoryName) continue;

    const txDate = parseAppDateTime(tx.date, tx.time, tx.timestamp);
    if (txDate < periodStart || txDate > periodEnd) return true;
  }

  return false;
}

export function buildLearnedCategorySpending(
  transactions: Transaction[],
  person: Person,
  spendCategories: SpendCategory[],
  periodTransactions: Transaction[],
  periodStart: Date,
  periodEnd: Date
): {
  spent: CategorySpendRow[];
  skipped: string[];
} {
  const spentByName = sumMappedSpending(periodTransactions, person, spendCategories);

  const spent: CategorySpendRow[] = [];
  const skipped: string[] = [];

  spendCategories.forEach((category, index) => {
    const amount = spentByName.get(category.name) ?? 0;
    if (amount > 0) {
      spent.push({
        name: category.name,
        amount,
        color: getExpenseCategoryColor(index),
      });
      return;
    }

    if (
      hasMappedSpendingOutsidePeriod(
        transactions,
        person,
        spendCategories,
        category.name,
        periodStart,
        periodEnd
      )
    ) {
      skipped.push(category.name);
    }
  });

  spent.sort((a, b) => b.amount - a.amount);
  skipped.sort((a, b) => a.localeCompare(b));

  return { spent, skipped };
}
