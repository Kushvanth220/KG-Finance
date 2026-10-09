import { NextResponse } from "next/server";
import type { FxRates } from "@/lib/fx";

export const dynamic = "force-dynamic";

/**
 * The market rate from US dollars to rupees and pesos.
 *
 * Asked of free, keyless sources in turn, so one being down is not the page
 * being down. All of them publish once a day — this is the latest published
 * market rate, not a tick-by-tick quote — and the time each one says it
 * published is passed along so the page can say so honestly. What a service
 * like Remitly or Wise actually gives will differ; that is why a transfer
 * records its own rate.
 *
 * The answer is kept for ten minutes, so the page's polling and two phones
 * looking at once cost one upstream call. A manual refresh can skip that,
 * but not more than once a minute.
 */

const TTL_MS = 10 * 60_000;
const MIN_REFRESH_MS = 60_000;
const TIMEOUT_MS = 6_000;

interface Reading {
  INR: number;
  PHP: number;
  publishedAt: string;
  publishedDateOnly: boolean;
}

interface Provider {
  name: string;
  url: string;
  read: () => Promise<Reading>;
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

/** A rate that is not a plausible number of rupees or pesos per dollar is a broken answer, not a rate. */
function plausible(INR: unknown, PHP: unknown): { INR: number; PHP: number } {
  const ok = (value: unknown, min: number, max: number): value is number =>
    typeof value === "number" && Number.isFinite(value) && value > min && value < max;
  if (!ok(INR, 20, 500) || !ok(PHP, 10, 300)) throw new Error("implausible rates");
  return { INR, PHP };
}

const PROVIDERS: Provider[] = [
  {
    name: "ExchangeRate-API",
    url: "https://www.exchangerate-api.com",
    read: async () => {
      const body = (await getJson("https://open.er-api.com/v6/latest/USD")) as {
        result?: string;
        time_last_update_unix?: number;
        rates?: Record<string, number>;
      };
      if (body.result !== "success" || !body.rates) throw new Error("no rates");
      return {
        ...plausible(body.rates.INR, body.rates.PHP),
        publishedAt: new Date((body.time_last_update_unix ?? Date.now() / 1000) * 1000).toISOString(),
        publishedDateOnly: false,
      };
    },
  },
  {
    name: "Frankfurter (European Central Bank)",
    url: "https://frankfurter.dev",
    read: async () => {
      const body = (await getJson("https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR,PHP")) as {
        date?: string;
        rates?: Record<string, number>;
      };
      if (!body.rates || !body.date) throw new Error("no rates");
      return { ...plausible(body.rates.INR, body.rates.PHP), publishedAt: body.date, publishedDateOnly: true };
    },
  },
  {
    name: "Exchange API (jsDelivr)",
    url: "https://github.com/fawazahmed0/exchange-api",
    read: async () => {
      const body = (await getJson(
        "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.min.json"
      )) as { date?: string; usd?: Record<string, number> };
      if (!body.usd || !body.date) throw new Error("no rates");
      return { ...plausible(body.usd.inr, body.usd.php), publishedAt: body.date, publishedDateOnly: true };
    },
  },
];

let cached: { body: FxRates; at: number } | null = null;

export async function GET(request: Request) {
  const now = Date.now();
  const refresh = new URL(request.url).searchParams.get("refresh") === "1";
  const age = cached ? now - cached.at : Infinity;

  if (cached && (age < (refresh ? MIN_REFRESH_MS : TTL_MS))) {
    return NextResponse.json(cached.body, { headers: { "Cache-Control": "no-store" } });
  }

  const failures: string[] = [];
  for (const provider of PROVIDERS) {
    try {
      const reading = await provider.read();
      const body: FxRates = {
        ok: true,
        base: "USD",
        rates: { INR: reading.INR, PHP: reading.PHP },
        publishedAt: reading.publishedAt,
        publishedDateOnly: reading.publishedDateOnly,
        source: { name: provider.name, url: provider.url },
        checkedAt: new Date(now).toISOString(),
      };
      cached = { body, at: now };
      return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      failures.push(`${provider.name}: ${error instanceof Error ? error.message : "failed"}`);
    }
  }

  const error = "Couldn't reach any exchange-rate service.";
  if (cached) {
    // Old rates, said to be old, beat no rates.
    return NextResponse.json(
      { ...cached.body, stale: true, error } satisfies FxRates,
      { headers: { "Cache-Control": "no-store" } }
    );
  }
  return NextResponse.json({ ok: false, error, details: failures }, { status: 503, headers: { "Cache-Control": "no-store" } });
}
