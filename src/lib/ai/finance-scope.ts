import type { AiUserId } from "@/lib/ai/person";
import { getAiUserDisplayName } from "@/lib/ai/person";
import type { FinanceState, Person, Transaction } from "@/types";
import { zonedMonth, zonedToday } from "@/lib/zoned-date";
import { OWNER_LABEL, MEMBER_LABEL } from "@/lib/branding";
import { isGreenDotPart } from "@/lib/accounts";

function transactionBelongsToUser(transaction: Transaction, userId: Person): boolean {
  if (transaction.person === userId) return true;
  if (transaction.paidByPerson === userId) return true;
  if (transaction.beneficiaryPerson === userId) return true;
  if (transaction.expenseOwner === userId) return true;
  if (transaction.expenseShares?.[userId]) return true;
  return false;
}

/** Scope workspace finance data to one user's assistant context. */
export function scopeFinanceStateForUser(state: FinanceState, userId: AiUserId): FinanceState {
  const accounts = state.accounts.filter(
    (account) => account.shared || account.person === userId
  );

  const accountIds = new Set(accounts.map((account) => account.id));

  const transactions = state.transactions.filter((transaction) => {
    if (transactionBelongsToUser(transaction, userId)) return true;
    if (transaction.accountId && accountIds.has(transaction.accountId)) {
      return transactionBelongsToUser(transaction, userId);
    }
    if (transaction.sourceAccountId && accountIds.has(transaction.sourceAccountId)) {
      return transactionBelongsToUser(transaction, userId);
    }
    return false;
  });

  return {
    incomeSources: state.incomeSources.filter((source) => source.person === userId),
    incomeEntries: state.incomeEntries.filter((entry) => entry.person === userId),
    spendCategories: state.spendCategories,
    monthlyExpenses: state.monthlyExpenses.filter((expense) => expense.person === userId),
    accounts,
    debts: state.debts.filter((debt) => debt.person === userId),
    transactions,
    settlementHistory: state.settlementHistory.filter(
      (entry) => entry.paidBy === userId || entry.benefited === userId
    ),
    settlementBalance: state.settlementBalance,
    deletedHistory: [],
    greenDotTrackingStartDate: state.greenDotTrackingStartDate,
  };
}

function monthKey(date: string) {
  return date.slice(0, 7);
}

function sumExpensesThisMonth(transactions: Transaction[]) {
  const key = zonedMonth();
  return transactions
    .filter((tx) => tx.type === "expense" && tx.date.startsWith(key))
    .reduce((sum, tx) => sum + tx.amount, 0);
}

export function buildFinanceContextSummary(
  state: FinanceState,
  userId: AiUserId,
  options?: { compact?: boolean }
): string {
  const name = getAiUserDisplayName(userId);
  const today = zonedToday();
  const compact = Boolean(options?.compact);
  const txLimit = compact ? 6 : 25;
  const incomeLimit = compact ? 3 : 8;

  const accountLines = state.accounts
    .map(
      (account) =>
        `- id=${account.id} | ${account.name} (${account.type}${account.shared ? ", shared" : ""}${isGreenDotPart(account) ? ", this person's own part of the Green Dot card both use" : ""}): $${account.balance.toFixed(2)}`
    )
    .join("\n");

  const incomeSourceLines = state.incomeSources
    .map((source) => `- id=${source.id} | ${source.name}`)
    .join("\n");

  const recentIncome = [...state.incomeEntries]
    .sort((a, b) => (b.timestamp ?? b.date).localeCompare(a.timestamp ?? a.date))
    .slice(0, incomeLimit)
    .map(
      (entry) =>
        `- ${entry.date} $${entry.amount.toFixed(2)} source_id=${entry.sourceId} → account_id=${entry.depositAccountId}`
    )
    .join("\n");

  const debtLines = state.debts
    .map((debt) => `- id=${debt.id} | ${debt.name}: $${debt.amount.toFixed(2)}`)
    .join("\n");

  const recentTx = [...state.transactions]
    .sort((a, b) => (b.timestamp ?? b.date).localeCompare(a.timestamp ?? a.date))
    .slice(0, txLimit)
    .map(
      (tx) =>
        `- ${tx.date} ${tx.type} $${tx.amount.toFixed(2)} ${tx.category ?? tx.notes ?? ""}`.trim()
    )
    .join("\n");

  const monthSpend = sumExpensesThisMonth(state.transactions);
  const totalAccountBalance = state.accounts.reduce((sum, account) => sum + account.balance, 0);

  return [
    `Financial snapshot for ${name} (user_id=${userId}) — today is ${today}.`,
    `Use ONLY these numbers. If something is missing, say you do not see it — never guess.`,
    "",
    `Total account balance (scoped): $${totalAccountBalance.toFixed(2)}`,
    `Spent this month (${monthKey(today)}): $${monthSpend.toFixed(2)}`,
    "",
    "Accounts (use id in tools):",
    accountLines || "- none",
    "",
    "Income sources:",
    incomeSourceLines || "- none",
    "",
    "Recent income deposits:",
    recentIncome || "- none",
    "",
    "Debts:",
    debtLines || "- none",
    "",
    `Recent transactions (${state.transactions.length} total in scope):`,
    recentTx || "- none",
    "",
    `Settlement balance (positive = ${MEMBER_LABEL} owes ${OWNER_LABEL}): $${state.settlementBalance.toFixed(2)}`,
  ].join("\n");
}

export function buildWorkspaceFinanceContextSummary(
  state: FinanceState,
  options?: { compact?: boolean }
): string {
  const today = zonedToday();
  const kushScoped = scopeFinanceStateForUser(state, "kushvanth");
  const gScoped = scopeFinanceStateForUser(state, "g");

  return [
    `Workspace finance snapshot — today is ${today}. Use ONLY these numbers.`,
    "",
    buildFinanceContextSummary(kushScoped, "kushvanth", options),
    "",
    "---",
    "",
    buildFinanceContextSummary(gScoped, "g", options),
    "",
    `Shared settlement balance (positive = ${MEMBER_LABEL} owes ${OWNER_LABEL}): $${state.settlementBalance.toFixed(2)}`,
  ].join("\n");
}
