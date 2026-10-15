/**
 * Which cards Home's deck shows, and in what order.
 *
 * A viewing choice, kept per device like the chart shapes: each phone can lay
 * Home out its own way. The order always names every card, including ones a
 * person doesn't have (Flex on G's tab, Debts with none), so rearranging on one
 * tab never loses where the others sit.
 */

export type HomeCardId = "flex" | "income" | "spending" | "accounts" | "debts";

export const HOME_CARDS: { id: HomeCardId; label: string }[] = [
  { id: "flex", label: "Flex" },
  { id: "income", label: "Income" },
  { id: "spending", label: "Spending" },
  { id: "accounts", label: "Accounts" },
  { id: "debts", label: "Debts" },
];

export interface HomeCardPrefs {
  order: HomeCardId[];
  hidden: HomeCardId[];
}

const ALL = HOME_CARDS.map((card) => card.id);
export const DEFAULT_CARD_PREFS: HomeCardPrefs = { order: ALL, hidden: [] };

const isCard = (value: unknown): value is HomeCardId => ALL.includes(value as HomeCardId);

/** Saved prefs, made whole: unknown ids dropped, cards added since appended in their usual place. */
export function parseCardPrefs(raw: string | null): HomeCardPrefs {
  if (!raw) return DEFAULT_CARD_PREFS;
  try {
    const data = JSON.parse(raw) as { order?: unknown; hidden?: unknown };
    const order = Array.isArray(data.order) ? [...new Set(data.order.filter(isCard))] : [];
    const hidden = Array.isArray(data.hidden) ? [...new Set(data.hidden.filter(isCard))] : [];
    return { order: [...order, ...ALL.filter((id) => !order.includes(id))], hidden };
  } catch {
    return DEFAULT_CARD_PREFS;
  }
}

/** The cards to show, in order: those this person has, minus the hidden ones. */
export function arrangeCards(available: HomeCardId[], prefs: HomeCardPrefs): HomeCardId[] {
  return prefs.order.filter((id) => available.includes(id) && !prefs.hidden.includes(id));
}

/**
 * A new order for some of the cards, written back into the full order: the
 * cards that moved take the places those cards held, the rest stay put.
 */
export function reorderWithin(order: HomeCardId[], moved: HomeCardId[]): HomeCardId[] {
  const queue = [...moved];
  return order.map((id) => (moved.includes(id) ? queue.shift()! : id));
}
