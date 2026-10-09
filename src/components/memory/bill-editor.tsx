"use client";

import { useState } from "react";
import { GlassModal } from "@/components/ui/glass-modal";
import { GlassButton } from "@/components/ui/glass-button";
import { PERSON_LABELS, type MonthlyExpense, type Person } from "@/types";
import { cn } from "@/lib/utils";

/**
 * Create or edit one bill.
 *
 * A bill is the only memory here with real structure: who owes it, how much,
 * when it is due, and whether the amount is the same every month. "Varies"
 * matters — an electric bill has a due date but no fixed amount, and forcing a
 * number would make the app lie about what is known.
 */

export type BillDraft = Omit<MonthlyExpense, "id">;

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

export function BillEditor({
  open,
  initial,
  onSave,
  onClose,
}: {
  open: boolean;
  /** Undefined when adding. */
  initial?: MonthlyExpense;
  onSave: (draft: BillDraft) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [person, setPerson] = useState<Person>(initial?.person ?? "kushvanth");
  const [isVariable, setIsVariable] = useState(initial?.isVariable ?? false);
  const [amount, setAmount] = useState(
    initial?.amount != null ? String(initial.amount) : ""
  );
  const [dueDay, setDueDay] = useState<number | "">(initial?.dueDayOfMonth ?? "");
  const [isRecurring, setIsRecurring] = useState(initial?.isRecurring ?? true);

  const parsedAmount = Number(amount);
  const amountValid = isVariable || (Number.isFinite(parsedAmount) && parsedAmount > 0);
  const canSave = name.trim().length > 0 && amountValid;

  const submit = () => {
    if (!canSave) return;
    onSave({
      person,
      name: name.trim(),
      amount: isVariable ? null : parsedAmount,
      isVariable,
      isRecurring,
      ...(dueDay === "" ? {} : { dueDayOfMonth: Number(dueDay) }),
    });
  };

  return (
    <GlassModal open={open} onClose={onClose} title={initial ? "Edit bill" : "Add a bill"}>
      <div className="space-y-3">
        <div>
          <label className="text-[11px] font-medium text-muted">What is it?</label>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="T-Mobile, Room Rent, Car insurance…"
            autoFocus
            className="mt-1 w-full glass-field rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>

        <div>
          <label className="text-[11px] font-medium text-muted">Whose bill?</label>
          <div className="mt-1 flex gap-2">
            {(["kushvanth", "g"] as Person[]).map((who) => (
              <button
                key={who}
                type="button"
                onClick={() => setPerson(who)}
                className={cn(
                  "flex-1 rounded-xl px-3 py-2 text-xs font-semibold transition-colors",
                  person === who
                    ? "glass-pill"
                    : "glass text-muted hover:text-foreground"
                )}
              >
                {PERSON_LABELS[who]}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[11px] font-medium text-muted">How much?</label>
          <div className="mt-1 flex gap-2">
            <input
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              disabled={isVariable}
              inputMode="decimal"
              placeholder={isVariable ? "Changes each month" : "0.00"}
              className="flex-1 glass rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-45"
            />
            <button
              type="button"
              onClick={() => setIsVariable((v) => !v)}
              className={cn(
                "rounded-xl px-3 py-2 text-xs font-semibold transition-colors",
                isVariable ? "bg-caution text-white" : "glass text-muted"
              )}
            >
              Varies
            </button>
          </div>
        </div>

        <div>
          <label className="text-[11px] font-medium text-muted">Due day of the month</label>
          <select
            value={dueDay}
            onChange={(event) =>
              setDueDay(event.target.value === "" ? "" : Number(event.target.value))
            }
            className="mt-1 w-full glass-field rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
          >
            <option value="">No fixed day</option>
            {DAYS.map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={() => setIsRecurring((r) => !r)}
          className="flex w-full items-center justify-between rounded-xl glass px-3 py-2.5 text-left"
        >
          <span>
            <span className="block text-xs font-semibold">Every month</span>
            <span className="block text-[10px] text-muted">
              Turn off for a one-time bill
            </span>
          </span>
          <span
            className={cn(
              "h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors",
              isRecurring ? "bg-positive" : "bg-black/15 dark:bg-white/20"
            )}
          >
            <span
              className={cn(
                "block h-4 w-4 rounded-full bg-white transition-transform",
                isRecurring && "translate-x-4"
              )}
            />
          </span>
        </button>

        <div className="flex gap-2 pt-1">
          <GlassButton variant="ghost" className="flex-1" onClick={onClose}>
            Cancel
          </GlassButton>
          <GlassButton className="flex-1" onClick={submit} disabled={!canSave}>
            {initial ? "Save changes" : "Add bill"}
          </GlassButton>
        </div>
      </div>
    </GlassModal>
  );
}
