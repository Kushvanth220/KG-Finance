"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/*
 * Two linked rings — the two members, joined.
 * Circles sit at cx 25 / 39 with r 12.5, so they intersect at (32, 21.6) and
 * (32, 42.4). The left ring is redrawn over a clip around the TOP intersection
 * so the rings genuinely weave instead of merely overlapping.
 */
const LEFT = { cx: 25, cy: 32, r: 12.5 };
const RIGHT = { cx: 39, cy: 32, r: 12.5 };
const STROKE = 5;

interface KgMarkProps {
  /** Draw the rounded-tile background (app icon). Off = rings only, for inline use. */
  tile?: boolean;
  className?: string;
  title?: string;
}

export function KgMark({ tile = false, className, title }: KgMarkProps) {
  const uid = useId().replace(/:/g, "");
  const blue = `kgBlue-${uid}`;
  const purple = `kgPurple-${uid}`;
  const weave = `kgWeave-${uid}`;

  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("block", className)}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id={blue} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0A84FF" />
          <stop offset="100%" stopColor="#5E5CE6" />
        </linearGradient>
        <linearGradient id={purple} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#7F5AF0" />
          <stop offset="100%" stopColor="#C74FE6" />
        </linearGradient>
        {/* Box around the upper crossing point only. */}
        <clipPath id={weave}>
          <rect x="25" y="15" width="14" height="12" />
        </clipPath>
      </defs>

      {tile ? <rect width="64" height="64" rx="15" fill="#12121A" /> : null}

      {/* left ring (passes under on the right side) */}
      <circle
        cx={LEFT.cx}
        cy={LEFT.cy}
        r={LEFT.r}
        fill="none"
        stroke={`url(#${blue})`}
        strokeWidth={STROKE}
      />
      {/* right ring, drawn over */}
      <circle
        cx={RIGHT.cx}
        cy={RIGHT.cy}
        r={RIGHT.r}
        fill="none"
        stroke={`url(#${purple})`}
        strokeWidth={STROKE}
      />
      {/* left ring again, only at the top crossing — completes the weave */}
      <g clipPath={`url(#${weave})`}>
        <circle
          cx={LEFT.cx}
          cy={LEFT.cy}
          r={LEFT.r}
          fill="none"
          stroke={`url(#${blue})`}
          strokeWidth={STROKE}
        />
      </g>
    </svg>
  );
}
