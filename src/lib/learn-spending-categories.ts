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
): { byCategory: Map<string, number>; unmapped: number } {
  const byCategory = new Map<string, number>();
  let unmapped = 0;

  for (const tx of transactions) {
    if (tx.type !== "expense") continue;
    const share = getTransactionExpenseShare(tx, person);
    if (share === 0) continue;

    const categoryName = resolveTransactionSpendCategory(tx, spendCategories);
    // Money that matches no category is still money. Dropping it here is how
    // the headline drifted away from the ledger.
    if (!categoryName) {
      unmapped += share;
      continue;
    }

    byCategory.set(categoryName, (byCategory.get(categoryName) ?? 0) + share);
  }

  return { byCategory, unmapped };
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
  /** Categories with money spent in them, largest first. What the chart draws. */
  spent: CategorySpendRow[];
  /** Categories used in other periods but not this one. */
  skipped: string[];
  /**
   * Categories that came out NEGATIVE — a refund or settlement bigger than
   * anything spent against them.
   *
   * A chart cannot draw a negative slice, so these stay out of `spent`. They
   * must still reach the total: leaving a $115 refund out made the dashboard
   * claim $115 more spending than the ledger held.
   */
  offsets: CategorySpendRow[];
  /** Shares on rows matching no category at all. Rare, and equally real. */
  unmapped: number;
} {
  const { byCategory, unmapped } = sumMappedSpending(periodTransactions, person, spendCategories);

  const spent: CategorySpendRow[] = [];
  const offsets: CategorySpendRow[] = [];
  const skipped: string[] = [];

  spendCategories.forEach((category, index) => {
    const amount = byCategory.get(category.name) ?? 0;

    if (amount > 0) {
      spent.push({ name: category.name, amount, color: getExpenseCategoryColor(index) });
      return;
    }

    if (amount < 0) {
      offsets.push({ name: category.name, amount, color: getExpenseCategoryColor(index) });
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
  offsets.sort((a, b) => a.amount - b.amount);
  skipped.sort((a, b) => a.localeCompare(b));

  return { spent, skipped, offsets, unmapped };
}
