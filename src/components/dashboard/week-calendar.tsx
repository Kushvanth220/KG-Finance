"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlarmClock, Bell, ChevronLeft, ChevronRight, Receipt, X } from "lucide-react";
import { formatReminderAmount, formatTime, occursOn, ringTimes, toIsoDate, type Reminder } from "@/lib/ai/reminders";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { Person } from "@/types";

/**
 * Home's calendar: this week, until you pull it open.
 *
 * Folded, it is one row — today's week, with a dot under each day something is
 * due. Pull the handle (or tap it) and the rest of the month unfolds row by row
 * out of that week. Tap a first day and a last day and the whole of Home
 * follows that range; the days between fill in a wave from the first.
 *
 * A tap also opens the agenda under the days: what is due on the day tapped,
 * or across the range once the last day is in. It stays until closed, or until
 * the range is changed some other way (a preset above).
 */

const WEEK = ["S", "M", "T", "W", "T", "F", "S"];
const ROW = 44;

const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a: Date, b: Date) => midnight(a).getTime() === midnight(b).getTime();
const dayDiff = (a: Date, b: Date) => Math.round((midnight(b).getTime() - midnight(a).getTime()) / 86_400_000);

type Kind = "pay" | "alarm" | "reminder";
const KIND_CLASS: Record<Kind, string> = { pay: "bg-caution", alarm: "bg-accent", reminder: "bg-feature" };
const KIND_TEXT: Record<Kind, string> = { pay: "text-caution", alarm: "text-accent", reminder: "text-feature" };
const KIND_ICON = { pay: Receipt, alarm: AlarmClock, reminder: Bell } as const;
const kindOf = (r: Reminder): Kind => (r.alarm ? "alarm" : r.amount ? "pay" : "reminder");
// The agenda lists this many rows, then says how many more.
const AGENDA_ROWS = 12;
// Made once: every day of the month is named for screen readers on each draw.
const DAY_NAME = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" });

