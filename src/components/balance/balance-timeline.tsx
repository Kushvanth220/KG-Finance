"use client";

import { useId } from "react";
import { format } from "date-fns";
import type { TimelinePoint } from "@/lib/balance-insights";
import { formatCurrency } from "@/lib/formatters";

/**
 * Thirty days of the balance as one line, so the figure above it has a
 * direction. The scale hugs the values — a $7,000 balance that moved by $130
 * should show the move, not a flat line a mile above zero — and the zero
 * line is drawn only when the balance actually crosses it.
 */
export function BalanceTimeline({ points, className }: { points: TimelinePoint[]; className?: string }) {
  const gradientId = useId();
  if (points.length < 2) return null;

  const width = 320;
  const height = 64;
  const padX = 4;
  const padY = 8;
  const values = points.map((p) => p.balance);
  const rawMax = Math.max(...values);
  const rawMin = Math.min(...values);
  const flat = Math.abs(rawMax - rawMin) < 0.005;
  // A little headroom so the line never kisses the frame.
  const pad = flat ? Math.max(Math.abs(rawMax) * 0.1, 1) : (rawMax - rawMin) * 0.15;
  const max = rawMax + pad;
  const min = rawMin - pad;
  const span = Math.max(max - min, 1);
  const x = (i: number) => padX + (i / (points.length - 1)) * (width - padX * 2);
  const y = (v: number) => padY + ((max - v) / span) * (height - padY * 2);
  const floorY = height - padY;
  const crossesZero = rawMin <= 0 && rawMax >= 0;

  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.balance).toFixed(1)}`).join(" ");
  const area = `M${x(0).toFixed(1)},${floorY.toFixed(1)} L${line.split(" ").join(" L")} L${x(points.length - 1).toFixed(1)},${floorY.toFixed(1)} Z`;

  const first = points[0]!;
  const last = points[points.length - 1]!;

  return (
    <div className={className}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-16 w-full"
        role="img"
        aria-label={`Balance over the last ${points.length} days, from ${formatCurrency(first.balance)} to ${formatCurrency(last.balance)}`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent-cyan)" stopOpacity="0.28" />
            <stop offset="1" stopColor="var(--accent-cyan)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {crossesZero ? (
          <line x1={padX} x2={width - padX} y1={y(0)} y2={y(0)} stroke="currentColor" strokeOpacity="0.2" strokeDasharray="2 3" />
        ) : null}
        <path d={area} fill={`url(#${gradientId})`} />
        <polyline points={line} fill="none" stroke="var(--accent-cyan)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(points.length - 1)} cy={y(last.balance)} r="3.5" fill="var(--accent-cyan)" />
        <circle cx={x(points.length - 1)} cy={y(last.balance)} r="6" fill="var(--accent-cyan)" opacity="0.25" />
      </svg>
      <div className="flex items-center justify-between text-[9px] text-muted tabular-nums">
        <span>{format(first.date, "MM/dd")} · {formatCurrency(first.balance)}</span>
        <span>Last {points.length} days</span>
        <span>{formatCurrency(last.balance)} · {format(last.date, "MM/dd")}</span>
      </div>
    </div>
  );
}
