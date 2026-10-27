import type { FinanceState } from "@/types";
import { recalculateSettlementState } from "@/lib/transaction-reversal";
import { roundMoney } from "@/lib/money";

/**
 * Two phones, one workspace record.
 *
 * The cloud holds the finance state as a single document, and each phone
 * used to upload its whole copy. Whichever phone saved last won — so a spend
 * logged on one phone while the other had an unsynced edit was silently
 * overwritten, and the two never agreed.
 *
 * This is a three-way merge: the state both phones last agreed on (base),
 * this phone's copy (local) and the cloud's (remote). Every list is matched
 * by id:
 *  - added on either side → kept;
 *  - deleted on either side since base → gone;
 *  - changed on one side → that side's version;
 *  - changed on both → field by field, and for the running numbers — an
 *    account's balance, a debt's remaining amount — both changes are applied
 *    as deltas, because each side's transactions moved them independently.
 *
 * Balance is recomputed from the merged history rather than merged as a
 * number. Without a base (the first sync after this shipped) nothing can be
 * told apart from an addition, so the two sides are unioned.
 */

type Keyed = { id: string };

/** Fields that each side moves by its own transactions; deltas add, they do not compete. */
const DELTA_FIELDS: Record<string, readonly string[]> = {
  accounts: ["balance"],
  debts: ["amount"],
};

function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (typeof a !== "object") return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function mergeRecord<T extends object>(base: T | undefined, local: T, remote: T, deltaFields: readonly string[]): T {
  if (same(local, remote)) return local;
  if (!base) return remote;
  if (same(local, base)) return remote;
  if (same(remote, base)) return local;

  // Both sides touched it: settle each field on its own.
  const out: Record<string, unknown> = { ...(remote as Record<string, unknown>) };
  const b = base as Record<string, unknown>;
  const l = local as Record<string, unknown>;
  const r = remote as Record<string, unknown>;
  for (const key of new Set([...Object.keys(l), ...Object.keys(r), ...Object.keys(b)])) {
    const lv = l[key];
    const rv = r[key];
    const bv = b[key];
    if (same(lv, rv)) {
      out[key] = lv;
    } else if (same(lv, bv)) {
      out[key] = rv;
    } else if (same(rv, bv)) {
      out[key] = lv;
    } else if (deltaFields.includes(key) && typeof lv === "number" && typeof rv === "number" && typeof bv === "number") {
      out[key] = roundMoney(bv + (lv - bv) + (rv - bv));
    } else {
      // A genuine tussle over the same field: this phone's edit stands; the
      // other phone merges symmetrically and settles on whatever reached the
      // cloud last.
      out[key] = lv;
    }
  }
  return out as T;
}

/**
 * Merge one list by id. Order: remote's order for what it has, then local
 * additions — at the front for lists the app keeps newest-first, at the
 * back otherwise.
 */
export function mergeById<T extends Keyed>(
  base: T[] | undefined,
  local: T[] | undefined,
  remote: T[] | undefined,
  options: { newestFirst?: boolean; deltaFields?: readonly string[] } = {}
): T[] {
  const baseMap = new Map((base ?? []).map((item) => [item.id, item]));
  const localMap = new Map((local ?? []).map((item) => [item.id, item]));
  const deltaFields = options.deltaFields ?? [];

  const out: T[] = [];
  const seen = new Set<string>();

  for (const item of remote ?? []) {
    const inBase = baseMap.has(item.id);
    const mine = localMap.get(item.id);
    if (mine) {
      out.push(mergeRecord(baseMap.get(item.id), mine, item, deltaFields));
    } else if (!inBase) {
      out.push(item); // added on the other phone
    }
    // In base, gone locally: deleted here — stays deleted.
    seen.add(item.id);
  }

  const added: T[] = [];
  for (const item of local ?? []) {
    if (seen.has(item.id)) continue;
    // Not in remote: either added here, or deleted on the other phone.
    if (!baseMap.has(item.id)) added.push(item);
  }

  return options.newestFirst ? [...added, ...out] : [...out, ...added];
}

function scalar<T>(base: T | undefined, local: T | undefined, remote: T | undefined): T | undefined {
  if (same(local, remote)) return local;
  if (same(local, base)) return remote;
  return local;
}

/** A setting changed as one piece: whichever side changed it, or the later change when both did. */
function newestSetting<T extends { updatedAt: string }>(
  base: T | undefined,
  local: T | undefined,
  remote: T | undefined
): T | undefined {
  if (same(local, remote)) return local;
  if (!local) return remote;
  if (!remote) return local;
  if (same(local, base)) return remote;
  if (same(remote, base)) return local;
  return remote.updatedAt > local.updatedAt ? remote : local;
}

export function mergeFinanceStates(
  base: FinanceState | null,
  local: FinanceState,
  remote: FinanceState
): FinanceState {
  const b = base ?? undefined;

  const settlementHistory = mergeById(b?.settlementHistory, local.settlementHistory, remote.settlementHistory, { newestFirst: true });
  const inter = recalculateSettlementState(settlementHistory);

  return {
    incomeSources: mergeById(b?.incomeSources, local.incomeSources, remote.incomeSources),
    incomeEntries: mergeById(b?.incomeEntries, local.incomeEntries, remote.incomeEntries, { newestFirst: true }),
    spendCategories: mergeById(b?.spendCategories, local.spendCategories, remote.spendCategories),
    monthlyExpenses: mergeById(b?.monthlyExpenses, local.monthlyExpenses, remote.monthlyExpenses),
    accounts: mergeById(b?.accounts, local.accounts, remote.accounts, { deltaFields: DELTA_FIELDS.accounts }),
    debts: mergeById(b?.debts, local.debts, remote.debts, { deltaFields: DELTA_FIELDS.debts }),
    transactions: mergeById(b?.transactions, local.transactions, remote.transactions, { newestFirst: true }),
    settlementHistory: inter.settlementHistory,
    settlementBalance: inter.settlementBalance,
    // Audit log: only ever grows.
    deletedHistory: mergeById(undefined, local.deletedHistory, remote.deletedHistory),
    greenDotTrackingStartDate: scalar(b?.greenDotTrackingStartDate, local.greenDotTrackingStartDate, remote.greenDotTrackingStartDate),
    flexDeposits: mergeById(b?.flexDeposits, local.flexDeposits, remote.flexDeposits),
    remittances: mergeById(b?.remittances, local.remittances, remote.remittances, { newestFirst: true }),
    homeLayout: newestSetting(b?.homeLayout, local.homeLayout, remote.homeLayout),
  };
}

/** True when the two states hold the same records — nothing to push or pull. */
export function financeStatesEqual(a: FinanceState, b: FinanceState): boolean {
  return same(a, b);
}
