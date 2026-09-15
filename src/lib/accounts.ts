import type { Account, FinanceState, Person } from "@/types";

export const SHARED_GREEN_DOT_ID = "acc-shared-greendot";

function isGreenDotAccount(account: Account) {
  return account.type === "debit" && account.name.trim().toLowerCase().includes("greendot");
}

export function isSharedAccount(account: Account) {
  return Boolean(account.shared);
}

export function accountBelongsToPerson(account: Account, person: Person) {
  return account.shared || account.person === person;
}

export function getAccountsForPerson(accounts: Account[], person: Person) {
  return accounts.filter((account) => accountBelongsToPerson(account, person));
}

function remapAccountId(accountId: string | undefined, fromIds: Set<string>, toId: string) {
  if (!accountId || !fromIds.has(accountId)) return accountId;
  return toId;
}

/** Merge duplicate per-person GreenDot debits into one shared workspace account. */
export function normalizeSharedGreenDotAccounts<
  T extends Pick<FinanceState, "accounts" | "incomeEntries" | "transactions">,
>(state: T): T | null {
  const existingShared = state.accounts.find(
    (account) => account.id === SHARED_GREEN_DOT_ID || (account.shared && isGreenDotAccount(account))
  );

  const greenDots = state.accounts.filter(isGreenDotAccount);
  if (greenDots.length === 0) return null;

  if (greenDots.length === 1 && greenDots[0]!.shared) {
    return null;
  }

  if (greenDots.length === 1) {
    const only = greenDots[0]!;
    return {
      ...state,
      accounts: state.accounts.map((account) =>
        account.id === only.id ? { ...account, shared: true, name: "GreenDot" } : account
      ),
    };
  }

  const keepId = existingShared?.id ?? SHARED_GREEN_DOT_ID;
  const removeIds = new Set(greenDots.map((account) => account.id));
  const mergedBalance = greenDots.reduce((sum, account) => sum + account.balance, 0);

  const accounts = [
    ...state.accounts.filter((account) => !removeIds.has(account.id) || account.id === keepId),
    ...(existingShared
      ? []
      : [
          {
            id: keepId,
            person: "kushvanth" as Person,
            name: "GreenDot",
            type: "debit" as const,
            balance: mergedBalance,
            shared: true,
          },
        ]),
  ]
    .filter((account, index, list) => list.findIndex((item) => item.id === account.id) === index)
    .map((account) => {
      if (account.id !== keepId) return account;
      return {
        ...account,
        shared: true,
        name: "GreenDot",
        balance: mergedBalance,
        type: "debit" as const,
      };
    });

  const incomeEntries = state.incomeEntries.map((entry) => ({
    ...entry,
    depositAccountId: remapAccountId(entry.depositAccountId, removeIds, keepId) ?? entry.depositAccountId,
  }));

  const transactions = state.transactions.map((transaction) => ({
    ...transaction,
    accountId: remapAccountId(transaction.accountId, removeIds, keepId),
    sourceAccountId: remapAccountId(transaction.sourceAccountId, removeIds, keepId),
    targetAccountId: remapAccountId(transaction.targetAccountId, removeIds, keepId),
  }));

  return {
    ...state,
    accounts,
    incomeEntries,
    transactions,
  };
}

export function applySharedAccountNormalization(state: FinanceState): FinanceState {
  return normalizeSharedGreenDotAccounts(state) ?? state;
}
