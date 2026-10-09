"use client";

import { useState } from "react";
import { GlassModal } from "@/components/ui/glass-modal";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassInput } from "@/components/ui/glass-input";
import { PersonTabs } from "@/components/ui/person-tabs";
import { CountryFlag } from "@/components/transfers/country-flag";
import { useFxRates } from "@/hooks/use-fx-rates";
import { evaluateAmount } from "@/lib/amount-expression";
import { formatCurrency } from "@/lib/formatters";
import { marketRateFor } from "@/lib/fx";
import { roundMoney } from "@/lib/money";
import {
  COUNTRIES,
  COUNTRY_META,
  draftProblem,
  formatForeign,
  formatRate,
  METHOD_LABELS,
  METHODS,
  rateFrom,
  roundRate,
  REASON_LABELS,
  REASONS,
  receivedAt,
  type RemittanceDraft,
} from "@/lib/remittances";
import { zonedToday } from "@/lib/zoned-date";
import type { Person, Remittance, RemittanceCountry, RemittanceMethod, RemittanceReason } from "@/types";
import { cn } from "@/lib/utils";

/**
 * Recording one transfer.
 *
 * The dollars, the rate and what arrived are three boxes, and any two decide
 * the third. Type the dollars and the received amount fills in at today's
 * market rate — an estimate, marked as one. Type what actually arrived and
 * the rate becomes the one you really got; type a rate and the amount
 * follows it. Whichever you typed last is the one that holds.
 *
 * Editing a transfer starts from what was saved and never pulls in today's
 * rate: a past transfer is a fact, and a market move does not change it.
 */

const parse = (text: string | null) => (text === null ? null : evaluateAmount(text));
const plain = (value: number) => (value > 0 ? String(value) : "");

function Choice<T extends string>({
  options,
  value,
  onChange,
  label,
  render,
}: {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  label: string;
  render: (option: T) => string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={option === value}
          onClick={() => onChange(option)}
          className={cn(
            "rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors",
            option === value ? "glass-pill" : "glass text-muted hover:text-foreground"
          )}
        >
          {render(option)}
        </button>
      ))}
    </div>
  );
}

function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="px-1 text-sm font-medium text-muted">
      {children}
    </label>
  );
}

