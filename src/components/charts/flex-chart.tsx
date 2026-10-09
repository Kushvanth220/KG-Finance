"use client";

import { useId } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { formatCurrency } from "@/lib/formatters";

/** One tempo for every mark: fast enough to feel instant, slow enough to read. */
const CHART_MS = 700;

/**
 * One chart, any shape.
 *
 * Rules let the user pick how their own data is drawn, and the dashboard offers
 * the same choice, so the picker and the renderer are one component rather
 * than a switch in each place.
 *
 * Numbers are printed ON the marks, not left to a hover tooltip — the request was for
 * the figures to be readable at a glance, and a tooltip is invisible on a phone.
 */

export type FlexChartType = "bar" | "line" | "area" | "pie" | "donut" | "scatter" | "bubble";

export const CHART_PALETTE = [
  "var(--accent)",
  "var(--success)",
  "var(--warning)",
  "var(--danger)",
  "var(--accent-cyan)",
  "#a78bfa",
  "var(--amber)",
  "#6f7fa8",
  "var(--chart-moss)",
  "#ff5d73",
] as const;

export function chartColor(index: number): string {
  return CHART_PALETTE[index % CHART_PALETTE.length]!;
}

export interface FlexChartPoint {
  /** Category / x value, already formatted for display. */
  label: string;
  value: number;
  /**
   * This point's own colour, for points that stand for something with an
   * identity (a country): the colour follows the thing, not its position, so
   * a filter that drops one point does not repaint the rest.
   */
  color?: string;
  /** Bubble size. */
  size?: number;
  /** Numeric x for scatter/bubble; falls back to position. */
  x?: number;
}

const AXIS = { fontSize: 10, fill: "currentColor" } as const;
const GRID = "rgba(127,127,127,0.16)";

function Empty({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-[160px] items-center justify-center rounded-xl border border-dashed border-black/10 dark:border-white/15">
      <p className="text-[11px] text-muted">{message}</p>
    </div>
  );
}

function TooltipBox({
  active,
  payload,
  format,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; payload?: FlexChartPoint }[];
  format: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0];
  const value = Number(point?.value ?? 0);
  return (
    <div className="glass rounded-lg px-2.5 py-1.5 text-[11px] shadow-lg">
      <p className="font-medium">{point?.payload?.label ?? point?.name}</p>
      <p className="tabular-nums">{format(value)}</p>
    </div>
  );
}

