import type { SpendCategory } from "@/types";

/**
 * Every category tile gets a face — an emoji and a colour — even before
 * anyone sets one. A grid of grey rectangles all reading "Groceries",
 * "Gas", "Food" is scanned by reading; a grid of 🛒 ⛽ 🍔 is scanned by
 * looking, which is faster with one thumb at a checkout.
 */

/** The palette offered in Manage categories — the app's own accent set. */
export const CATEGORY_COLORS = [
  "#ff3b30",
  "#ff9500",
  "#ffcc00",
  "#34c759",
  "#00c7be",
  "#007aff",
  "#5856d6",
  "#af52de",
  "#ff2d55",
  "#a2845e",
  "#8e8e93",
] as const;

const GUESSES: ReadonlyArray<readonly [RegExp, string, string]> = [
  [/grocer|costco|walmart|aldi|kroger|heb|trader|market|produce/i, "🛒", "#34c759"],
  [/coffee|cafe|starbucks|\btea\b|boba/i, "☕", "#a2845e"],
  [/food|restaurant|dining|lunch|dinner|breakfast|takeout|doordash|eats|pizza|burger|snack/i, "🍔", "#ff9500"],
  [/\bgas\b|fuel|petrol/i, "⛽", "#ff3b30"],
  [/\bcar\b|auto|uber|lyft|transit|\bbus\b|train|parking|toll|vehicle/i, "🚗", "#5856d6"],
  [/rent|mortgage|\bhome\b|house|apartment/i, "🏠", "#007aff"],
  [/subscri|netflix|spotify|prime|youtube|stream|icloud/i, "📺", "#af52de"],
  [/phone|mobile|verizon|at&t|internet|wifi|data/i, "📱", "#00c7be"],
  [/electric|power|water|utilit|\bbill/i, "💡", "#ffcc00"],
  [/loan|education|tuition|school|college|student|course/i, "🎓", "#007aff"],
  [/cash|atm|withdraw/i, "💵", "#34c759"],
  [/shop|amazon|cloth|target|mall|order/i, "🛍️", "#ff2d55"],
  [/health|doctor|pharma|medic|dentist|gym|fitness|clinic/i, "💊", "#ff3b30"],
  [/travel|flight|hotel|trip|vacation|airbnb/i, "✈️", "#00c7be"],
  [/gift|birthday|present|wedding/i, "🎁", "#ff2d55"],
  [/fun|movie|game|entertain|concert|party/i, "🎬", "#af52de"],
  [/insur/i, "🛡️", "#5856d6"],
  [/\bpet|\bdog|\bcat\b/i, "🐾", "#a2845e"],
  [/beauty|salon|hair|nail|spa/i, "💅", "#ff2d55"],
  [/kid|baby|child|toy/i, "🧸", "#ffcc00"],
  [/family|parent|mom|dad|india|send/i, "🏡", "#ff9500"],
  [/laundry|clean|supply|supplies/i, "🧺", "#00c7be"],
];

/** A reasonable emoji and colour for a category by its name alone. */
export function suggestCategoryLook(name: string): { emoji: string; color: string } {
  for (const [pattern, emoji, color] of GUESSES) {
    if (pattern.test(name)) return { emoji, color };
  }
  return { emoji: "🏷️", color: "#8e8e93" };
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
