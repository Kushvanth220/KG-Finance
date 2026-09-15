"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getDueDateForExpense } from "@/lib/monthly-expense-tracker";
import { nextDueDate, type Reminder } from "@/lib/ai/reminders";
import { formatCurrency } from "@/lib/formatters";
import type { MonthlyExpense } from "@/types";
import { cn } from "@/lib/utils";

/**
 * The month as a grid, bills and reminders as dots on their days.
 *
 * A list says what is due; a calendar says how the month is shaped — the
 * heavy week, the quiet stretch, the two things landing on the same Friday.
 */

interface DayItem {
  key: string;
  name: string;
  kind: "bill" | "reminder";
  amount: number | null;
}

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

function key(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function BillCalendar({ bills, reminders }: { bills: MonthlyExpense[]; reminders: Reminder[] }) {
  const today = useMemo(() => new Date(), []);
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<string>(key(today));

  const { cells, byDay } = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const byDay = new Map<string, DayItem[]>();
    const push = (d: Date, item: DayItem) => {
      const k = key(d);
      byDay.set(k, [...(byDay.get(k) ?? []), item]);
    };

    for (const bill of bills) {
      const due = getDueDateForExpense(bill, first);
      if (!due || due.getMonth() !== month.getMonth() || due.getFullYear() !== month.getFullYear()) continue;
      if (!bill.isRecurring && bill.isPaid) continue;
      push(due, { key: `b-${bill.id}`, name: bill.name, kind: "bill", amount: bill.amount });
    }

    // A reminder lands on a day if, asked from that day, it is due that day.
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(month.getFullYear(), month.getMonth(), day);
      for (const reminder of reminders) {
        if (reminder.done) continue;
        const due = nextDueDate(reminder, date);
        if (due && key(due) === key(date)) {
          push(date, { key: `r-${reminder.id}-${day}`, name: reminder.text, kind: "reminder", amount: null });
        }
      }
    }

    const lead = first.getDay();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(month.getFullYear(), month.getMonth(), day));
    while (cells.length % 7 !== 0) cells.push(null);
    return { cells, byDay };
  }, [bills, reminders, month]);

  const selectedItems = byDay.get(selected) ?? [];
  const monthLabel = month.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="glass rounded-xl p-3">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
          className="hit rounded-lg p-1.5 hover:bg-black/5 dark:hover:bg-white/10"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-xs font-semibold">{monthLabel}</p>
        <button
          type="button"
          onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
          className="hit rounded-lg p-1.5 hover:bg-black/5 dark:hover:bg-white/10"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center">
        {WEEKDAYS.map((d, i) => (
          <span key={`${d}-${i}`} className="text-[9px] font-semibold uppercase text-muted">
            {d}
          </span>
        ))}
        {cells.map((date, i) => {
          if (!date) return <span key={`empty-${i}`} />;
          const k = key(date);
          const items = byDay.get(k) ?? [];
          const isToday = k === key(today);
          const isSelected = k === selected;
          return (
            <button
              key={k}
              type="button"
              onClick={() => setSelected(k)}
              className={cn(
                "flex aspect-square flex-col items-center justify-center rounded-lg text-[11px] tabular-nums transition-colors",
                isSelected ? "bg-[#007aff] text-white" : "hover:bg-black/5 dark:hover:bg-white/10",
                isToday && !isSelected && "font-bold text-[#007aff]"
              )}
              aria-label={`${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}${items.length ? `, ${items.length} due` : ""}`}
            >
              {date.getDate()}
              <span className="mt-0.5 flex h-1.5 gap-0.5">
                {items.slice(0, 3).map((item) => (
                  <span
                    key={item.key}
                    className={cn(
                      "h-1.5 w-1.5 rounded-full",
                      isSelected ? "bg-white" : item.kind === "bill" ? "bg-[#ff9500]" : "bg-[#af52de]"
                    )}
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-2 border-t border-black/5 pt-2 dark:border-white/10">
        {selectedItems.length === 0 ? (
          <p className="text-[11px] text-muted">Nothing due on {selected.slice(5).replace("-", "/")}.</p>
        ) : (
          <div className="space-y-1">
            {selectedItems.map((item) => (
              <div key={item.key} className="flex items-center gap-2 text-[12px]">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", item.kind === "bill" ? "bg-[#ff9500]" : "bg-[#af52de]")} />
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                {item.amount !== null ? (
                  <span className="shrink-0 font-semibold tabular-nums">{formatCurrency(item.amount)}</span>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
