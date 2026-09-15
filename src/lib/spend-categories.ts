import type { SpendCategory } from "@/types";

export function matchSpendCategoryFromNote(
  note: string,
  categories: SpendCategory[]
): SpendCategory | null {
  const normalized = note.trim().toLowerCase();
  if (!normalized) return null;

  let best: { category: SpendCategory; score: number } | null = null;

  for (const category of categories) {
    const terms = [
      category.name.toLowerCase(),
      ...(category.keywords ?? []).map((k) => k.toLowerCase()),
    ];

    for (const term of terms) {
      if (!term) continue;
      if (normalized.includes(term) || term.includes(normalized)) {
        const score = term.length;
        if (!best || score > best.score) {
          best = { category, score };
        }
      }
    }
  }

  return best?.category ?? null;
}

export function resolveSpendCategoryLabel(
  categories: SpendCategory[],
  categoryId: string | null,
  note: string
): string {
  if (categoryId) {
    const found = categories.find((c) => c.id === categoryId);
    if (found) return found.name;
  }
  const matched = matchSpendCategoryFromNote(note, categories);
  if (matched) return matched.name;
  return "Other";
}
