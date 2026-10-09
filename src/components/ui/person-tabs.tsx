"use client";

import { cn } from "@/lib/utils";
import { PERSON_LABELS, type Person } from "@/types";

export type PersonFilter = Person | "overall";

type PersonTabsBaseProps = {
  className?: string;
};

type PersonTabsWithoutOverall = PersonTabsBaseProps & {
  includeOverall?: false;
  value: Person;
  onChange: (person: Person) => void;
};

type PersonTabsWithOverall = PersonTabsBaseProps & {
  includeOverall: true;
  value: PersonFilter;
  onChange: (person: PersonFilter) => void;
};

type PersonTabsProps = PersonTabsWithoutOverall | PersonTabsWithOverall;

export function PersonTabs(props: PersonTabsProps) {
  const { value, onChange, className } = props;
  const includeOverall = props.includeOverall === true;
  const tabs: { id: PersonFilter; label: string }[] = includeOverall
    ? [
        { id: "overall", label: "Overall" },
        { id: "kushvanth", label: PERSON_LABELS.kushvanth },
        { id: "g", label: PERSON_LABELS.g },
      ]
    : [
        { id: "kushvanth", label: PERSON_LABELS.kushvanth },
        { id: "g", label: PERSON_LABELS.g },
      ];

  return (
    <div className={cn("glass rounded-2xl p-1 flex gap-1", className)}>
      {tabs.map(({ id, label }) => (
        <button
          key={id}
          onClick={() => {
            if (includeOverall) {
              (onChange as (person: PersonFilter) => void)(id);
            } else {
              (onChange as (person: Person) => void)(id as Person);
            }
          }}
          className={cn(
            "tap-card focus-ring flex-1 py-2.5 px-3 rounded-xl text-sm font-medium",
            value === id
              ? "glass-pill"
              : "text-muted hover:text-foreground"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
