"use client";

import { useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { CountryFlag } from "@/components/transfers/country-flag";
import { useFxRates } from "@/hooks/use-fx-rates";
import { evaluateAmount } from "@/lib/amount-expression";
import { formatCurrency } from "@/lib/formatters";
import { checkedLabel, marketRateFor, publishedLabel } from "@/lib/fx";
import { COUNTRIES, COUNTRY_META, formatForeign, formatRate, receivedAt } from "@/lib/remittances";
import { cn } from "@/lib/utils";

/**
 * Today's market rate, and what a dollar amount comes to at it.
 *
 * It says plainly what the number is: the latest PUBLISHED market rate,
 * when it was published and by whom. The services you send with quote their
 * own rate, usually a little under this, so the converter is an estimate
 * and the transfer form asks for what actually arrived.
 */
export function RatePanel() {
  const { rates, status, error, refresh } = useFxRates();
  const [usdText, setUsdText] = useState("100");
  const usd = evaluateAmount(usdText) ?? 0;
  const loading = status === "loading";

  return (
    <GlassCard className="!p-3 sm:!p-4 space-y-3" flat>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold">Exchange rates</p>
          <p className="text-[10px] text-muted">Market rate from US dollars</p>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          disabled={loading}
          className="tap-icon focus-ring inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-accent disabled:opacity-60"
          aria-label="Refresh exchange rates"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          {loading ? "Checking" : "Refresh"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {COUNTRIES.map((country) => {
          const meta = COUNTRY_META[country];
          const rate = marketRateFor(rates, country);
          return (
            <div key={country} className="rounded-xl bg-black/[0.03] px-3 py-2 dark:bg-white/[0.04]">
              <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                <CountryFlag country={country} className="h-3 w-[18px]" /> USD → {meta.currency}
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {rate !== null ? `${meta.symbol}${formatRate(rate)}` : "—"}
              </p>
              <p className="text-[10px] text-muted">for $1</p>
            </div>
          );
        })}
      </div>

      <div className="space-y-2">
        <label htmlFor="fx-convert" className="text-[10px] font-semibold uppercase tracking-wide text-muted">
          Convert
        </label>
        <div className="glass flex items-center gap-2 rounded-2xl px-3 py-2">
          <span className="text-sm font-semibold text-muted">$</span>
          <input
            id="fx-convert"
            inputMode="decimal"
            value={usdText}
            onChange={(event) => setUsdText(event.target.value)}
            className="min-w-0 flex-1 bg-transparent text-base font-semibold tabular-nums outline-none"
            aria-label="US dollars to convert"
          />
          <span className="text-[11px] text-muted">USD</span>
        </div>
        <div className="space-y-1">
          {COUNTRIES.map((country) => {
            const meta = COUNTRY_META[country];
            const rate = marketRateFor(rates, country);
            return (
              <div key={country} className="flex items-center justify-between gap-2 text-[13px]">
                <span className="flex items-center gap-1.5 text-muted">
                  <CountryFlag country={country} className="h-3 w-[18px]" /> {meta.name}
                </span>
                <span className="font-semibold tabular-nums">
                  {rate !== null && usd > 0 ? `≈ ${formatForeign(receivedAt(usd, rate), meta.currency)}` : "—"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {status === "error" ? (
        <p className="flex items-start gap-1.5 rounded-lg bg-caution/10 px-2 py-1.5 text-[11px] text-caution">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            {error ?? "Couldn't refresh the rates."}{" "}
            {rates
              ? `Showing the rate published ${publishedLabel(rates)}.`
              : "You can still type the rate by hand when you add a transfer."}
          </span>
        </p>
      ) : null}

      {rates ? (
        <p className="text-[10px] leading-relaxed text-muted">
          Published {publishedLabel(rates)} by{" "}
          <a href={rates.source.url} target="_blank" rel="noreferrer" className="underline decoration-dotted underline-offset-2">
            {rates.source.name}
          </a>{" "}
          · checked {checkedLabel(rates)}. Sources update once a day; your service&apos;s rate will differ
          {usd > 0 ? ` — ${formatCurrency(usd)} is an estimate` : ""}.
        </p>
      ) : status !== "error" ? (
        <p className="text-[10px] text-muted">Getting today&apos;s rates…</p>
      ) : null}
    </GlassCard>
  );
}
