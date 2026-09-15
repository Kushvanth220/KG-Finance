"use client";

import { useState, type CSSProperties } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassModal } from "@/components/ui/glass-modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useFinanceStore } from "@/store/finance-store";
import { CATEGORY_COLORS, categoryLook, suggestCategoryLook } from "@/lib/category-look";
import type { SpendCategory } from "@/types";
import { cn } from "@/lib/utils";

interface SpendCategoryManagerProps {
  open: boolean;
  onClose: () => void;
  onCategoryDeleted?: (id: string) => void;
}

/** Keep one visible character: an emoji is often several code points. */
function firstGlyph(text: string): string {
  const trimmed = text.trim();
  if (typeof Intl === "undefined" || !("Segmenter" in Intl)) return Array.from(trimmed)[0] ?? "";
  const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
  for (const part of segmenter.segment(trimmed)) return part.segment;
  return "";
}

export function SpendCategoryManager({
  open,
  onClose,
  onCategoryDeleted,
}: SpendCategoryManagerProps) {
  const { spendCategories, addSpendCategory, updateSpendCategory, deleteSpendCategory } =
    useFinanceStore();

  const [editCategoryId, setEditCategoryId] = useState<string | null>(null);
  const [catName, setCatName] = useState("");
  const [catKeywords, setCatKeywords] = useState("");
  const [catBudget, setCatBudget] = useState("");
  // Empty means "guess from the name" — the guess is shown live as a placeholder.
  const [catEmoji, setCatEmoji] = useState("");
  const [catColor, setCatColor] = useState("");
  const [pendingDelete, setPendingDelete] = useState<SpendCategory | null>(null);

  const guess = suggestCategoryLook(catName);
  const shownEmoji = catEmoji || guess.emoji;
  const shownColor = catColor || guess.color;

  const resetForm = () => {
    setEditCategoryId(null);
    setCatName("");
    setCatKeywords("");
    setCatBudget("");
    setCatEmoji("");
    setCatColor("");
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSave = () => {
    const name = catName.trim();
    if (!name) return;

    const keywords = catKeywords
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean);

    const parsedBudget = Number(catBudget);
    const budget = catBudget.trim() && Number.isFinite(parsedBudget) && parsedBudget > 0 ? parsedBudget : undefined;
    const look = { emoji: catEmoji.trim() || undefined, color: catColor || undefined };

    if (editCategoryId) {
      updateSpendCategory(editCategoryId, { name, keywords, budget, ...look });
    } else {
      addSpendCategory(name, keywords);
      // addSpendCategory takes only name and keywords; dress the row it just made.
      const created = useFinanceStore
        .getState()
        .spendCategories.find((c) => c.name.trim().toLowerCase() === name.toLowerCase());
      if (created && (budget !== undefined || look.emoji || look.color)) {
        updateSpendCategory(created.id, { budget, ...look });
      }
    }

    resetForm();
  };

  const handleEdit = (category: SpendCategory) => {
    setEditCategoryId(category.id);
    setCatName(category.name);
    setCatKeywords((category.keywords ?? []).join(", "));
    setCatBudget(category.budget ? String(category.budget) : "");
    setCatEmoji(category.emoji ?? "");
    setCatColor(category.color ?? "");
  };

  const handleDelete = (id: string) => {
    deleteSpendCategory(id);
    onCategoryDeleted?.(id);
    if (editCategoryId === id) {
      resetForm();
    }
    setPendingDelete(null);
  };

  if (pendingDelete) {
    return (
      <ConfirmDialog
        open
        title="Delete category?"
        message={`"${pendingDelete.name}" will be removed from the category list. Past spending keeps its category name in History.`}
        confirmLabel="Delete category"
        onConfirm={() => handleDelete(pendingDelete.id)}
        onCancel={() => setPendingDelete(null)}
      />
    );
  }

  const field =
    "w-full glass rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#007aff]/40";

  return (
    <GlassModal open={open} onClose={handleClose} title="Edit categories">
      <div className="space-y-4">
        <div className="space-y-2 max-h-52 overflow-y-auto">
          {spendCategories.map((category) => {
            const look = categoryLook(category);
            return (
              <div
                key={category.id}
                className="flex items-center justify-between gap-2 rounded-xl glass px-3 py-2"
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base"
                  style={{ background: `${look.color}22` }}
                  aria-hidden
                >
                  {look.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{category.name}</p>
                  {(category.keywords?.length ?? 0) > 0 && (
                    <p className="text-[10px] text-muted truncate">
                      {(category.keywords ?? []).join(", ")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleEdit(category)}
                    className="tap-icon focus-ring p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
                    aria-label={`Edit ${category.name}`}
                  >
                    <Pencil className="w-3.5 h-3.5 text-[#007aff]" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(category)}
                    className="tap-icon focus-ring p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10"
                    aria-label={`Delete ${category.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-[#ff3b30]" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="space-y-2 pt-2 border-t border-black/5 dark:border-white/10">
          <p className="text-sm font-medium">
            {editCategoryId ? "Edit category" : "Add category"}
          </p>
          <div className="flex gap-2">
            <input
              value={catEmoji}
              onChange={(e) => setCatEmoji(firstGlyph(e.target.value))}
              placeholder={shownEmoji}
              aria-label="Emoji"
              className="w-14 shrink-0 glass rounded-xl px-2 py-2 text-center text-lg outline-none placeholder:opacity-60 focus:ring-2 focus:ring-[#007aff]/40"
              style={{ background: `${shownColor}22` }}
            />
            <input
              value={catName}
              onChange={(e) => setCatName(e.target.value)}
              placeholder="Category name"
              className={cn(field, "min-w-0 flex-1")}
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5 px-0.5">
            {CATEGORY_COLORS.map((color) => {
              const active = shownColor === color;
              return (
                <button
                  key={color}
                  type="button"
                  onClick={() => setCatColor(color)}
                  aria-label={`Colour ${color}`}
                  aria-pressed={active}
                  className={cn(
                    "hit h-6 w-6 rounded-full transition-transform",
                    active && "scale-110 ring-2 ring-offset-2 ring-offset-white ring-[color:var(--c)] dark:ring-offset-[#1c1c1e]"
                  )}
                  style={{ background: color, "--c": color } as CSSProperties}
                />
              );
            })}
          </div>
          <input
            value={catKeywords}
            onChange={(e) => setCatKeywords(e.target.value)}
            placeholder="Keywords (comma-separated, optional)"
            className={field}
          />
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="1"
            value={catBudget}
            onChange={(e) => setCatBudget(e.target.value)}
            placeholder="Monthly budget, e.g. 400 (optional)"
            className={field}
          />
          <div className="flex gap-2">
            {editCategoryId && (
              <GlassButton variant="ghost" className="flex-1" onClick={resetForm}>
                Cancel edit
              </GlassButton>
            )}
            <GlassButton className="flex-1" onClick={handleSave} disabled={!catName.trim()}>
              {editCategoryId ? (
                "Save changes"
              ) : (
                <>
                  <Plus className="w-4 h-4" /> Add
                </>
              )}
            </GlassButton>
          </div>
        </div>
      </div>
    </GlassModal>
  );
}
