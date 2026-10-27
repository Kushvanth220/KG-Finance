"use client";

import { useMemo, useState } from "react";
import { GlassModal } from "@/components/ui/glass-modal";
import { GlassButton } from "@/components/ui/glass-button";
import { findDoubledReminders } from "@/lib/ai/reminder-sync";
import { describeSchedule, type Reminder } from "@/lib/ai/reminders";
import { useAssistantPreferencesStore } from "@/store/assistant-preferences-store";
import { cn } from "@/lib/utils";

/**
 * Reminders saved twice (the old sync could do that), and a way to keep one of
 * each. Nothing is removed until you press the button that says how many; a
 * removal reaches every device, like any other delete.
 */
export function DoubledReminders() {
  const reminders = useAssistantPreferencesStore((state) => state.structuredReminders);
  const deleteReminder = useAssistantPreferencesStore((state) => state.deleteStructuredReminder);
  const groups = useMemo(() => findDoubledReminders(reminders), [reminders]);
  const [open, setOpen] = useState(false);
  // Group's first id → the id kept. The suggested copy is kept unless changed.
  const [keep, setKeep] = useState<Record<string, string>>({});

  if (groups.length === 0) return null;

  const extra = groups.reduce((sum, group) => sum + group.length - 1, 0);
  const keptOf = (group: Reminder[]) => keep[group[0]!.id] ?? group[0]!.id;
  const example = groups[0]!;

  const removeCopies = () => {
    for (const group of groups) {
      const kept = keptOf(group);
      for (const reminder of group) if (reminder.id !== kept) deleteReminder(reminder.id);
    }
    setOpen(false);
  };

  return (
    <>
      <div className="flex items-center gap-3 rounded-2xl border border-caution/35 bg-caution/10 px-3.5 py-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-caution">
            {extra} {extra === 1 ? "reminder looks" : "reminders look"} doubled
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted">
            &ldquo;{example[example.length - 1]!.text}&rdquo; and &ldquo;{example[0]!.text}&rdquo;, same schedule
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="shrink-0 rounded-xl bg-caution px-3 py-2 text-[12px] font-bold text-black/85"
        >
          Review
        </button>
      </div>

      <GlassModal open={open} onClose={() => setOpen(false)} title="Doubled reminders">
        <div className="space-y-3">
          <p className="text-xs text-muted">
            Each group is one reminder saved more than once. The ticked copy stays; tap another to keep it instead.
          </p>
          <div className="space-y-2">
            {groups.map((group) => (
              <div key={group[0]!.id} className="rounded-xl bg-black/[0.03] p-1.5 dark:bg-white/[0.04]">
                {group.map((reminder) => {
                  const kept = keptOf(group) === reminder.id;
                  return (
                    <button
                      key={reminder.id}
                      type="button"
                      aria-pressed={kept}
                      onClick={() => setKeep((map) => ({ ...map, [group[0]!.id]: reminder.id }))}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left",
                        kept ? "bg-positive/15" : "opacity-70"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold",
                          kept ? "border-positive bg-positive text-white" : "border-black/25 dark:border-white/30"
                        )}
                        aria-hidden
                      >
                        {kept ? "✓" : ""}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-medium">{reminder.text}</span>
                        <span className="block truncate text-[10px] text-muted">{describeSchedule(reminder)}</span>
                      </span>
                      <span className={cn("text-[10px] font-semibold", kept ? "text-positive" : "text-negative")}>
                        {kept ? "Keep" : "Remove"}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <GlassButton variant="danger" className="w-full" onClick={removeCopies}>
            Remove {extra} {extra === 1 ? "copy" : "copies"} on every device
          </GlassButton>
        </div>
      </GlassModal>
    </>
  );
}
