import { parseAppDateTime } from "@/lib/formatters";
import type { Transaction } from "@/types";

/**
 * Small readings of the ledger that make the Spend form quicker: which
 * categories are in use this week, what the last note like this one said,
 * whether this exact spend was just logged. Pure functions over the
 * transaction list — nothing here writes.
 */

const DAY_MS = 86_400_000;

/** Category names used most in the last `days`, most used first. */
export function recentCategoryNames(
  transactions: Transaction[],
  days = 7,
  limit = 3,
  now: Date = new Date()
): string[] {
  const since = now.getTime() - days * DAY_MS;
  const counts = new Map<string, { name: string; count: number; last: number }>();
  for (const tx of transactions) {
    if (tx.type !== "expense" || !tx.category) continue;
    const at = parseAppDateTime(tx.date, tx.time, tx.timestamp).getTime();
    if (at < since) continue;
    const key = tx.category.trim().toLowerCase();
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
      existing.last = Math.max(existing.last, at);
    } else {
      counts.set(key, { name: tx.category.trim(), count: 1, last: at });
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count || b.last - a.last)
    .slice(0, limit)
    .map((item) => item.name);
}

export interface NoteSuggestion {
  note: string;
  category?: string;
}

/**
 * Past notes that begin the way this one does — most recent first, no
 * repeats, never the text already typed. A word-start match ("cos" →
 * "Groceries at Costco") is offered after the prefix matches.
 */
export function noteSuggestions(
  transactions: Transaction[],
  query: string,
  limit = 4
): NoteSuggestion[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  const prefix: NoteSuggestion[] = [];
  const word: NoteSuggestion[] = [];
  const seen = new Set<string>();

  for (const tx of transactions) {
    if (tx.type !== "expense") continue;
    const note = tx.notes?.trim();
    if (!note) continue;
    const lower = note.toLowerCase();
    if (lower === q || seen.has(lower)) continue;

    if (lower.startsWith(q)) {
      seen.add(lower);
      prefix.push({ note, category: tx.category });
    } else if (lower.split(/\s+/).some((part) => part.startsWith(q))) {
      seen.add(lower);
      word.push({ note, category: tx.category });
    }
    if (prefix.length >= limit) break;
  }

  return [...prefix, ...word].slice(0, limit);
}

/** A spend of the same amount and category recorded in the last `withinMs`. */
export function findRecentDuplicate(
  transactions: Transaction[],
  amount: number,
  category: string,
  withinMs = 120_000,
  now = Date.now()
): Transaction | null {
  const wanted = category.trim().toLowerCase();
  for (const tx of transactions) {
    if (tx.type !== "expense") continue;
    if (Math.abs(Math.abs(tx.amount) - Math.abs(amount)) >= 0.005) continue;
    if ((tx.category ?? "").trim().toLowerCase() !== wanted) continue;
    const at = parseAppDateTime(tx.date, tx.time, tx.timestamp).getTime();
    if (now - at <= withinMs && now - at >= 0) return tx;
  }
  return null;
}
