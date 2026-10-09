"use client";

import { useMemo, useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { FlexChart } from "@/components/charts/flex-chart";
import { ChartTypePicker, useChartType } from "@/components/dashboard/chart-type-picker";
import { CountryFlag } from "@/components/transfers/country-flag";
import { formatCurrency } from "@/lib/formatters";
import {
  COUNTRIES,
  COUNTRY_META,
  formatForeign,
  formatRate,
  inPeriod,
  monthlyBuckets,
  PERIOD_OPTIONS,
  periodLabel,
  reasonBreakdown,
  REASON_LABELS,
  REASON_SHORT,
  remittanceTotals,
  type RemittancePeriod,
} from "@/lib/remittances";
import type { Remittance, RemittanceCountry } from "@/types";
import { cn } from "@/lib/utils";

/**
 * Where the money went, over a period you pick.
 *
 * Dollars by month in one chart. Rupees and pesos by month in another, one
 * currency at a time with a switch — they are different units and never
 * share an axis, let alone a bar. The country split is in dollars, the one
 * currency both sides have in common; each country keeps its flag's colour on
 * every chart. Reasons are a single series in one colour, so the length of a
 * bar is the only thing to read.
 */

const trim = (value: number) => value.toFixed(1).replace(/\.0$/, "");

/**
 * The axis needs short, the tooltip exact. Rupees go by lakh and crore —
 * "₹1.5L", "₹2Cr" — which is how they are said, and shorter than "₹150k".
 */
function compact(symbol: string) {
  return (value: number) => {
    const abs = Math.abs(value);
    if (symbol === "₹" && abs >= 10_000_000) return `₹${trim(value / 10_000_000)}Cr`;
    if (symbol === "₹" && abs >= 100_000) return `₹${trim(value / 100_000)}L`;
    if (abs >= 1_000_000) return `${symbol}${trim(value / 1_000_000)}M`;
    if (abs >= 1_000) return `${symbol}${abs >= 10_000 ? (value / 1_000).toFixed(0) : trim(value / 1_000)}k`;
    return `${symbol}${value.toFixed(0)}`;
  };
}

function Panel({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-2 rounded-xl bg-black/[0.02] p-3 dark:bg-white/[0.03]", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold">{title}</p>
        {action}
      </div>
      {children}
    </div>
  );
}

export function TransferAnalytics({ transfers, today }: { transfers: Remittance[]; today: string }) {
  const [period, setPeriod] = useState<RemittancePeriod>("6-months");
  const [currency, setCurrency] = useState<RemittanceCountry>("IN");
  const [usdType, setUsdType] = useChartType("transfers-usd-monthly", "bar");

  const { within, totals, buckets, reasons, label } = useMemo(() => {
    const within = inPeriod(transfers, period, today);
    return {
      within,
      totals: remittanceTotals(within),
      buckets: monthlyBuckets(transfers, period, today),
      reasons: reasonBreakdown(within),
      label: periodLabel(period, today, transfers),
    };
  }, [transfers, period, today]);

  const meta = COUNTRY_META[currency];

  return (
    <GlassCard className="!p-3 sm:!p-4 space-y-3" flat>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-semibold">Analytics</p>
          <p className="text-[10px] text-muted">{label}</p>
        </div>
        <div className="glass flex w-full gap-0.5 rounded-lg p-0.5 sm:w-auto" role="group" aria-label="Period">
          {PERIOD_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={period === option.value}
              onClick={() => setPeriod(option.value)}
              className={cn(
                "flex-1 whitespace-nowrap rounded-md px-1.5 py-1 text-[11px] font-semibold sm:flex-none sm:px-2.5",
                period === option.value ? "bg-accent text-white" : "text-muted hover:text-foreground"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {within.length === 0 ? (
        <div className="rounded-xl border border-dashed border-black/10 px-4 py-8 text-center dark:border-white/15">
          <p className="text-[13px] font-medium">
            {transfers.length === 0 ? "Nothing to chart yet" : `Nothing sent in ${label}`}
          </p>
          {transfers.length > 0 && period !== "all" ? (
            <button type="button" onClick={() => setPeriod("all")} className="hit mt-2 text-[12px] font-semibold text-accent">
              Show all time
            </button>
          ) : (
            <p className="mt-1 text-[11px] text-muted">Charts fill in as you record transfers.</p>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "Sent", value: formatCurrency(totals.usdSent), sub: `${totals.count} ${totals.count === 1 ? "transfer" : "transfers"}` },
              { label: "Fees", value: formatCurrency(totals.fees), sub: "On top of sent" },
              ...COUNTRIES.map((code) => ({
                label: `${COUNTRY_META[code].symbol} received`,
                value: formatForeign(totals.byCountry[code].received, COUNTRY_META[code].currency),
                sub:
                  totals.byCountry[code].rate !== null
                    ? `${formatRate(totals.byCountry[code].rate!)} per $1`
                    : "None this period",
              })),
            ].map((tile) => (
              <div key={tile.label} className="rounded-xl bg-black/[0.03] px-3 py-2 dark:bg-white/[0.04]">
                <p className="text-[10px] uppercase tracking-wide text-muted">{tile.label}</p>
                <p className="truncate text-[15px] font-semibold tabular-nums">{tile.value}</p>
                <p className="text-[10px] text-muted tabular-nums">{tile.sub}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <Panel title="Sent each month (USD)" action={<ChartTypePicker value={usdType} onChange={setUsdType} />} className="lg:col-span-2">
              <FlexChart
                type={usdType}
                data={buckets.map((bucket) => ({ label: bucket.label, value: bucket.usdSent }))}
                color="var(--accent)"
                height={200}
              />
            </Panel>

            <Panel
              title={`Received each month (${meta.currency})`}
              action={
                <div className="glass flex gap-0.5 rounded-lg p-0.5" role="group" aria-label="Currency">
                  {COUNTRIES.map((code) => (
                    <button
                      key={code}
                      type="button"
                      aria-pressed={currency === code}
                      onClick={() => setCurrency(code)}
                      className={cn(
                        "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold",
                        currency === code ? "text-white" : "text-muted hover:text-foreground"
                      )}
                      style={currency === code ? { background: COUNTRY_META[code].color } : undefined}
                    >
                      <CountryFlag country={code} className="h-2.5 w-[15px]" />
                      {COUNTRY_META[code].symbol} {COUNTRY_META[code].currency}
                    </button>
                  ))}
                </div>
              }
            >
              <FlexChart
                type="bar"
                data={buckets.map((bucket) => ({ label: bucket.label, value: bucket.received[currency] }))}
                color={meta.color}
                format={(value) => formatForeign(value, meta.currency)}
                formatShort={compact(meta.symbol)}
                height={190}
                emptyMessage={`Nothing sent to ${meta.name} yet.`}
              />
            </Panel>

            <Panel title="By country (USD sent)">
              <FlexChart
                type="donut"
                data={COUNTRIES.filter((code) => totals.byCountry[code].count > 0).map((code) => ({
                  label: COUNTRY_META[code].name,
                  value: totals.byCountry[code].usdSent,
                  color: COUNTRY_META[code].color,
                }))}
                height={170}
              />
              <div className="space-y-1">
                {COUNTRIES.map((code) => {
                  const row = totals.byCountry[code];
                  return (
                    <div key={code} className="flex items-center justify-between gap-2 text-[12px]">
                      <span className="flex items-center gap-1.5">
                        <CountryFlag country={code} className="h-3 w-[18px]" />
                        {COUNTRY_META[code].name}
                        <span className="text-[10px] text-muted">· {row.count}</span>
                      </span>
                      <span className="text-right tabular-nums">
                        <span className="font-semibold">{formatCurrency(row.usdSent)}</span>
                        <span className="text-muted"> → {formatForeign(row.received, COUNTRY_META[code].currency)}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </Panel>

            <Panel title="By reason (USD sent)" className="lg:col-span-2">
              <FlexChart
                type="bar"
                data={reasons.map((row) => ({ label: REASON_SHORT[row.reason], value: row.usdSent }))}
                color="var(--accent-cyan)"
                height={190}
              />
              <p className="text-[10px] text-muted">
                {reasons.map((row) => `${REASON_LABELS[row.reason]}: ${row.count}`).join(" · ")}
              </p>
            </Panel>
          </div>
        </>
      )}
    </GlassCard>
  );
}
