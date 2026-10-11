"use client";

import { useState } from "react";
import { AlarmClock, Bell, Minus, Plus, Volume2, X } from "lucide-react";
import { useAssistantName } from "@/store/assistant-preferences-store";
import { GlassModal } from "@/components/ui/glass-modal";
import { GlassButton } from "@/components/ui/glass-button";
import {
  DEFAULT_ALARM_TIME,
  DEFAULT_LEAD_DAYS,
  DEFAULT_SNOOZE_MINUTES,
  MONTHS,
  WEEKDAYS,
  describeSchedule,
  dueLabel,
  formatReminderAmount,
  hasSchedule,
  ringLabel,
  toIsoDate,
  type AlarmSound,
  type Reminder,
  type ReminderRepeat,
  type ReminderUnit,
} from "@/lib/ai/reminders";
import { SOUND_LABELS, playOnce } from "@/lib/alarm-sound";
import { cn } from "@/lib/utils";
import { PERSON_LABELS } from "@/types";

/**
 * Create or edit one reminder or alarm, with its schedule as real fields.
 *
 * Only the fields that apply to the chosen cycle are shown — a weekly reminder
 * has no day-of-month, and offering one would invite nonsense data. Turning
 * on Alarm adds what only an alarm needs: a time, a snooze length, a sound.
 */

const REPEATS: { value: ReminderRepeat; label: string }[] = [
  { value: "once", label: "Once" },
  { value: "daily", label: "Daily" },
  { value: "weekdays", label: "Weekdays" },
  { value: "weekends", label: "Weekends" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "custom", label: "Custom" },
];

const UNITS: { value: ReminderUnit; label: string }[] = [
  { value: "day", label: "days" },
  { value: "week", label: "weeks" },
  { value: "month", label: "months" },
  { value: "year", label: "years" },
];

// 31 doubles as "the last day": the schedule clamps it to the month's length.
const DAYS = Array.from({ length: 30 }, (_, i) => i + 1);

const NTHS = [
  { value: 1, label: "first" },
  { value: 2, label: "second" },
  { value: 3, label: "third" },
  { value: 4, label: "fourth" },
  { value: -1, label: "last" },
];

const LEADS = [
  { value: 0, label: "On the day" },
  { value: 1, label: "1 day before" },
  { value: 2, label: "2 days before" },
  { value: 3, label: "3 days before" },
  { value: 5, label: "5 days before" },
  { value: 7, label: "1 week before" },
  { value: 14, label: "2 weeks before" },
  { value: 30, label: "1 month before" },
];

const LEAD_MINUTES = [
  { value: 0, label: "No heads-up" },
  { value: 5, label: "5 min before" },
  { value: 10, label: "10 min before" },
  { value: 15, label: "15 min before" },
  { value: 30, label: "30 min before" },
  { value: 60, label: "1 hour before" },
];

const SNOOZES = [5, 10, 15, 30, 60];

const SHORT_DAYS = ["S", "M", "T", "W", "T", "F", "S"];
// Monday first, the way a week is read.
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

type Ends = "never" | "on" | "after";

