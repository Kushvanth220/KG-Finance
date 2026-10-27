import { PERSON_LABELS, type Account, type Person } from "@/types";

export const SHARED_GREEN_DOT_ID = "acc-shared-greendot";

/**
 * The card's name, reduced to letters and digits.
 *
 * This existed as `name.trim().toLowerCase()`, which meant an account called
 * "Green Dot" never matched the literal "greendot" — one space, and every
 * shared-account feature in the app went quiet: the two per-person cards were
 * never merged, neither was ever flagged shared, and the activity panel had
 * nothing to show. Punctuation and case are equally irrelevant to which card
 * this is, so they all come out before the comparison.
 */
function normalizedAccountName(account: Account) {
  return account.name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function isGreenDotAccount(account: Account) {
  return account.type === "debit" && normalizedAccountName(account).includes("greendot");
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

/**
 * One person's part of the Green Dot card.
 *
 * Both of them use the one physical card, and each keeps their own account
 * for it: their own pay lands in it, their own spends come out of it, so its
 * balance is their share of the money on the card. The card itself holds the
 * parts added together.
 *
 * The parts are never merged into one account. A merge used to be attempted
 * on every load and pull; it summed the two balances into one and pointed every
 * row at the new account, which throws away who the money belongs to — the
 * one thing the two parts exist to say — and cannot be undone. An old merged
 * account (`shared: true`) is left as it is and shown as before.
 */
export function isGreenDotPart(account: Account) {
  return isGreenDotAccount(account) && !account.shared;
}

/** Every person's part of the Green Dot card, the owner's first. */
export function getGreenDotParts(accounts: Account[]): Account[] {
  return accounts
    .filter(isGreenDotPart)
    .sort((a, b) => Number(a.person !== "kushvanth") - Number(b.person !== "kushvanth"));
}

/** An account's name where both people's accounts show together: "G's Green Dot" for a part. */
export function accountLabel(account: Account) {
  return isGreenDotPart(account) ? `${PERSON_LABELS[account.person]}'s ${account.name}` : account.name;
}

/** What the Green Dot card holds: every part added together. */
export function getGreenDotCardBalance(accounts: Account[]): number {
  return getGreenDotParts(accounts).reduce((sum, account) => sum + account.balance, 0);
}
