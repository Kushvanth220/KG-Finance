import { formatDate, parseAppDateTime } from "@/lib/formatters";
import { roundMoney } from "@/lib/money";
import type {
  Person,
  Remittance,
  RemittanceCountry,
  RemittanceCurrency,
  RemittanceMethod,
  RemittanceReason,
} from "@/types";

/**
 * Money sent abroad: what each transfer was, and what they add up to.
 *
 * Three rules hold everywhere in here, because breaking any of them produces
 * a number that looks right and is not:
 *
 *  - Dollars, rupees and pesos are never added to each other. Each total is
 *    one currency, and the two foreign ones stay apart even when the screen
 *    shows them side by side.
 *  - The fee is its own figure. "Sent" is what was converted; the fee was
 *    paid on top, so it is summed separately and never folded into either.
 *  - A rate over many transfers is recomputed from the totals (rupees in ÷
 *    dollars out), never averaged — averaging 84 and 86 says nothing about a
 *    $50 transfer and a $2,000 one.
 *
 * Every function is pure: what a transfer was is fixed when it is saved, and
 * no live rate is ever an input here.
 */

export const COUNTRIES: readonly RemittanceCountry[] = ["IN", "PH"];

export const COUNTRY_META: Record<
  RemittanceCountry,
  { name: string; currency: RemittanceCurrency; symbol: string; color: string }
> = {
  IN: { name: "India", currency: "INR", symbol: "₹", color: "var(--country-in)" },
  PH: { name: "Philippines", currency: "PHP", symbol: "₱", color: "var(--country-ph)" },
};

export const METHODS: readonly RemittanceMethod[] = ["remitly", "wise", "western_union", "bank_transfer", "other"];

export const METHOD_LABELS: Record<RemittanceMethod, string> = {
  remitly: "Remitly",
  wise: "Wise",
  western_union: "Western Union",
  bank_transfer: "Bank transfer",
  other: "Other",
};

export const REASONS: readonly RemittanceReason[] = [
  "family",
  "household",
  "medical",
  "education",
  "savings",
  "gift",
  "other",
];

export const REASON_LABELS: Record<RemittanceReason, string> = {
  family: "Money sent to family",
  household: "Monthly household expenses",
  medical: "Medical expenses",
  education: "Education expenses",
  savings: "Personal savings",
  gift: "Gift",
  other: "Other personal expenses",
};

/** For chart axes, where the full reason does not fit. */
export const REASON_SHORT: Record<RemittanceReason, string> = {
  family: "Family",
  household: "Household",
  medical: "Medical",
  education: "Education",
  savings: "Savings",
  gift: "Gift",
  other: "Other",
};

export function currencyOf(country: RemittanceCountry): RemittanceCurrency {
  return COUNTRY_META[country].currency;
}

export function methodLabel(transfer: Pick<Remittance, "method" | "methodName">): string {
  const named = transfer.method === "other" ? transfer.methodName?.trim() : undefined;
  return named || METHOD_LABELS[transfer.method];
}

/** What the table shows as the note: the sender's words, or the reason when there are none. */
export function noteText(transfer: Pick<Remittance, "note" | "reason">): string {
  return transfer.note?.trim() || REASON_LABELS[transfer.reason];
}

/* ------------------------------------------------------------------ */
/* Rates and amounts                                                    */
/* ------------------------------------------------------------------ */

