"use client";

import { useMemo, type ReactNode } from "react";
import { DollarSign, Send } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { AnimatedMoney } from "@/components/ui/animated-number";
import { CountryFlag } from "@/components/transfers/country-flag";
import { formatCurrency } from "@/lib/formatters";
import {
  COUNTRY_META,
  formatForeign,
  formatRate,
  formatTransferDate,
  inPeriod,
  remittanceTotals,
  sortNewestFirst,
} from "@/lib/remittances";
import type { Remittance, RemittanceCountry } from "@/types";

/**
 * The four numbers the page exists for, all time: dollars out, rupees in,
 * pesos in, and how many transfers.
 *
 * Rupees and pesos get a card each and are never shown as one figure — there
 * is no honest sum of the two. The fee sits under the dollars as its own
 * line, so "sent" stays what was converted. The rate under each currency is
 * worked out from that country's totals: what all those dollars actually
 * bought, not an average of rates.
 */

const asCount = (value: number) => Math.round(value).toLocaleString("en-US");

function SummaryCard({
  icon,
  tint,
  label,
  children,
  lines,
}: {
  icon: ReactNode;
  tint: string;
  label: string;
  children: ReactNode;
  lines: ReactNode[];
}) {
  return (
    <GlassCard className="!p-3 sm:!p-4 h-full">
      <div className="flex items-center gap-2">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `color-mix(in srgb, ${tint} 16%, transparent)`, color: tint }}
        >
          {icon}
        </span>
        <p className="min-w-0 text-[10px] font-semibold uppercase leading-tight tracking-wide text-muted">{label}</p>
      </div>
      <div className="mt-3 text-[22px] font-semibold leading-none tabular-nums sm:text-[28px]">{children}</div>
      <div className="mt-2 space-y-0.5">
        {lines.map((line, index) => (
          <p key={index} className="text-[10px] leading-snug text-muted tabular-nums sm:text-[11px]">
            {line}
          </p>
        ))}
      </div>
    </GlassCard>
  );
}

function CurrencyCard({ country, totals }: { country: RemittanceCountry; totals: ReturnType<typeof remittanceTotals> }) {
  const meta = COUNTRY_META[country];
  const mine = totals.byCountry[country];
  return (
    <SummaryCard
      icon={<CountryFlag country={country} className="h-3.5 w-5" />}
      tint={meta.color}
      label={`${meta.currency} received`}
      lines={
        mine.count === 0
          ? [`Nothing sent to ${meta.name} yet`]
          : [
              `${mine.count} ${mine.count === 1 ? "transfer" : "transfers"} · ${formatCurrency(mine.usdSent)} sent`,
              mine.rate !== null ? `${meta.symbol}${formatRate(mine.rate)} per $1 overall` : null,
            ].filter(Boolean)
      }
    >
      <AnimatedMoney value={mine.received} format={(value) => formatForeign(value, meta.currency)} />
    </SummaryCard>
  );
}

export function TransferSummary({ transfers, today }: { transfers: Remittance[]; today: string }) {
  const { totals, month, latest } = useMemo(
    () => ({
      totals: remittanceTotals(transfers),
      month: remittanceTotals(inPeriod(transfers, "this-month", today)),
      latest: sortNewestFirst(transfers)[0],
    }),
    [transfers, today]
  );

  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-3">
      <SummaryCard
        icon={<DollarSign className="h-4 w-4" />}
        tint="var(--accent)"
        label="USD sent"
        lines={[
          totals.fees > 0 ? `+ ${formatCurrency(totals.fees)} in fees, counted apart` : "No fees recorded",
          `${formatCurrency(month.usdSent)} this month`,
        ]}
      >
        <AnimatedMoney value={totals.usdSent} />
      </SummaryCard>

      <CurrencyCard country="IN" totals={totals} />
      <CurrencyCard country="PH" totals={totals} />

      <SummaryCard
        icon={<Send className="h-4 w-4" />}
        tint="var(--accent-cyan)"
        label="Transfers"
        lines={[
          `${month.count} this month`,
          latest ? `Last on ${formatTransferDate(latest.date)}` : "None recorded yet",
        ]}
      >
        <AnimatedMoney value={totals.count} format={asCount} />
      </SummaryCard>
    </div>
  );
}