export function TransferEditor({
  open,
  onClose,
  editing,
  defaultPerson,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  /** The transfer being changed; null for a new one. */
  editing: Remittance | null;
  defaultPerson: Person;
  onSave: (draft: RemittanceDraft) => void;
}) {
  const { rates } = useFxRates();

  // An edit opens on what was saved. When the saved amount is exactly what the
  // saved rate gives, the rate was what was typed; otherwise the amount was.
  const startsFromAmount = editing ? receivedAt(editing.usdAmount, editing.rate) !== editing.receivedAmount : false;

  const [person, setPerson] = useState<Person>(editing?.person ?? defaultPerson);
  const [date, setDate] = useState(editing?.date ?? zonedToday());
  const [country, setCountry] = useState<RemittanceCountry>(editing?.country ?? "IN");
  const [usdText, setUsdText] = useState(editing ? plain(editing.usdAmount) : "");
  /** null: follow today's market rate. */
  const [rateText, setRateText] = useState<string | null>(editing && !startsFromAmount ? String(editing.rate) : null);
  /** null: work it out from the rate. */
  const [receivedText, setReceivedText] = useState<string | null>(
    editing && startsFromAmount ? plain(editing.receivedAmount) : null
  );
  const [feeText, setFeeText] = useState(editing?.feeUsd ? plain(editing.feeUsd) : "");
  const [method, setMethod] = useState<RemittanceMethod>(editing?.method ?? "remitly");
  const [methodName, setMethodName] = useState(editing?.methodName ?? "");
  const [reason, setReason] = useState<RemittanceReason>(editing?.reason ?? "family");
  const [note, setNote] = useState(editing?.note ?? "");

  const meta = COUNTRY_META[country];
  // Rounded to what is stored, so the estimate shown is the one that is saved.
  const marketRaw = marketRateFor(rates, country);
  const market = marketRaw === null ? null : roundRate(marketRaw);
  const usd = parse(usdText) ?? 0;
  const fee = feeText.trim() ? parse(feeText) : 0;

  let rate: number;
  let received: number;
  if (receivedText !== null) {
    received = parse(receivedText) ?? 0;
    rate = usd > 0 && received > 0 ? rateFrom(usd, received) : parse(rateText) ?? market ?? 0;
  } else {
    rate = (rateText !== null ? parse(rateText) : market) ?? 0;
    received = usd > 0 && rate > 0 ? receivedAt(usd, rate) : 0;
  }
  const followsMarket = receivedText === null && rateText === null && market !== null;

  const draft: RemittanceDraft = {
    person,
    date,
    country,
    usdAmount: usd,
    receivedAmount: received,
    rate,
    // A past transfer keeps the market rate it was saved against.
    marketRate: editing ? editing.marketRate : market ?? undefined,
    feeUsd: fee === null ? Number.NaN : fee || undefined,
    method,
    methodName,
    reason,
    note,
  };
  const problem = draftProblem(draft);

  const rateShown = receivedText !== null ? (rate > 0 ? formatRate(rate) : rateText ?? "") : rateText ?? (market ? String(market) : "");
  const receivedShown = receivedText ?? (received > 0 ? String(received) : "");
  const versusMarket = draft.marketRate && rate > 0 ? ((rate - draft.marketRate) / draft.marketRate) * 100 : null;

  return (
    <GlassModal open={open} onClose={onClose} title={editing ? "Edit transfer" : "Add transfer"}>
      <div className="space-y-4">
        <PersonTabs value={person} onChange={setPerson} className="!rounded-xl !p-0.5 [&_button]:py-1.5 [&_button]:text-xs" />

        <GlassInput label="Date sent" type="date" value={date} onChange={(event) => setDate(event.target.value)} />

        <div className="flex flex-col gap-1.5">
          <FieldLabel>Sent to</FieldLabel>
          <div className="glass flex gap-0.5 rounded-2xl p-1" role="group" aria-label="Destination country">
            {COUNTRIES.map((code) => (
              <button
                key={code}
                type="button"
                aria-pressed={code === country}
                onClick={() => {
                  setCountry(code);
                  // A new country is a new currency: start again from its market rate.
                  setRateText(null);
                  setReceivedText(null);
                }}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-[12px] font-semibold transition-colors",
                  code === country ? "text-white" : "text-muted hover:text-foreground"
                )}
                style={code === country ? { background: COUNTRY_META[code].color } : undefined}
              >
                <CountryFlag country={code} className="h-3 w-[18px]" />
                {COUNTRY_META[code].name}
              </button>
            ))}
          </div>
        </div>

        <GlassInput
          label="Amount sent (USD)"
          inputMode="decimal"
          placeholder="What was converted, before any fee"
          value={usdText}
          onChange={(event) => setUsdText(event.target.value)}
        />

        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <GlassInput
              label={`Rate (${meta.currency} per $1)`}
              inputMode="decimal"
              placeholder={market ? formatRate(market) : "e.g. 84.00"}
              value={rateShown}
              onChange={(event) => {
                setRateText(event.target.value);
                setReceivedText(null);
              }}
            />
            <p className="px-1 text-[10px] text-muted">
              {followsMarket
                ? "Today's market rate — change it to your receipt's"
                : receivedText !== null
                  ? "Worked out from what arrived"
                  : market
                    ? `Market today: ${formatRate(market)}`
                    : "Type the rate from your receipt"}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <GlassInput
              label={`Received (${meta.symbol})`}
              inputMode="decimal"
              placeholder="What actually arrived"
              value={receivedShown}
              onChange={(event) => setReceivedText(event.target.value === "" ? null : event.target.value)}
            />
            <p className="px-1 text-[10px] text-muted">
              {receivedText !== null ? "As it arrived" : received > 0 ? "Estimated — type the real amount" : " "}
            </p>
          </div>
        </div>

        <GlassInput
          label="Transfer fee (USD, optional)"
          inputMode="decimal"
          placeholder="Charged on top — kept apart from the amount"
          value={feeText}
          onChange={(event) => setFeeText(event.target.value)}
        />

        <div className="flex flex-col gap-1.5">
          <FieldLabel>Sent with</FieldLabel>
          <Choice options={METHODS} value={method} onChange={setMethod} label="Transfer method" render={(m) => METHOD_LABELS[m]} />
          {method === "other" ? (
            <GlassInput placeholder="Which service? e.g. Xoom" value={methodName} onChange={(event) => setMethodName(event.target.value)} />
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <FieldLabel>Reason</FieldLabel>
          <Choice options={REASONS} value={reason} onChange={setReason} label="Reason for the transfer" render={(r) => REASON_LABELS[r]} />
        </div>

        <GlassInput
          label="Note (optional)"
          placeholder="In your own words — e.g. Amma's hospital bill"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />

        {usd > 0 && received > 0 ? (
          <div className="space-y-1 rounded-xl border border-accent/20 bg-accent/5 px-3 py-2 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted">Sent</span>
              <span className="font-semibold tabular-nums">
                {formatCurrency(usd)} → {formatForeign(received, meta.currency)}
              </span>
            </div>
            {fee ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted">Fee, on top</span>
                <span className="tabular-nums">
                  {formatCurrency(fee)} · total cost {formatCurrency(roundMoney(usd + fee))}
                </span>
              </div>
            ) : null}
            {versusMarket !== null && Math.abs(versusMarket) >= 0.05 ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted">Against the market</span>
                <span className={cn("tabular-nums", versusMarket < 0 ? "text-caution" : "text-positive")}>
                  {versusMarket < 0 ? "" : "+"}
                  {versusMarket.toFixed(1)}%
                </span>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-1.5">
          <GlassButton className="w-full" disabled={problem !== null} onClick={() => onSave(draft)}>
            {editing ? "Save changes" : "Save transfer"}
          </GlassButton>
          {problem && (usdText || receivedText) ? <p className="text-center text-[11px] text-muted">{problem}</p> : null}
        </div>
      </div>
    </GlassModal>
  );
}