export function WeekCalendar({
  start,
  end,
  onPick,
  reminders,
  person,
  accent,
}: {
  start: Date;
  end: Date;
  /** A new range: the same day twice while waiting for the last day. */
  onPick: (from: Date, to: Date) => void;
  reminders: Reminder[];
  person: Person;
  accent: string;
}) {
  const still = useReducedMotion();
  const today = useMemo(() => midnight(new Date()), []);
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [open, setOpen] = useState(false);
  // The first day tapped, while waiting for the last one.
  const [picking, setPicking] = useState<Date | null>(null);
  // Bumped on every new range so the fill replays as a wave.
  const [wave, setWave] = useState(0);
  // The range the last tap made; the agenda shows while Home is still on it.
  const [agendaFor, setAgendaFor] = useState<{ from: Date; to: Date } | null>(null);

  const mine = useMemo(
    () => reminders.filter((r) => !r.done && (!r.person || r.person === person)),
    [reminders, person]
  );

  const weeks = useMemo(() => {
    const lead = month.getDay();
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= days; d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d));
    while (cells.length % 7) cells.push(null);
    const rows: (Date | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [month]);

  const due = useMemo(() => {
    const map = new Map<number, Reminder[]>();
    for (const row of weeks) {
      for (const day of row) {
        if (!day) continue;
        const items = mine.filter((r) => occursOn(r, day));
        if (items.length) map.set(day.getTime(), items);
      }
    }
    return map;
  }, [weeks, mine]);
  // Folded, only one week is on screen; the rest of the month is drawn the first time it opens,
  // and kept after, so folding it back still slides full rows away.
  const [drawnAll, setDrawnAll] = useState(false);
  const unfold = (next: boolean) => {
    if (next) setDrawnAll(true);
    setOpen(next);
  };

  // The row that stays when folded: today's week, or the month's first.
  const focus = Math.max(
    0,
    weeks.findIndex((row) => row.some((day) => day && sameDay(day, today)))
  );

  const from = picking ?? start;
  const to = picking ?? end;
  const inRange = (day: Date) => day >= midnight(from) && day <= midnight(to);
  const isEdge = (day: Date) => sameDay(day, from) || sameDay(day, to);

  const tap = (day: Date) => {
    if (!picking) {
      setPicking(day);
      onPick(day, day);
      setAgendaFor({ from: day, to: day });
    } else {
      const [a, b] = day < picking ? [day, picking] : [picking, day];
      setPicking(null);
      onPick(a, b);
      setAgendaFor({ from: a, to: b });
    }
    setWave((n) => n + 1);
  };

  const shift = (by: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + by, 1));

  // Every day in the range with something due, and what.
  const agenda = useMemo(() => {
    const days: { day: Date; items: Reminder[] }[] = [];
    for (let d = midnight(from); d <= midnight(to); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      const items = mine.filter((r) => occursOn(r, d));
      if (items.length) days.push({ day: d, items });
      if (dayDiff(from, d) > 400) break;
    }
    return days;
  }, [from, to, mine]);

  // What is due across the range, in one line.
  const summary = useMemo(() => {
    let count = 0;
    let total = 0;
    for (const { items } of agenda) {
      for (const r of items) {
        count++;
        total += r.amount ?? 0;
      }
    }
    return { count, total };
  }, [agenda]);

  // Shown after a tap, until a preset (or anything else) moves Home to another range.
  const agendaOpen =
    !!agendaFor && (!!picking || (sameDay(start, agendaFor.from) && sameDay(end, agendaFor.to)));
  const oneDay = sameDay(from, to);
  const agendaTitle = oneDay
    ? from.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
    : `${from.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${to.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  const agendaRows = agenda.flatMap(({ day, items }) => items.map((item) => ({ day, item })));

  const monthLabel = month.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="mt-1.5">
      <div className="flex items-center justify-between px-1 pb-1">
        <p className="text-[12px] font-semibold">{monthLabel}</p>
        <div className="flex items-center gap-1">
          {picking ? (
            <span className="text-[10px] font-medium text-accent">Tap the last day</span>
          ) : summary.count ? (
            <span className="text-[10px] text-muted tabular-nums">
              {summary.count} due{summary.total ? ` · ${formatCurrency(summary.total)}` : ""}
            </span>
          ) : null}
          {open ? (
            <>
              <button type="button" onClick={() => shift(-1)} aria-label="Previous month" className="hit rounded-md p-1 hover:bg-black/5 dark:hover:bg-white/10">
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button type="button" onClick={() => shift(1)} aria-label="Next month" className="hit rounded-md p-1 hover:bg-black/5 dark:hover:bg-white/10">
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-7 text-center text-[9px] font-semibold text-muted">
        {WEEK.map((d, i) => (
          <span key={`${d}-${i}`}>{d}</span>
        ))}
      </div>

      <div>
        {weeks.map((row, r) => {
          const shown = open || r === focus;
          const dist = Math.abs(r - focus);
          return (
            <motion.div
              key={`${month.getTime()}-${r}`}
              initial={false}
              animate={{ height: shown ? ROW : 0, opacity: shown ? 1 : 0, y: shown ? 0 : r < focus ? 10 : -10 }}
              transition={
                still
                  ? { duration: 0 }
                  : {
                      duration: 0.55,
                      ease: [0.2, 0.9, 0.25, 1],
                      delay: open ? Math.max(0, dist - 1) * 0.08 : (weeks.length - dist) * 0.04,
                    }
              }
              className="grid grid-cols-7 overflow-hidden"
              aria-hidden={!shown}
            >
              {(drawnAll || shown) && row.map((day, c) => {
                if (!day) return <span key={c} />;
                const inside = inRange(day);
                const edge = isEdge(day);
                const items = due.get(day.getTime()) ?? [];
                const order = Math.min(Math.max(0, dayDiff(from, day)), 24);
                return (
                  <button
                    key={c}
                    type="button"
                    tabIndex={shown ? 0 : -1}
                    onClick={() => tap(day)}
                    aria-pressed={inside}
                    aria-label={`${DAY_NAME.format(day)}${items.length ? `, ${items.length} due` : ""}`}
                    className="relative flex flex-col items-center justify-center gap-0.5 text-[12px] tabular-nums"
                  >
                    {inside ? (
                      <motion.span
                        key={`fill-${wave}`}
                        aria-hidden
                        className="absolute inset-y-1 inset-x-0.5 rounded-xl"
                        style={{ background: accent, opacity: edge ? 1 : 0.18 }}
                        // The wave plays for a range picked here, not each time Home opens: a whole
                        // month of springs starting at once was a large share of opening the page.
                        initial={still || wave === 0 ? false : { scale: 0.3, opacity: 0 }}
                        animate={{ scale: 1, opacity: edge ? 1 : 0.18 }}
                        transition={{ type: "spring", stiffness: 380, damping: 22, delay: still ? 0 : order * 0.03 }}
                      />
                    ) : null}
                    <span
                      className={cn(
                        "relative",
                        edge && "font-semibold text-white",
                        !edge && sameDay(day, today) && "font-bold text-accent"
                      )}
                    >
                      {day.getDate()}
                    </span>
                    <span className="relative flex h-1 gap-0.5">
                      {items.slice(0, 3).map((item) => (
                        <i
                          key={item.id}
                          className={cn("h-1 w-1 rounded-full", edge ? "bg-white" : KIND_CLASS[kindOf(item)])}
                        />
                      ))}
                    </span>
                  </button>
                );
              })}
            </motion.div>
          );
        })}
      </div>

      {/* The tapped day's agenda: opens under the days, each row sliding in after the last. */}
      <AnimatePresence>
        {agendaOpen ? (
          <motion.div
            key="agenda"
            initial={still ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={still ? { opacity: 1 } : { height: "auto", opacity: 1 }}
            exit={still ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={{ duration: still ? 0.15 : 0.45, ease: [0.2, 0.9, 0.25, 1] }}
            className="overflow-hidden"
          >
            <section
              aria-live="polite"
              aria-label={`Due ${oneDay ? "on" : "from"} ${agendaTitle}`}
              className="mt-1.5 rounded-xl bg-black/[0.03] p-2 dark:bg-white/[0.05]"
            >
              <div className="flex items-center justify-between gap-2 px-0.5">
                <p className="min-w-0 truncate text-[11px] font-semibold">{agendaTitle}</p>
                <button
                  type="button"
                  onClick={() => setAgendaFor(null)}
                  aria-label="Close the agenda"
                  className="hit -mr-0.5 rounded-md p-1 text-muted hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>

              {agendaRows.length === 0 ? (
                <p className="px-0.5 py-2 text-[11px] text-muted">
                  Nothing due {oneDay ? "this day" : "in these days"}.
                </p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {agendaRows.slice(0, AGENDA_ROWS).map(({ day, item }, i) => {
                    const kind = kindOf(item);
                    const Icon = KIND_ICON[kind];
                    const times = ringTimes(item).map((t) => formatTime(t)!);
                    const when = [
                      oneDay ? null : day.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }),
                      times.length ? times.join(", ") : null,
                      kind === "alarm" ? "Alarm" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ");
                    return (
                      <motion.li
                        key={`${wave}-${toIsoDate(day)}-${item.id}`}
                        initial={still ? false : { opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: still ? 0 : 0.15 + i * 0.07, duration: 0.4, ease: [0.2, 0.9, 0.25, 1] }}
                        className="flex items-center gap-2 rounded-lg bg-[var(--glass-bg)] px-2 py-1.5"
                      >
                        <Icon className={cn("h-3.5 w-3.5 shrink-0", KIND_TEXT[kind])} aria-hidden />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11.5px] font-medium">{item.text}</p>
                          {when || item.note ? (
                            <p className="truncate text-[10px] text-muted">
                              {[when, item.note].filter(Boolean).join(" · ")}
                            </p>
                          ) : null}
                        </div>
                        {item.amount ? (
                          <span className="shrink-0 text-[11px] font-semibold tabular-nums text-caution">
                            {formatReminderAmount(item.amount)}
                          </span>
                        ) : null}
                      </motion.li>
                    );
                  })}
                </ul>
              )}

              <div className="mt-1.5 flex items-center justify-between px-0.5 text-[10px]">
                <span className="text-muted">
                  {agendaRows.length > AGENDA_ROWS ? `and ${agendaRows.length - AGENDA_ROWS} more` : ""}
                </span>
                <Link href="/memory" className="hit font-semibold text-accent">
                  Open in Memory
                </Link>
              </div>
            </section>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <motion.button
        type="button"
        onClick={() => unfold(!open)}
        drag={still ? false : "y"}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={0.35}
        dragSnapToOrigin
        onDragEnd={(_, info) => {
          if (info.offset.y > 18) unfold(true);
          else if (info.offset.y < -18) unfold(false);
        }}
        aria-expanded={open}
        className="mx-auto mt-0.5 flex cursor-grab flex-col items-center gap-0.5 px-6 pb-0.5 pt-1 text-[9.5px] font-medium text-muted active:cursor-grabbing"
      >
        <span className="h-1 w-9 rounded-full bg-black/15 dark:bg-white/20" />
        {open ? "Fold to this week" : "Pull for the month"}
      </motion.button>
    </div>
  );
}
