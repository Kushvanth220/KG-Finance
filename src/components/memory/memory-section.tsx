"use client";

import { useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";

/**
 * One category in the app's memory: a titled card with a count, an optional
 * add affordance, and rows underneath.
 *
 * The count is part of the information, not decoration — "Bills 0" is the
 * signal that nothing is being tracked yet, which is exactly what someone
 * opening this page needs to see.
 */
export function MemorySection({
  title,
  hint,
  count,
  tint,
  icon,
  addLabel,
  onAdd,
  children,
}: {
  title: string;
  hint: string;
  count: number;
  tint: string;
  icon: ReactNode;
  addLabel?: string;
  onAdd?: () => void;
  children: ReactNode;
}) {
  return (
    <GlassCard className="!p-0 overflow-hidden">
      <div
        className="flex items-start justify-between gap-3 px-4 py-3 border-b border-black/5 dark:border-white/10"
        style={{ borderLeft: `3px solid ${tint}` }}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span style={{ color: tint }}>{icon}</span>
            <h2 className="text-sm font-semibold">{title}</h2>
            <span
              className="rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
              style={{ background: `${tint}1f`, color: tint }}
            >
              {count}
            </span>
          </div>
          <p className="text-[11px] text-muted mt-0.5">{hint}</p>
        </div>
        {onAdd ? (
          <button
            type="button"
            onClick={onAdd}
            className="shrink-0 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-white"
            style={{ background: tint }}
          >
            <Plus className="w-3 h-3" />
            {addLabel ?? "Add"}
          </button>
        ) : null}
      </div>
      <div className="divide-y divide-black/5 dark:divide-white/[0.07]">{children}</div>
    </GlassCard>
  );
}

/** Shown instead of rows when a category has nothing in it yet. */
export function MemoryEmpty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-5 text-[12px] text-muted text-center">{children}</p>;
}

/**
 * A row that flips between reading and editing in place. Used for every plain
 * text memory (reminders, behaviour rules) so editing never leaves the page.
 */
export function EditableRow({
  value,
  placeholder,
  onSave,
  onDelete,
  meta,
  muted,
}: {
  value: string;
  placeholder: string;
  onSave: (next: string) => void;
  onDelete: () => void;
  meta?: ReactNode;
  /** Completed items stay readable but visibly settled. */
  muted?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const commit = () => {
    const next = draft.trim();
    if (!next) return;
    onSave(next);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="px-4 py-2.5 space-y-2">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={placeholder}
          rows={2}
          autoFocus
          className="w-full glass rounded-lg px-2.5 py-2 text-[13px] outline-none resize-none focus:ring-2 focus:ring-[#007aff]/40"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={commit}
            disabled={!draft.trim()}
            className="rounded-lg bg-[#007aff] px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(value);
              setEditing(false);
            }}
            className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-muted hover:bg-black/5 dark:hover:bg-white/10"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-2 px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <p className={cn("text-[13px] leading-snug", muted && "text-muted line-through decoration-1")}>
          {value}
        </p>
        {meta ? <div className="mt-0.5 text-[10px] text-muted">{meta}</div> : null}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-md p-1.5 text-[11px] text-[#007aff] hover:bg-black/5 dark:hover:bg-white/10"
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="rounded-md p-1.5 text-[11px] text-[#ff3b30] hover:bg-black/5 dark:hover:bg-white/10"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

/** The "write a new one" row that appears under a section while adding. */
export function NewEntryRow({
  placeholder,
  onCommit,
  onCancel,
}: {
  placeholder: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState("");

  return (
    <div className={cn("px-4 py-2.5 space-y-2 bg-black/[0.02] dark:bg-white/[0.03]")}>
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={placeholder}
        rows={2}
        autoFocus
        className="w-full glass rounded-lg px-2.5 py-2 text-[13px] outline-none resize-none focus:ring-2 focus:ring-[#007aff]/40"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            const next = draft.trim();
            if (next) onCommit(next);
          }}
          disabled={!draft.trim()}
          className="rounded-lg bg-[#007aff] px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-muted hover:bg-black/5 dark:hover:bg-white/10"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
