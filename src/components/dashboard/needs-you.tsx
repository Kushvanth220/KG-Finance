"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ChevronRight, HelpCircle } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { useRulesStore } from "@/store/rules-store";
import { findFlexRule } from "@/lib/flex";
import { blocksAwaitingTips } from "@/lib/flex-deposits";
import type { Person } from "@/types";

/**
 * The jobs the app is waiting on, and nothing else.
 *
 * A dashboard that only reports is half a dashboard: the numbers go stale
 * because of work nobody did. Today that is Flex blocks whose tips never went
 * in, a tap from the page that fixes it. The card removes itself when there
 * is nothing to do, so its presence is the signal.
 *
 * It does not track Flex deposits: Flex income is entered by hand on the
 * Accounts page, so there is nothing for the app to chase.
 */

const TIP_CHASE_HOURS = 48;

export function NeedsYou({ person }: { person: Person }) {
  const rules = useRulesStore((state) => state.rules);
  const entries = useRulesStore((state) => state.entries);

  const items = useMemo(() => {
    // The Flex rule belongs to one person; do not nag the other about it.
    const rule = findFlexRule(rules);
    if (!rule || (rule.scope !== "shared" && rule.scope !== person)) return [];

    const out: { key: string; icon: typeof HelpCircle; tone: string; title: string; detail: string; href: string }[] =
      [];

    const waiting = blocksAwaitingTips(rule, entries, TIP_CHASE_HOURS);
    if (waiting.length > 0) {
      out.push({
        key: "tips",
        icon: HelpCircle,
        tone: "text-accent",
        title: `${waiting.length} ${waiting.length === 1 ? "block" : "blocks"} still missing tips`,
        detail: "Finished over two days ago — the totals are short until they go in",
        href: "/flex",
      });
    }

    return out;
  }, [rules, entries, person]);

  if (items.length === 0) return null;

  return (
    <GlassCard strong className="!p-0 overflow-hidden border border-caution/25">
      <p className="px-3 pt-2.5 text-[10px] font-semibold uppercase tracking-wide text-muted">Needs you</p>
      <ul className="mt-1 divide-y divide-black/5 dark:divide-white/[0.07]">
        {items.map((item) => (
          <li key={item.key}>
            <Link href={item.href} className="flex items-center gap-3 px-3 py-2.5 hover:bg-black/[0.03] dark:hover:bg-white/[0.04]">
              <item.icon className={`h-4 w-4 shrink-0 ${item.tone}`} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-medium leading-snug">{item.title}</span>
                <span className="block text-[10.5px] text-muted">{item.detail}</span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}