/** Four decimals: precise enough for rupees per dollar, without false precision. */
export function roundRate(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/** What arrives for `usd` at `rate`, to the paisa or centavo. */
export function receivedAt(usd: number, rate: number): number {
  return roundMoney(usd * rate);
}

/** The rate a transfer actually got: what arrived for each dollar converted. */
export function rateFrom(usd: number, received: number): number {
  return usd > 0 ? roundRate(received / usd) : 0;
}

/* ------------------------------------------------------------------ */
/* Formatting                                                           */
/* ------------------------------------------------------------------ */

const LOCALE: Record<RemittanceCurrency, string> = { INR: "en-IN", PHP: "en-PH" };
const numberFormats = new Map<string, Intl.NumberFormat>();

/**
 * Rupees and pesos in their own symbol and grouping — ₹1,00,000 and
 * ₱11,200 — with cents shown by the same rule as formatCurrency: whole
 * amounts stay compact, anything else shows both digits.
 */
export function formatForeign(amount: number, currency: RemittanceCurrency): string {
  const hasCents = Math.round(Math.abs(amount) * 100) % 100 !== 0;
  const key = `${currency}:${hasCents}`;
  let format = numberFormats.get(key);
  if (!format) {
    format = new Intl.NumberFormat(LOCALE[currency], {
      style: "currency",
      currency,
      minimumFractionDigits: hasCents ? 2 : 0,
      maximumFractionDigits: 2,
    });
    numberFormats.set(key, format);
  }
  return format.format(amount);
}

/** A received amount in its own currency. */
export function formatReceived(transfer: Pick<Remittance, "country" | "receivedAmount">): string {
  return formatForeign(transfer.receivedAmount, currencyOf(transfer.country));
}

/** 84 → "84.00", 96.8303 → "96.8303". */
export function formatRate(rate: number): string {
  return rate.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

/** "Oct 8, 2026" — the date as the table shows it. */
export function formatTransferDate(date: string): string {
  return parseAppDateTime(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/* ------------------------------------------------------------------ */
/* Totals                                                               */
/* ------------------------------------------------------------------ */

export interface CountryTotals {
  count: number;
  usdSent: number;
  fees: number;
  /** In this country's currency only. */
  received: number;
  /** received ÷ usdSent, from the totals; null when nothing was sent. */
  rate: number | null;
}

export interface RemittanceTotals {
  count: number;
  /** Dollars converted — fees not included. */
  usdSent: number;
  /** Dollars paid in fees, on top of usdSent. */
  fees: number;
  byCountry: Record<RemittanceCountry, CountryTotals>;
}

export function remittanceTotals(list: readonly Remittance[]): RemittanceTotals {
  const raw: Record<RemittanceCountry, { count: number; usd: number; fees: number; received: number }> = {
    IN: { count: 0, usd: 0, fees: 0, received: 0 },
    PH: { count: 0, usd: 0, fees: 0, received: 0 },
  };
  for (const transfer of list) {
    const bucket = raw[transfer.country];
    bucket.count += 1;
    bucket.usd += transfer.usdAmount;
    bucket.fees += transfer.feeUsd ?? 0;
    bucket.received += transfer.receivedAmount;
  }

  // Summed raw, rounded once at the end: rounding per row drifts.
  const country = (code: RemittanceCountry): CountryTotals => {
    const { count, usd, fees, received } = raw[code];
    const usdSent = roundMoney(usd);
    return {
      count,
      usdSent,
      fees: roundMoney(fees),
      received: roundMoney(received),
      rate: usd > 0 ? roundRate(received / usd) : null,
    };
  };
  const byCountry = { IN: country("IN"), PH: country("PH") };

  return {
    count: raw.IN.count + raw.PH.count,
    usdSent: roundMoney(raw.IN.usd + raw.PH.usd),
    fees: roundMoney(raw.IN.fees + raw.PH.fees),
    byCountry,
  };
}

/* ------------------------------------------------------------------ */
/* Order, search and filters                                            */
/* ------------------------------------------------------------------ */

/** Newest first; two transfers on one day, the one recorded later first. */
export function sortNewestFirst(list: readonly Remittance[]): Remittance[] {
  return [...list].sort(
    (a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? "").localeCompare(a.createdAt ?? "")
  );
}

export interface RemittanceFilter {
  person: Person | "overall";
  country: RemittanceCountry | "all";
  /** Inclusive yyyy-MM-dd bounds. */
  from?: string;
  to?: string;
  query?: string;
}

/** Everything a search might be typed as: the note, the reason, the service, the place, the date in any of its shapes. */
function searchText(transfer: Remittance): string {
  const parsed = parseAppDateTime(transfer.date);
  return [
    transfer.note ?? "",
    REASON_LABELS[transfer.reason],
    methodLabel(transfer),
    COUNTRY_META[transfer.country].name,
    transfer.date,
    formatDate(transfer.date),
    formatTransferDate(transfer.date),
    parsed.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
  ]
    .join(" · ")
    .toLowerCase();
}

export function filterRemittances(list: readonly Remittance[], filter: RemittanceFilter): Remittance[] {
  const words = (filter.query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  return sortNewestFirst(
    list.filter((transfer) => {
      if (filter.person !== "overall" && transfer.person !== filter.person) return false;
      if (filter.country !== "all" && transfer.country !== filter.country) return false;
      if (filter.from && transfer.date < filter.from) return false;
      if (filter.to && transfer.date > filter.to) return false;
      if (words.length === 0) return true;
      const haystack = searchText(transfer);
      return words.every((word) => haystack.includes(word));
    })
  );
}

/* ------------------------------------------------------------------ */
/* Periods and months                                                   */
/* ------------------------------------------------------------------ */

export type RemittancePeriod = "this-month" | "3-months" | "6-months" | "this-year" | "all";

export const PERIOD_OPTIONS: { value: RemittancePeriod; label: string }[] = [
  { value: "this-month", label: "This month" },
  { value: "3-months", label: "3 months" },
  { value: "6-months", label: "6 months" },
  { value: "this-year", label: "This year" },
  { value: "all", label: "All time" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** yyyy-MM, counted as one number so months can be stepped across years. */
function monthIndex(date: string): number {
  return Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
}

function monthKeyOf(index: number): string {
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/**
 * The first month a period covers, as a month index; null for all time.
 * "3 months" is this month and the two before it, so it always includes now.
 */
function periodStartMonth(period: RemittancePeriod, today: string): number | null {
  const now = monthIndex(today);
  switch (period) {
    case "this-month":
      return now;
    case "3-months":
      return now - 2;
    case "6-months":
      return now - 5;
    case "this-year":
      return Number(today.slice(0, 4)) * 12;
    case "all":
      return null;
  }
}

/** Transfers in the period: whole calendar months, up to and including this one. */
export function inPeriod(list: readonly Remittance[], period: RemittancePeriod, today: string): Remittance[] {
  const start = periodStartMonth(period, today);
  const end = monthIndex(today);
  return list.filter((transfer) => {
    const month = monthIndex(transfer.date);
    return (start === null || month >= start) && month <= end;
  });
}

/** "Aug – Oct 2026", "October 2026", "All time". */
export function periodLabel(period: RemittancePeriod, today: string, list: readonly Remittance[] = []): string {
  const end = monthIndex(today);
  let start = periodStartMonth(period, today);
  if (start === null) {
    if (list.length === 0) return "All time";
    start = Math.min(...list.map((transfer) => monthIndex(transfer.date)));
  }
  const name = (index: number) => MONTHS[index % 12]!;
  const year = (index: number) => Math.floor(index / 12);
  if (start === end) return `${name(end)} ${year(end)}`;
  return year(start) === year(end)
    ? `${name(start)} – ${name(end)} ${year(end)}`
    : `${name(start)} ${year(start)} – ${name(end)} ${year(end)}`;
}

export interface MonthBucket {
  /** yyyy-MM */
  key: string;
  label: string;
  count: number;
  usdSent: number;
  fees: number;
  /** Each in its own country's currency — never summed together. */
  received: Record<RemittanceCountry, number>;
}

/**
 * One bucket per calendar month in the period, empty months included, so a
 * quiet month shows as a gap rather than vanishing from the axis. All time
 * starts at the first transfer.
 */
export function monthlyBuckets(list: readonly Remittance[], period: RemittancePeriod, today: string): MonthBucket[] {
  const end = monthIndex(today);
  const within = inPeriod(list, period, today);
  let start = periodStartMonth(period, today);
  if (start === null) start = within.length ? Math.min(...within.map((t) => monthIndex(t.date))) : end;

  const spansYears = Math.floor(start / 12) !== Math.floor(end / 12);
  const raw = new Map<number, { count: number; usd: number; fees: number; IN: number; PH: number }>();
  for (let index = start; index <= end; index++) raw.set(index, { count: 0, usd: 0, fees: 0, IN: 0, PH: 0 });

  for (const transfer of within) {
    const bucket = raw.get(monthIndex(transfer.date));
    if (!bucket) continue;
    bucket.count += 1;
    bucket.usd += transfer.usdAmount;
    bucket.fees += transfer.feeUsd ?? 0;
    bucket[transfer.country] += transfer.receivedAmount;
  }

  return [...raw.entries()].map(([index, bucket]) => ({
    key: monthKeyOf(index),
    label: spansYears ? `${MONTHS[index % 12]} ’${String(Math.floor(index / 12)).slice(2)}` : MONTHS[index % 12]!,
    count: bucket.count,
    usdSent: roundMoney(bucket.usd),
    fees: roundMoney(bucket.fees),
    received: { IN: roundMoney(bucket.IN), PH: roundMoney(bucket.PH) },
  }));
}

/** Dollars sent per reason, in the fixed reason order; reasons never used are left out. */
export function reasonBreakdown(list: readonly Remittance[]): { reason: RemittanceReason; usdSent: number; count: number }[] {
  return REASONS.map((reason) => {
    const matching = list.filter((transfer) => transfer.reason === reason);
    return {
      reason,
      count: matching.length,
      usdSent: roundMoney(matching.reduce((sum, transfer) => sum + transfer.usdAmount, 0)),
    };
  }).filter((row) => row.count > 0);
}

/* ------------------------------------------------------------------ */
/* Drafts                                                               */
/* ------------------------------------------------------------------ */

export type RemittanceDraft = Omit<Remittance, "id" | "createdAt" | "updatedAt">;

/** The first thing stopping a draft from being saved, said plainly; null when it can be. */
export function draftProblem(draft: Partial<RemittanceDraft>): string | null {
  const positive = (value: number | undefined) => value !== undefined && Number.isFinite(value) && value > 0;
  if (!draft.date || !/^\d{4}-\d{2}-\d{2}$/.test(draft.date)) return "Pick the date it was sent";
  if (!draft.country) return "Pick where it went";
  if (!positive(draft.usdAmount)) return "Enter the dollars sent";
  if (!positive(draft.receivedAmount)) return `Enter the ${COUNTRY_META[draft.country].currency} that arrived`;
  if (!positive(draft.rate)) return "Enter the exchange rate";
  if (draft.feeUsd !== undefined && (!Number.isFinite(draft.feeUsd) || draft.feeUsd < 0)) return "The fee can't be negative";
  if (!draft.method) return "Pick how it was sent";
  if (!draft.reason) return "Pick a reason";
  return null;
}

/** Trim and round a valid draft into the shape that is stored. */
export function cleanDraft(draft: RemittanceDraft): RemittanceDraft {
  const fee = draft.feeUsd !== undefined && draft.feeUsd > 0 ? roundMoney(draft.feeUsd) : undefined;
  return {
    ...draft,
    usdAmount: roundMoney(draft.usdAmount),
    receivedAmount: roundMoney(draft.receivedAmount),
    rate: roundRate(draft.rate),
    marketRate: draft.marketRate !== undefined ? roundRate(draft.marketRate) : undefined,
    feeUsd: fee,
    methodName: draft.method === "other" ? draft.methodName?.trim() || undefined : undefined,
    note: draft.note?.trim() || undefined,
  };
}
