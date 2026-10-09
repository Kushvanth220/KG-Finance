import { APP_TIME_ZONE } from "@/lib/zoned-date";
import type { RemittanceCountry } from "@/types";

/** What /api/fx answers: the latest published market rate from US dollars. */
export interface FxRates {
  ok: true;
  base: "USD";
  rates: { INR: number; PHP: number };
  /** When the source published these rates (ISO), or the day it did when that is all it says. */
  publishedAt: string;
  publishedDateOnly: boolean;
  source: { name: string; url: string };
  /** When the server last asked a source (ISO). */
  checkedAt: string;
  /** Every source failed and these are the last good rates. */
  stale?: boolean;
  error?: string;
}

export function marketRateFor(rates: FxRates | null, country: RemittanceCountry): number | null {
  if (!rates) return null;
  return country === "IN" ? rates.rates.INR : rates.rates.PHP;
}

const dateTime = new Intl.DateTimeFormat("en-US", {
  timeZone: APP_TIME_ZONE,
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const clock = new Intl.DateTimeFormat("en-US", { timeZone: APP_TIME_ZONE, hour: "numeric", minute: "2-digit" });

/** "Oct 7, 7:02 PM", or "Oct 8" when the source gives only a day. */
export function publishedLabel(rates: FxRates): string {
  if (rates.publishedDateOnly) {
    const [year, month, day] = rates.publishedAt.split("-").map(Number);
    return new Date(year!, (month ?? 1) - 1, day ?? 1).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return dateTime.format(new Date(rates.publishedAt));
}

/** "10:42 AM", in the app's time zone. */
export function checkedLabel(rates: FxRates): string {
  return clock.format(new Date(rates.checkedAt));
}
