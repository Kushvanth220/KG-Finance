"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Bell, CalendarClock, ChevronRight } from "lucide-react";
import { useFinanceStore } from "@/store/finance-store";
import { useAssistantPreferencesStore } from "@/store/assistant-preferences-store";
import { upcomingFor, whenLabel } from "@/lib/upcoming";
import { formatCurrency } from "@/lib/formatters";
import type { Person } from "@/types";
import { cn } from "@/lib/utils";

/**
 * The next seven days, on the home page.
 *
 * Bills come from Memory's bill list; reminders from Jarvis's. Both already
 * know their due dates — this just puts the ones about to land where they are
 * seen first, instead of two taps away.
 */

export function UpcomingStrip({ person }: { person: Person }) {
  const monthlyExpenses = useFinanceStore((state) => state.monthlyExpenses);
  const transactions = useFinanceStore((state) => state.transactions);
  const reminders = useAssistantPreferencesStore((state) => state.structuredReminders);

  const items = useMemo(
    () => upcomingFor(monthlyExpenses, transactions, reminders, person, 7).slice(0, 5),
    [monthlyExpenses, transactions, reminders, person]
  );

  if (items.length === 0) return null;

  return (
    <div className="glass rounded-xl px-3 py-2.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
          <CalendarClock className="h-3 w-3 text-[#ff9500]" /> Coming up
        </p>
        <Link href="/memory" className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-[#007aff]">
          Memory <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="space-y-1">
        {items.map((item) => (
          <div key={item.key} className="flex items-center gap-2 text-[12px]">
            {item.kind === "reminder" ? (
              <Bell className="h-3 w-3 shrink-0 text-[#af52de]" />
            ) : (
              <span className="h-3 w-3 shrink-0 rounded-sm bg-[#ff9500]/80" />
            )}
            <span className="min-w-0 flex-1 truncate">{item.name}</span>
            <span
              className={cn(
                "shrink-0 text-[10px] font-semibold",
                item.daysUntil <= 1 ? "text-[#ff9500]" : "text-muted"
              )}
            >
              {whenLabel(item.daysUntil)}
            </span>
            {item.amount !== null ? (
              <span className="w-16 shrink-0 text-right font-semibold tabular-nums">{formatCurrency(item.amount)}</span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