export function ReminderEditor({
  open,
  initial,
  startAsAlarm,
  onSave,
  onClose,
}: {
  open: boolean;
  initial?: Reminder;
  /** A new one opened from the Alarm button: alarm on, a time, every day. */
  startAsAlarm?: boolean;
  onSave: (draft: Omit<Reminder, "id">) => void;
  onClose: () => void;
}) {
  const assistantName = useAssistantName();
  const today = toIsoDate(new Date());
  const asAlarm = !initial && !!startAsAlarm;

  const [text, setText] = useState(initial?.text ?? "");
  const [alarm, setAlarm] = useState(!!initial?.alarm || asAlarm);
  const [person, setPerson] = useState<"kushvanth" | "g" | "">(initial?.person ?? "");
  const [repeat, setRepeat] = useState<ReminderRepeat>(initial?.repeat ?? (asAlarm ? "daily" : "monthly"));
  const [date, setDate] = useState(initial?.date ?? "");
  const [weekdays, setWeekdays] = useState<number[]>(
    initial?.weekdays ?? (initial?.weekday != null && !initial?.nth ? [initial.weekday] : [])
  );
  const [monthMode, setMonthMode] = useState<"day" | "nth">(initial?.nth ? "nth" : "day");
  const [dayOfMonth, setDayOfMonth] = useState<number | "">(initial?.dayOfMonth ?? "");
  const [nth, setNth] = useState(initial?.nth ?? 1);
  const [nthWeekday, setNthWeekday] = useState(initial?.nth ? initial.weekday ?? 1 : 1);
  const [month, setMonth] = useState<number | "">(initial?.month ?? "");
  const [every, setEvery] = useState(initial?.every ?? 2);
  const [unit, setUnit] = useState<ReminderUnit>(initial?.unit ?? "week");
  const [times, setTimes] = useState<string[]>(
    initial?.times ?? (initial?.time ? [initial.time] : asAlarm ? [DEFAULT_ALARM_TIME] : [])
  );
  const [ends, setEnds] = useState<Ends>(initial?.count ? "after" : initial?.until ? "on" : "never");
  const [until, setUntil] = useState(initial?.until ?? "");
  const [count, setCount] = useState(initial?.count ?? 10);
  const [leadDays, setLeadDays] = useState(initial?.leadDays ?? DEFAULT_LEAD_DAYS);
  const [leadMinutes, setLeadMinutes] = useState(initial?.leadMinutes ?? 0);
  const [snoozeMinutes, setSnoozeMinutes] = useState(initial?.snoozeMinutes ?? DEFAULT_SNOOZE_MINUTES);
  const [sound, setSound] = useState<AlarmSound>(initial?.sound ?? "chime");
  const [louder, setLouder] = useState(!!initial?.louder);
  const [vibrate, setVibrate] = useState(initial?.vibrate !== false);
  const [amount, setAmount] = useState(initial?.amount != null ? String(initial.amount) : "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [paused, setPaused] = useState(!!initial?.paused);

  const turnAlarm = (on: boolean) => {
    setAlarm(on);
    // An alarm rings at a time; start it at nine rather than leave it silent.
    if (on && times.length === 0) setTimes([DEFAULT_ALARM_TIME]);
  };

  // "Every 1 week" is just weekly: save the plain cycle so it reads simply.
  const plain: ReminderRepeat =
    repeat === "custom" && every === 1
      ? ({ day: "daily", week: "weekly", month: "monthly", year: "yearly" } as const)[unit]
      : repeat;
  const recurring = plain !== "once";
  const usesWeekdays = plain === "weekly" || (plain === "custom" && unit === "week");
  const usesMonthDay = plain === "monthly" || (plain === "custom" && unit === "month");
  const usesYearDay = plain === "yearly" || (plain === "custom" && unit === "year");
  const needsStart = plain === "once" || plain === "biweekly" || plain === "custom" || (recurring && ends === "after");
  const cleanTimes = [...new Set(times.filter(Boolean))].sort();
  const cents = Math.round(Number(amount) * 100) / 100;
  const money = amount.trim() !== "" && Number.isFinite(cents) && cents > 0 ? cents : null;
  const dailyish = plain === "daily" || plain === "weekdays" || plain === "weekends";

  // Every optional field is written, cleared ones as undefined: saving an edit
  // merges onto the stored reminder, and a field left out would survive there.
  const draft: Omit<Reminder, "id"> = {
    text: text.trim(),
    done: initial?.done ?? false,
    repeat: plain,
    alarm: alarm || undefined,
    leadDays: alarm || dailyish ? 0 : leadDays,
    leadMinutes: alarm && leadMinutes > 0 ? leadMinutes : undefined,
    date: needsStart ? date || (plain === "once" ? undefined : today) : undefined,
    weekdays: usesWeekdays && weekdays.length ? weekdays : undefined,
    weekday: usesMonthDay && monthMode === "nth" ? nthWeekday : undefined,
    nth: usesMonthDay && monthMode === "nth" ? nth : undefined,
    dayOfMonth: (usesMonthDay && monthMode === "day") || usesYearDay ? (dayOfMonth === "" ? undefined : dayOfMonth) : undefined,
    month: usesYearDay && month !== "" ? month : undefined,
    every: plain === "custom" ? every : undefined,
    unit: plain === "custom" ? unit : undefined,
    time: cleanTimes[0],
    times: cleanTimes.length > 1 ? cleanTimes : undefined,
    until: recurring && ends === "on" && until ? until : undefined,
    count: recurring && ends === "after" ? count : undefined,
    snoozeMinutes: alarm ? snoozeMinutes : undefined,
    sound: alarm ? sound : undefined,
    louder: alarm && louder ? true : undefined,
    vibrate: alarm ? vibrate : undefined,
    person: person || undefined,
    amount: money ?? undefined,
    note: note.trim() || undefined,
    paused: paused || undefined,
    // Keep where a cycle was ticked off, unless the cycle itself changed.
    doneThrough: initial?.repeat === plain ? initial.doneThrough : undefined,
    snoozedUntil: initial?.snoozedUntil,
    skip: initial?.skip,
  };

  const preview = { ...draft, id: initial?.id ?? "preview" } as Reminder;
  const problem = !text.trim()
    ? "Say what it's for."
    : alarm && cleanTimes.length === 0
      ? "An alarm needs a time."
      : alarm && plain === "once" && !date
        ? "Pick the day it rings."
        : recurring && !hasSchedule(preview)
          ? usesWeekdays
            ? "Pick at least one day."
            : usesYearDay
              ? "Pick the month and day."
              : "Pick the day of the month."
          : recurring && ends === "on" && until && draft.date && until < draft.date
            ? "It ends before it starts."
            : null;

  const leads = LEADS.some((option) => option.value === leadDays)
    ? LEADS
    : [...LEADS, { value: leadDays, label: `${leadDays} days before` }].sort((a, b) => a.value - b.value);

  const field = "mt-1 w-full glass-field rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40";
  const label = "text-[11px] font-medium text-muted";
  const chip = (on: boolean) =>
    cn(
      "rounded-lg px-2 py-2 text-[11px] font-semibold transition-colors",
      on ? "glass-pill" : "glass text-muted hover:text-foreground"
    );

  const toggleDay = (day: number) =>
    setWeekdays((list) => (list.includes(day) ? list.filter((d) => d !== day) : [...list, day]));

  const weekdayPicker = (
    <div>
      <label className={label}>On which days?</label>
      <div className="mt-1 flex gap-1.5">
        {WEEK_ORDER.map((day) => (
          <button
            key={day}
            type="button"
            onClick={() => toggleDay(day)}
            aria-pressed={weekdays.includes(day)}
            aria-label={WEEKDAYS[day]}
            className={cn(
              "h-9 w-9 rounded-full text-[12px] font-semibold transition-colors",
              weekdays.includes(day) ? "bg-accent text-white" : "glass text-muted hover:text-foreground"
            )}
          >
            {SHORT_DAYS[day]}
          </button>
        ))}
      </div>
    </div>
  );

  const monthDayPicker = (
    <div>
      <div className="grid grid-cols-2 gap-1.5">
        <button type="button" onClick={() => setMonthMode("day")} className={chip(monthMode === "day")}>
          On a date
        </button>
        <button type="button" onClick={() => setMonthMode("nth")} className={chip(monthMode === "nth")}>
          On a weekday
        </button>
      </div>
      {monthMode === "day" ? (
        <select
          value={dayOfMonth}
          onChange={(event) => setDayOfMonth(event.target.value === "" ? "" : Number(event.target.value))}
          className={field}
          aria-label="Day of the month"
        >
          <option value="">Pick a day</option>
          {DAYS.map((day) => (
            <option key={day} value={day}>
              The {day}
              {day === 1 ? "st" : day === 2 ? "nd" : day === 3 ? "rd" : day === 21 ? "st" : day === 22 ? "nd" : day === 23 ? "rd" : "th"}
            </option>
          ))}
          <option value={31}>The last day</option>
        </select>
      ) : (
        <div className="flex gap-2">
          <select value={nth} onChange={(event) => setNth(Number(event.target.value))} className={field} aria-label="Which one">
            {NTHS.map((option) => (
              <option key={option.value} value={option.value}>
                The {option.label}
              </option>
            ))}
          </select>
          <select
            value={nthWeekday}
            onChange={(event) => setNthWeekday(Number(event.target.value))}
            className={field}
            aria-label="Weekday"
          >
            {WEEKDAYS.map((name, index) => (
              <option key={name} value={index}>
                {name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );

  const yearDayPicker = (
    <div className="flex gap-2">
      <div className="flex-1">
        <label className={label}>Month</label>
        <select
          value={month}
          onChange={(event) => setMonth(event.target.value === "" ? "" : Number(event.target.value))}
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
      <div className="flex-1">
        <label className={label}>Day</label>
        <select
          value={dayOfMonth}
          onChange={(event) => setDayOfMonth(event.target.value === "" ? "" : Number(event.target.value))}
          className={field}
        >
          <option value="">Pick</option>
          {DAYS.map((day) => (
            <option key={day} value={day}>
              {day}
            </option>
          ))}
          <option value={31}>31 · last day</option>
        </select>
      </div>
    </div>
  );

  return (
    <GlassModal
      open={open}
      onClose={onClose}
      title={initial ? (alarm ? "Edit alarm" : "Edit reminder") : alarm ? "Add an alarm" : "Add a reminder"}
    >
      <div className="space-y-3.5">
        <div>
          <label className={label}>What should {assistantName} remind you about?</label>
          <input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Rent, car EMI, Flex block, send money home…"
            autoFocus
            className={field}
          />
        </div>

        {/* Reminder or alarm */}
        <div>
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" onClick={() => turnAlarm(false)} className={cn(chip(!alarm), "flex items-center justify-center gap-1.5")}>
              <Bell className="h-3.5 w-3.5" /> Reminder
            </button>
            <button type="button" onClick={() => turnAlarm(true)} className={cn(chip(alarm), "flex items-center justify-center gap-1.5")}>
              <AlarmClock className="h-3.5 w-3.5" /> Alarm
            </button>
          </div>
          <p className="mt-1 text-[10.5px] text-muted">
            {alarm
              ? "Rings full screen at its time and keeps going until you swipe it. With the app closed, it arrives as a notification that stays."
              : "Shows on the calendar and in the morning nudge. Give it a time and it pops up then, too."}
          </p>
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
          <div className="mt-1 grid grid-cols-3 gap-1.5">
            {REPEATS.map((option) => (
              <button key={option.value} type="button" onClick={() => setRepeat(option.value)} className={chip(repeat === option.value)}>
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Only the fields that apply to the chosen cycle */}
        {repeat === "once" ? (
          <div>
            <label className={label}>On which date?</label>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={field} />
          </div>
        ) : null}

        {repeat === "weekly" ? weekdayPicker : null}

        {repeat === "biweekly" ? (
          <div>
            <label className={label}>When is the first one?</label>
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={field} />
            <p className="mt-1 text-[10px] text-muted">
              Then every other {date ? WEEKDAYS[new Date(`${date}T00:00:00`).getDay()] : "week"} from there — paydays, for one.
            </p>
          </div>
        ) : null}

        {repeat === "monthly" ? monthDayPicker : null}
        {repeat === "yearly" ? yearDayPicker : null}

        {repeat === "custom" ? (
          <div className="space-y-3 rounded-xl border border-black/5 p-3 dark:border-white/10">
            <div className="flex flex-wrap items-center gap-2">
              <span className={label}>Every</span>
              <div className="glass flex items-center rounded-lg">
                <button type="button" onClick={() => setEvery((n) => Math.max(1, n - 1))} aria-label="Fewer" className="p-2">
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="min-w-6 text-center text-sm font-semibold tabular-nums">{every}</span>
                <button type="button" onClick={() => setEvery((n) => Math.min(99, n + 1))} aria-label="More" className="p-2">
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex gap-1">
                {UNITS.map((option) => (
                  <button key={option.value} type="button" onClick={() => setUnit(option.value)} className={chip(unit === option.value)}>
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            {unit === "week" ? weekdayPicker : null}
            {unit === "month" ? monthDayPicker : null}
            {unit === "year" ? yearDayPicker : null}
            <div>
              <label className={label}>Starting</label>
              <input type="date" value={date || today} onChange={(event) => setDate(event.target.value)} className={field} />
            </div>
          </div>
        ) : null}

        {/* Times of day */}
        <div>
          <label className={label}>{alarm ? "Rings at" : "Time (optional)"}</label>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {times.map((value, index) => (
              <div key={index} className="glass-field flex items-center rounded-xl pl-2">
                <input
                  type="time"
                  value={value}
                  onChange={(event) => setTimes((list) => list.map((t, i) => (i === index ? event.target.value : t)))}
                  className="bg-transparent py-1.5 text-sm outline-none"
                  aria-label={`Time ${index + 1}`}
                />
                <button
                  type="button"
                  onClick={() => setTimes((list) => list.filter((_, i) => i !== index))}
                  aria-label="Remove this time"
                  className="p-1.5 text-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setTimes((list) => [...list, list.length ? "20:00" : DEFAULT_ALARM_TIME])}
              className="glass rounded-xl px-3 py-2 text-[11px] font-semibold text-accent"
            >
              + {times.length ? "Another time" : "Add a time"}
            </button>
          </div>
        </div>

        {recurring ? (
          <div>
            <label className={label}>Ends</label>
            <div className="mt-1 grid grid-cols-3 gap-1.5">
              <button type="button" onClick={() => setEnds("never")} className={chip(ends === "never")}>Never</button>
              <button type="button" onClick={() => setEnds("on")} className={chip(ends === "on")}>On a date</button>
              <button type="button" onClick={() => setEnds("after")} className={chip(ends === "after")}>After</button>
            </div>
            {ends === "on" ? (
              <input type="date" value={until} min={draft.date} onChange={(event) => setUntil(event.target.value)} className={field} aria-label="Last date" />
            ) : null}
            {ends === "after" ? (
              <div className="mt-1 flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={count}
                  onChange={(event) => setCount(Math.max(1, Math.min(999, Number(event.target.value) || 1)))}
                  className={cn(field, "mt-0 w-24 tabular-nums")}
                  aria-label="Number of times"
                />
                <span className="text-[12px] text-muted">times, counting from {draft.date ?? today}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {alarm ? (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={label}>Heads-up</label>
              <select value={leadMinutes} onChange={(event) => setLeadMinutes(Number(event.target.value))} className={field}>
                {LEAD_MINUTES.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Snooze for</label>
              <select value={snoozeMinutes} onChange={(event) => setSnoozeMinutes(Number(event.target.value))} className={field}>
                {SNOOZES.map((minutes) => (
                  <option key={minutes} value={minutes}>{minutes === 60 ? "1 hour" : `${minutes} min`}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className={label}>Sound</label>
              <div className="mt-1 flex gap-1.5">
                {(Object.keys(SOUND_LABELS) as AlarmSound[]).map((value) => (
                  <button key={value} type="button" onClick={() => { setSound(value); playOnce(value); }} className={cn(chip(sound === value), "flex-1")}>
                    {SOUND_LABELS[value]}
                  </button>
                ))}
                <button type="button" onClick={() => playOnce(sound)} aria-label="Play the sound" className="glass rounded-lg px-2.5 text-accent">
                  <Volume2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-4 text-[12px]">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={louder} onChange={(event) => setLouder(event.target.checked)} className="accent-[var(--accent)]" />
                  Starts soft, gets louder
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={vibrate} onChange={(event) => setVibrate(event.target.checked)} className="accent-[var(--accent)]" />
                  Vibrate
                </label>
              </div>
            </div>
          </div>
        ) : !dailyish ? (
          <div>
            <label className={label}>Remind me this early</label>
            <select value={leadDays} onChange={(event) => setLeadDays(Number(event.target.value))} className={field}>
              {leads.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="flex gap-2">
          <div className="w-32 shrink-0">
            <label className={label}>Amount</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 z-10 mt-0.5 -translate-y-1/2 text-sm text-muted">$</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
                className={cn(field, "pl-6 tabular-nums")}
              />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <label className={label}>Note</label>
            <input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional" maxLength={300} className={field} />
          </div>
        </div>

        {initial ? (
          <label className="flex items-center gap-2 text-[12px]">
            <input type="checkbox" checked={paused} onChange={(event) => setPaused(event.target.checked)} className="accent-[var(--accent)]" />
            Paused — kept, but nothing rings or comes due
          </label>
        ) : null}

        {/* Say back exactly what was built, so nothing is a surprise later. */}
        <div className="rounded-xl border border-accent/25 bg-accent/[0.07] px-3 py-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-accent">
            {assistantName} will remember
          </p>
          <p className="mt-0.5 text-[12px]">
            {text.trim() || "…"}
            {money != null ? ` (${formatReminderAmount(money)})` : ""} — {describeSchedule(preview)}
          </p>
          <p className="mt-0.5 text-[10px] text-muted">
            {problem ?? ringLabel(preview) ?? dueLabel(preview)}
            {!problem && !alarm && draft.leadDays > 0 ? ` · raised ${draft.leadDays} day${draft.leadDays === 1 ? "" : "s"} early` : ""}
          </p>
        </div>

        <div className="flex gap-2 pt-1">
          <GlassButton variant="ghost" className="flex-1" onClick={onClose}>
            Cancel
          </GlassButton>
          <GlassButton className="flex-1" onClick={() => !problem && onSave(draft)} disabled={!!problem}>
            {initial ? "Save changes" : alarm ? "Add alarm" : "Add reminder"}
          </GlassButton>
        </div>
      </div>
    </GlassModal>
  );
}
