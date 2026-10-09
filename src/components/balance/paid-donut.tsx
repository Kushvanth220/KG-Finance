"use client";

import { PERSON_LABELS, type Person } from "@/types";
import { formatCurrency } from "@/lib/formatters";

/**
 * Two slices: what each of you paid for the other this month. Small enough
 * to sit in a header; the numbers beside it do the talking.
 */

const TINT: Record<Person, string> = { kushvanth: "var(--accent)", g: "var(--feature)" };

export function PaidDonut({ paid, size = 44 }: { paid: Record<Person, number>; size?: number }) {
  const total = paid.kushvanth + paid.g;
  const r = 15;
  const c = 2 * Math.PI * r;
  const kushFrac = total > 0 ? paid.kushvanth / total : 0;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="img"
      aria-label={`${PERSON_LABELS.kushvanth} paid ${formatCurrency(paid.kushvanth)}, ${PERSON_LABELS.g} paid ${formatCurrency(paid.g)}`}
    >
      <circle cx="20" cy="20" r={r} fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="7" />
      {total > 0 ? (
        <>
          <circle
            cx="20"
            cy="20"
            r={r}
            fill="none"
            stroke={TINT.g}
            strokeWidth="7"
            strokeDasharray={`${c * (1 - kushFrac)} ${c}`}
            strokeDashoffset={-c * kushFrac}
            transform="rotate(-90 20 20)"
          />
          <circle
            cx="20"
            cy="20"
            r={r}
            fill="none"
            stroke={TINT.kushvanth}
            strokeWidth="7"
            strokeDasharray={`${c * kushFrac} ${c}`}
            transform="rotate(-90 20 20)"
          />
        </>
      ) : null}
    </svg>
  );
}
