"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/formatters";

/**
 * Several measures on one chart.
 *
 * Base pay and tips are not two unrelated numbers — they ADD UP to the deposit,
 * so bars stack and the stack height is the total. Drawing them as separate
 * charts would hide the one relationship that matters, and drawing only the
 * total would hide where it came from.
 *
 * Line and area keep the series apart instead, because a trend is read per
 * measure rather than as a sum.
 */

export type StackedChartType = "bar" | "line" | "area";

export interface StackedSeries {
  key: string;
  label: string;
  color: string;
}

export interface StackedRow {
  label: string;
  [key: string]: string | number;
}

const AXIS = { fontSize: 10, fill: "currentColor" } as const;
const GRID = "rgba(127,127,127,0.16)";

function Tip({
  active,
  payload,
  label,
  series,
}: {
  active?: boolean;
  payload?: { dataKey?: string | number; value?: number }[];
  label?: string;
  series: StackedSeries[];
}) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((sum, item) => sum + Number(item.value ?? 0), 0);

  return (
    <div className="glass rounded-lg px-2.5 py-1.5 text-[11px] shadow-lg">
      <p className="mb-1 font-medium">{label}</p>
      {payload.map((item) => {
        const meta = series.find((s) => s.key === item.dataKey);
        return (
          <p key={String(item.dataKey)} className="flex items-center gap-2 tabular-nums">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: meta?.color }}
            />
            {meta?.label ?? item.dataKey}: {formatCurrency(Number(item.value ?? 0))}
          </p>
        );
      })}
      {payload.length > 1 ? (
        <p className="mt-1 border-t border-black/10 pt-1 font-semibold tabular-nums dark:border-white/15">
          Total {formatCurrency(total)}
        </p>
      ) : null}
    </div>
  );
}

export function StackedChart({
  type,
  rows,
  series,
  height = 220,
  emptyMessage = "Nothing recorded yet.",
}: {
  type: StackedChartType;
  rows: StackedRow[];
  series: StackedSeries[];
  height?: number;
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="flex h-full min-h-[160px] items-center justify-center rounded-xl border border-dashed border-black/10 dark:border-white/15">
        <p className="text-[11px] text-muted">{emptyMessage}</p>
      </div>
    );
  }

  const short = (value: number) =>
    `$${Math.abs(value) >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toFixed(0)}`;

  // The stack total is worth printing, but only while there is room for it.
  const showTotals = type === "bar" && rows.length <= 10;

  const legend = (
    <Legend
      wrapperStyle={{ fontSize: 10 }}
      formatter={(value: string) => series.find((s) => s.key === value)?.label ?? value}
    />
  );

  if (type === "bar") {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={rows} margin={{ top: 20, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={short} width={44} />
          <Tooltip content={<Tip series={series} />} cursor={{ fill: "rgba(127,127,127,0.08)" }} />
          {legend}
          {series.map((item, index) => (
            <Bar
              key={item.key}
              dataKey={item.key}
              stackId="stack"
              fill={item.color}
              radius={index === series.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]}
              maxBarSize={54}
            >
              {/* Printed once, on the topmost slice, so it reads as the total. */}
              {showTotals && index === series.length - 1 ? (
                <LabelList
                  position="top"
                  style={{ fontSize: 10, fill: "currentColor" }}
                  valueAccessor={(entry: { payload?: StackedRow }) =>
                    series.reduce((sum, s) => sum + Number(entry.payload?.[s.key] ?? 0), 0)
                  }
                  formatter={(value) => formatCurrency(Number(value))}
                />
              ) : null}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  const ChartTag = type === "area" ? AreaChart : LineChart;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ChartTag data={rows} margin={{ top: 16, right: 12, bottom: 0, left: -12 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={short} width={44} />
        <Tooltip content={<Tip series={series} />} />
        {legend}
        {series.map((item) =>
          type === "area" ? (
            <Area
              key={item.key}
              type="monotone"
              dataKey={item.key}
              stroke={item.color}
              strokeWidth={2}
              fill={item.color}
              fillOpacity={0.15}
            />
          ) : (
            <Line
              key={item.key}
              type="monotone"
              dataKey={item.key}
              stroke={item.color}
              strokeWidth={2}
              dot={{ r: 2.5, fill: item.color }}
              activeDot={{ r: 5 }}
            />
          )
        )}
      </ChartTag>
    </ResponsiveContainer>
  );
}
