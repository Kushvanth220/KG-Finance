"use client";

import { Children } from "react";
import { motion, useReducedMotion } from "motion/react";
import { PersonTabs } from "@/components/ui/person-tabs";
import { cn } from "@/lib/utils";
import type { Person } from "@/types";

type PersonFilter = Person | "overall";

/**
 * Sections fade up one after another on load. The header is left out of it so
 * the page never looks empty while the cards arrive; on a slow phone that gap
 * is the difference between "loading" and "broken".
 */
const EASE = [0.16, 1, 0.3, 1] as const;
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const rise = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } },
};

type CompactPageShellProps = {
  /** A node, so a page with its own branding can put its mark in the heading. */
  title: React.ReactNode;
  subtitle?: string;
  action?: React.ReactNode;
  person?: Person;
  onPersonChange?: (person: Person) => void;
  personOverall?: boolean;
  personFilter?: PersonFilter;
  onPersonFilterChange?: (person: PersonFilter) => void;
  children: React.ReactNode;
  className?: string;
};

export function CompactPageShell({
  title,
  subtitle,
  action,
  person,
  onPersonChange,
  personOverall = false,
  personFilter,
  onPersonFilterChange,
  children,
  className,
}: CompactPageShellProps) {
  const still = useReducedMotion();

  return (
    <div className={cn("space-y-3 max-w-lg mx-auto pb-2", className)}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-tight">{title}</h1>
          {subtitle ? <p className="text-xs text-muted mt-0.5">{subtitle}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>

      {personOverall && personFilter != null && onPersonFilterChange ? (
        <PersonTabs
          value={personFilter}
          onChange={onPersonFilterChange}
          includeOverall
          className="!rounded-xl !p-0.5 [&_button]:py-1.5 [&_button]:text-xs"
        />
      ) : person != null && onPersonChange ? (
        <PersonTabs
          value={person}
          onChange={onPersonChange}
          className="!rounded-xl !p-0.5 [&_button]:py-1.5 [&_button]:text-xs"
        />
      ) : null}

      <motion.div
        className="space-y-3"
        variants={stagger}
        initial={still ? "show" : "hidden"}
        animate="show"
      >
        {/* toArray drops null/false children, so a hidden section leaves no gap. */}
        {Children.toArray(children).map((child, index) => (
          <motion.div key={index} variants={rise}>
            {child}
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}

export function CompactStatGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("grid grid-cols-2 gap-2", className)}>{children}</div>;
}

export function CompactStat({
  label,
  value,
  color,
  prefix,
}: {
  label: string;
  value: string;
  color?: string;
  prefix?: string;
}) {
  return (
    <div className="glass rounded-xl p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted font-semibold">{label}</p>
      <p
        className="text-base font-bold tabular-nums mt-0.5 leading-none"
        style={color ? { color } : undefined}
      >
        {prefix}
        {value}
      </p>
    </div>
  );
}

export function CompactSection({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("glass rounded-xl overflow-hidden", className)}>
      <div className="px-3 py-2 border-b border-black/5 dark:border-white/10 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold">{title}</p>
        {action}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}
