"use client";

import { useMemo, useSyncExternalStore } from "react";
import { SpellCheck } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { suggestCategoryName } from "@/lib/category-typos";
import { useFinanceStore } from "@/store/finance-store";

/**
 * A one-time nudge for category names that look misspelled ("Settelment",
 * "Eduction Loan"). Rename changes the name everywhere, past spends included,
 * on both phones; Keep hides the suggestion on this phone for good.
 */

const KEPT_KEY = "kg-typo-kept";
const listeners = new Set<() => void>();
let keptRaw: string | null = null;

function readKept(): string {
  try {
    keptRaw = window.localStorage.getItem(KEPT_KEY) ?? keptRaw ?? "[]";
  } catch {
    keptRaw ??= "[]";
  }
  return keptRaw;
}

function keep(name: string) {
  const next = JSON.stringify([...new Set([...JSON.parse(readKept()) as string[], name])]);
  keptRaw = next;
  try {
    window.localStorage.setItem(KEPT_KEY, next);
  } catch {
    // Kept for this visit only.
  }
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function CategoryTypoHint() {
  const categories = useFinanceStore((state) => state.spendCategories);
  const updateSpendCategory = useFinanceStore((state) => state.updateSpendCategory);
  // "[]" on the server and the first render, so the two agree; this phone's list after.
  const kept = useSyncExternalStore(subscribe, readKept, () => "[]");

  const typos = useMemo(() => {
    const keptNames = new Set(JSON.parse(kept) as string[]);
    const names = new Set(categories.map((category) => category.name.toLowerCase()));
    return categories.flatMap((category) => {
      const to = suggestCategoryName(category.name);
      // A fix that would collide with another category would need a merge, not a rename.
      if (!to || keptNames.has(category.name) || names.has(to.toLowerCase())) return [];
      return [{ category, to }];
    });
  }, [categories, kept]);

  if (typos.length === 0) return null;

  return (
    <GlassCard className="!p-3 space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-semibold">
        <SpellCheck className="h-3.5 w-3.5 text-accent" aria-hidden />
        {typos.length === 1 ? "A category name looks misspelled" : `${typos.length} category names look misspelled`}
      </p>
      <ul className="space-y-1.5">
        {typos.map(({ category, to }) => (
          <li key={category.id} className="flex items-center justify-between gap-2 rounded-xl bg-black/[0.03] px-2.5 py-1.5 dark:bg-white/[0.04]">
            <span className="min-w-0 text-[12px]">
              <span className="text-muted line-through">{category.name}</span>
              <span className="text-muted"> → </span>
              <span className="font-semibold">{to}</span>
            </span>
            <span className="flex shrink-0 gap-1">
              <button
                type="button"
                onClick={() => updateSpendCategory(category.id, { name: to })}
                className="rounded-lg bg-accent px-2.5 py-1 text-[11px] font-semibold text-white"
              >
                Rename
              </button>
              <button
                type="button"
                onClick={() => keep(category.name)}
                className="rounded-lg px-2 py-1 text-[11px] font-semibold text-muted hover:text-foreground"
              >
                Keep
              </button>
            </span>
          </li>
        ))}
      </ul>
      <p className="text-[10px] text-muted">Renaming changes past spends too, on both phones.</p>
    </GlassCard>
  );
}
