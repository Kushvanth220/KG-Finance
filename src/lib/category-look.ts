import type { SpendCategory } from "@/types";

/**
 * Every category tile gets a face — an emoji and a colour — even before
 * anyone sets one. A grid of grey rectangles all reading "Groceries",
 * "Gas", "Food" is scanned by reading; a grid of 🛒 ⛽ 🍔 is scanned by
 * looking, which is faster with one thumb at a checkout.
 */

/** The palette offered in Manage categories — the app's own accent set. */
export const CATEGORY_COLORS = [
  "var(--danger)",
  "var(--warning)",
  "var(--chart-gold)",
  "var(--success)",
  "#2bb5c4",
  "var(--accent)",
  "var(--accent-secondary)",
  "var(--feature)",
  "var(--pink)",
  "#6f7fa8",
  "var(--neutral)",
] as const;

const GUESSES: ReadonlyArray<readonly [RegExp, string, string]> = [
  [/grocer|costco|walmart|aldi|kroger|heb|trader|market|produce/i, "🛒", "var(--success)"],
  [/coffee|cafe|starbucks|\btea\b|boba/i, "☕", "#6f7fa8"],
  [/food|restaurant|dining|lunch|dinner|breakfast|takeout|doordash|eats|pizza|burger|snack/i, "🍔", "var(--warning)"],
  [/\bgas\b|fuel|petrol/i, "⛽", "var(--danger)"],
  [/\bcar\b|auto|uber|lyft|transit|\bbus\b|train|parking|toll|vehicle/i, "🚗", "var(--accent-secondary)"],
  [/rent|mortgage|\bhome\b|house|apartment/i, "🏠", "var(--accent)"],
  [/subscri|netflix|spotify|prime|youtube|stream|icloud/i, "📺", "var(--feature)"],
  [/phone|mobile|verizon|at&t|internet|wifi|data/i, "📱", "#2bb5c4"],
  [/electric|power|water|utilit|\bbill/i, "💡", "var(--chart-gold)"],
  [/loan|education|tuition|school|college|student|course/i, "🎓", "var(--accent)"],
  [/cash|atm|withdraw/i, "💵", "var(--success)"],
  [/shop|amazon|cloth|target|mall|order/i, "🛍️", "var(--pink)"],
  [/health|doctor|pharma|medic|dentist|gym|fitness|clinic/i, "💊", "var(--danger)"],
  [/travel|flight|hotel|trip|vacation|airbnb/i, "✈️", "#2bb5c4"],
  [/gift|birthday|present|wedding/i, "🎁", "var(--pink)"],
  [/fun|movie|game|entertain|concert|party/i, "🎬", "var(--feature)"],
  [/insur/i, "🛡️", "var(--accent-secondary)"],
  [/\bpet|\bdog|\bcat\b/i, "🐾", "#6f7fa8"],
  [/beauty|salon|hair|nail|spa/i, "💅", "var(--pink)"],
  [/kid|baby|child|toy/i, "🧸", "var(--chart-gold)"],
  [/family|parent|mom|dad|india|send/i, "🏡", "var(--warning)"],
  [/laundry|clean|supply|supplies/i, "🧺", "#2bb5c4"],
];

/** A reasonable emoji and colour for a category by its name alone. */
export function suggestCategoryLook(name: string): { emoji: string; color: string } {
  for (const [pattern, emoji, color] of GUESSES) {
    if (pattern.test(name)) return { emoji, color };
  }
  return { emoji: "🏷️", color: "var(--neutral)" };
}

/** What the category actually shows: its own look, falling back to the guess. */
export function categoryLook(category: Pick<SpendCategory, "name" | "emoji" | "color">): {
  emoji: string;
  color: string;
} {
  const guess = suggestCategoryLook(category.name);
  return {
    emoji: category.emoji?.trim() || guess.emoji,
    color: category.color?.trim() || guess.color,
  };
}
