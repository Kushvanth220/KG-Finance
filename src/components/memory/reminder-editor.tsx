"use client";

import { useState } from "react";
import { useAssistantName } from "@/store/assistant-preferences-store";
import { GlassModal } from "@/components/ui/glass-modal";
import { GlassButton } from "@/components/ui/glass-button";
import {
  DEFAULT_LEAD_DAYS,
  MONTHS,
  WEEKDAYS,
  describeSchedule,
  dueLabel,
  type Reminder,
  type ReminderRepeat,
} from "@/lib/ai/reminders";
import { cn } from "@/lib/utils";
import { PERSON_LABELS } from "@/types";

/**
 * Create or edit one reminder, with its schedule as real fields.
 *
 * Only the fields that apply to the chosen cycle are shown — a weekly reminder
 * has no day-of-month, and offering one would invite nonsense data.
 */

const REPEATS: { value: ReminderRepeat; label: string }[] = [
  { value: "once", label: "Once" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
];

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

export function ReminderEditor({
  open,
  initial,
  onSave,
  onClose,
}: {
  open: boolean;
  initial?: Reminder;
  onSave: (draft: Omit<Reminder, "id">) => void;
  onClose: () => void;
}) {
  const assistantName = useAssistantName();
  const [text, setText] = useState(initial?.text ?? "");
  const [repeat, setRepeat] = useState<ReminderRepeat>(initial?.repeat ?? "monthly");
  const [date, setDate] = useState(initial?.date ?? "");
  const [dayOfMonth, setDayOfMonth] = useState<number | "">(initial?.dayOfMonth ?? "");
  const [month, setMonth] = useState<number | "">(initial?.month ?? "");
  const [weekday, setWeekday] = useState<number | "">(initial?.weekday ?? "");
  const [time, setTime] = useState(initial?.time ?? "");
  const [leadDays, setLeadDays] = useState(initial?.leadDays ?? DEFAULT_LEAD_DAYS);
  const [person, setPerson] = useState<"kushvanth" | "g" | "">(initial?.person ?? "");

  const draft: Omit<Reminder, "id"> = {
    text: text.trim(),
    done: initial?.done ?? false,
    repeat,
    leadDays,
    ...(repeat === "once" && date ? { date } : {}),
    ...((repeat === "monthly" || repeat === "yearly") && dayOfMonth !== ""
      ? { dayOfMonth: Number(dayOfMonth) }
      : {}),
    ...(repeat === "yearly" && month !== "" ? { month: Number(month) } : {}),
    ...(repeat === "weekly" && weekday !== "" ? { weekday: Number(weekday) } : {}),
    ...(time ? { time } : {}),
    ...(person ? { person } : {}),
  };

  const canSave = text.trim().length > 0;
  const preview = { ...draft, id: initial?.id ?? "preview" } as Reminder;

  const field = "mt-1 w-full glass-field rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40";
  const label = "text-[11px] font-medium text-muted";

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title={initial ? "Edit reminder" : "Add a reminder"}
    >
      <div className="space-y-3">
        <div>
          <label className={label}>What should {assistantName} remind you about?</label>
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Rent, car EMI, send money to family…"
            autoFocus
            className={field}
          />
        </div>

        <div>
          <label className={label}>Whose?</label>
          <div className="mt-1 grid grid-cols-3 gap-1.5">
            {(
              [
                { value: "" as const, label: "Both" },
                { value: "kushvanth" as const, label: PERSON_LABELS.kushvanth },
                { value: "g" as const, label: PERSON_LABELS.g },
              ]
            ).map((option) => (
              <button
                key={option.value || "both"}
                type="button"
                onClick={() => setPerson(option.value)}
                className={cn(
                  "rounded-lg px-2 py-2 text-[11px] font-semibold transition-colors",
                  person === option.value ? "bg-feature text-white" : "glass text-muted hover:text-foreground"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className={label}>How often?</label>
          <div className="mt-1 grid grid-cols-4 gap-1.5">
            {REPEATS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRepeat(option.value)}
                className={cn(
                  "rounded-lg px-2 py-2 text-[11px] font-semibold transition-colors",
                  repeat === option.value
                    ? "glass-pill"
                    : "glass text-muted hover:text-foreground"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Only the fields that apply to the chosen cycle */}
        {repeat === "once" ? (
          <div>
            <label className={label}>On which date?</label>
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className={field}
            />
          </div>
        ) : null}

        {repeat === "weekly" ? (
          <div>
            <label className={label}>Which day?</label>
            <select
              value={weekday}
              onChange={(event) =>
                setWeekday(event.target.value === "" ? "" : Number(event.target.value))
              }
              className={field}
            >
              <option value="">Pick a day</option>
              {WEEKDAYS.map((name, index) => (
                <option key={name} value={index}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {repeat === "monthly" || repeat === "yearly" ? (
          <div className="flex gap-2">
            {repeat === "yearly" ? (
              <div className="flex-1">
                <label className={label}>Month</label>
                <select
                  value={month}
                  onChange={(event) =>
                    setMonth(event.target.value === "" ? "" : Number(event.target.value))
                  }
                  className={field}
                >
                  <option value="">Pick</option>
                  {MONTHS.map((name, index) => (
                    <option key={name} value={index + 1}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="flex-1">
              <label className={label}>Day of month</label>
              <select
                value={dayOfMonth}
                onChange={(event) =>
                  setDayOfMonth(event.target.value === "" ? "" : Number(event.target.value))
                }
                className={field}
              >
                <option value="">Pick</option>
                {DAYS.map((day) => (
                  <option key={day} value={day}>
                    {day}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ) : null}

        <div className="flex gap-2">
          <div className="flex-1">
            <label className={label}>Time (optional)</label>
            <input
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
              className={field}
            />
          </div>
          <div className="flex-1">
            <label className={label}>Remind me this early</label>
            <select
              value={leadDays}
              onChange={(event) => setLeadDays(Number(event.target.value))}
              className={field}
            >
              <option value={0}>On the day</option>
              <option value={1}>1 day before</option>
              <option value={2}>2 days before</option>
              <option value={3}>3 days before</option>
              <option value={5}>5 days before</option>
              <option value={7}>1 week before</option>
              <option value={14}>2 weeks before</option>
            </select>
          </div>
        </div>

        {/* Say back exactly what was built, so nothing is a surprise later. */}
        <div className="rounded-xl border border-accent/25 bg-accent/[0.07] px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-accent">
            {assistantName} will remember
          </p>
          <p className="mt-0.5 text-[12px]">
            {text.trim() || "…"} — {describeSchedule(preview)}
          </p>
          <p className="mt-0.5 text-[10px] text-muted">
            {dueLabel(preview)}
            {leadDays > 0 ? ` · raised ${leadDays} day${leadDays === 1 ? "" : "s"} early` : ""}
          </p>
        </div>

        <div className="flex gap-2 pt-1">
          <GlassButton variant="ghost" className="flex-1" onClick={onClose}>
            Cancel
          </GlassButton>
          <GlassButton
            className="flex-1"
            onClick={() => canSave && onSave(draft)}
            disabled={!canSave}
          >
            {initial ? "Save changes" : "Add reminder"}
          </GlassButton>
        </div>
      </div>
    </GlassModal>
  );
}