export function FlexChart({
  type,
  data,
  money = true,
  format,
  formatShort,
  color,
  height = 220,
  xLabel,
  emptyMessage = "Nothing recorded yet.",
}: {
  type: FlexChartType;
  data: FlexChartPoint[];
  /** Format values as currency. */
  money?: boolean;
  /** Overrides `money` — for amounts that are not dollars (₹, ₱). */
  format?: (value: number) => string;
  /** The axis's compact form of `format`, e.g. "₹48k". */
  formatShort?: (value: number) => string;
  /** One colour for every mark: a single series reads as one thing, not a rainbow. */
  color?: string;
  height?: number;
  xLabel?: string;
  emptyMessage?: string;
}) {
  // Two area charts on one page must not share a gradient; ids are document-wide.
  const fillId = `flexFill-${useId().replace(/:/g, "")}`;
  if (data.length === 0) return <Empty message={emptyMessage} />;

  const fmt =
    format ?? ((value: number) => (money ? formatCurrency(value) : Number(value).toLocaleString()));
  const shortFmt =
    formatShort ??
    ((value: number) =>
      money
        ? `$${Math.abs(value) >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toFixed(0)}`
        : String(value));
  const markColor = (point: FlexChartPoint | undefined, index: number) =>
    point?.color ?? color ?? chartColor(index);
  const lineColor = color ?? chartColor(0);

  // Printing a label on every mark stops being readable past ~12 of them.
  const showLabels = data.length <= 12;

  if (type === "pie" || type === "donut") {
    const total = data.reduce((sum, point) => sum + point.value, 0);
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie animationDuration={CHART_MS} animationEasing="ease-out"
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius={type === "donut" ? "55%" : 0}
            outerRadius="80%"
            paddingAngle={data.length > 1 ? 2 : 0}
            label={
              showLabels
                ? (entry: { label?: string; value?: number }) => {
                    const share = total > 0 ? ((entry.value ?? 0) / total) * 100 : 0;
                    return `${entry.label} ${share.toFixed(0)}%`;
                  }
                : false
            }
            labelLine={false}
            style={{ fontSize: 10, fill: "currentColor" }}
          >
            {data.map((point, index) => (
              <Cell key={`${point.label}-${index}`} fill={markColor(point, index)} />
            ))}
          </Pie>
          <Tooltip content={<TooltipBox format={fmt} />} />
          <Legend
            wrapperStyle={{ fontSize: 10 }}
            formatter={(value: string, entry: { payload?: { value?: number } }) =>
              `${value} · ${fmt(Number(entry?.payload?.value ?? 0))}`
            }
          />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (type === "scatter" || type === "bubble") {
    const points = data.map((point, index) => ({
      ...point,
      x: point.x ?? index + 1,
      z: point.size ?? 1,
    }));
    return (
      <ResponsiveContainer width="100%" height={height}>
        {/* Top margin clears the value labels; a bubble's radius eats into it,
            so bubbles get more. Without this the highest point's number is
            clipped off the top edge — the one number most worth reading. */}
        <ScatterChart
          margin={{ top: type === "bubble" ? 30 : 22, right: 16, bottom: 4, left: -12 }}
        >
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="x"
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            name={xLabel ?? "x"}
            // Pad the ends so the first and last marks are not on the frame,
            // and tick only where a point actually is — a numeric axis would
            // otherwise print a meaningless 0.
            domain={[0.5, points.length + 0.5]}
            ticks={points.map((point) => point.x)}
            tickFormatter={(value: number) => points[value - 1]?.label ?? String(value)}
          />
          <YAxis
            type="number"
            dataKey="value"
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            tickFormatter={shortFmt}
          />
          {type === "bubble" ? <ZAxis type="number" dataKey="z" range={[60, 620]} /> : null}
          <Tooltip content={<TooltipBox format={fmt} />} cursor={{ strokeDasharray: "3 3" }} />
          <Scatter animationDuration={CHART_MS} animationEasing="ease-out" data={points} fill={lineColor} fillOpacity={0.75}>
            {showLabels ? (
              <LabelList
                dataKey="value"
                position="top"
                style={{ fontSize: 10, fill: "currentColor" }}
                formatter={(value) => fmt(Number(value))}
              />
            ) : null}
            {points.map((point, index) => (
              <Cell key={`${point.label}-${index}`} fill={markColor(point, index)} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    );
  }

  if (type === "line" || type === "area") {
    const ChartTag = type === "area" ? AreaChart : LineChart;
    return (
      <ResponsiveContainer width="100%" height={height}>
        <ChartTag data={data} margin={{ top: 16, right: 12, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity={0.35} />
              <stop offset="100%" stopColor={lineColor} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={shortFmt} width={44} />
          <Tooltip content={<TooltipBox format={fmt} />} />
          {type === "area" ? (
            <Area animationDuration={CHART_MS} animationEasing="ease-out"
              type="monotone"
              dataKey="value"
              stroke={lineColor}
              strokeWidth={2}
              fill={`url(#${fillId})`}
            >
              {showLabels ? (
                <LabelList
                  dataKey="value"
                  position="top"
                  style={{ fontSize: 10, fill: "currentColor" }}
                  formatter={(value) => fmt(Number(value))}
                />
              ) : null}
            </Area>
          ) : (
            <Line animationDuration={CHART_MS} animationEasing="ease-out"
              type="monotone"
              dataKey="value"
              stroke={lineColor}
              strokeWidth={2}
              dot={{ r: 3, fill: lineColor }}
              activeDot={{ r: 5 }}
            >
              {showLabels ? (
                <LabelList
                  dataKey="value"
                  position="top"
                  style={{ fontSize: 10, fill: "currentColor" }}
                  formatter={(value) => fmt(Number(value))}
                />
              ) : null}
            </Line>
          )}
        </ChartTag>
      </ResponsiveContainer>
    );
  }

  // bar
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 18, right: 12, bottom: 0, left: -12 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={shortFmt} width={44} />
        <Tooltip content={<TooltipBox format={fmt} />} cursor={{ fill: "rgba(127,127,127,0.08)" }} />
        <Bar animationDuration={CHART_MS} animationEasing="ease-out" dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={54}>
          {showLabels ? (
            <LabelList
              dataKey="value"
              position="top"
              style={{ fontSize: 10, fill: "currentColor" }}
              formatter={(value) => fmt(Number(value))}
            />
          ) : null}
          {data.map((point, index) => (
            <Cell key={`${point.label}-${index}`} fill={markColor(point, index)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export const CHART_TYPE_OPTIONS: { value: FlexChartType; label: string }[] = [
  { value: "bar", label: "Bar" },
  { value: "line", label: "Line" },
  { value: "area", label: "Area" },
  { value: "donut", label: "Donut" },
  { value: "pie", label: "Pie" },
  { value: "scatter", label: "Scatter" },
  { value: "bubble", label: "Bubble" },
];
