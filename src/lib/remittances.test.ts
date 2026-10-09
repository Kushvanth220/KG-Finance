import { describe, expect, it } from "vitest";
import {
  cleanDraft,
  draftProblem,
  filterRemittances,
  formatForeign,
  formatRate,
  inPeriod,
  monthlyBuckets,
  periodLabel,
  rateFrom,
  reasonBreakdown,
  receivedAt,
  remittanceTotals,
  sortNewestFirst,
} from "@/lib/remittances";
import type { Remittance } from "@/types";

let n = 0;
function transfer(overrides: Partial<Remittance>): Remittance {
  n += 1;
  return {
    id: `r${n}`,
    person: "kushvanth",
    date: "2026-10-08",
    country: "IN",
    usdAmount: 500,
    receivedAmount: 42_000,
    rate: 84,
    method: "remitly",
    reason: "family",
    createdAt: `2026-10-08T12:00:0${n % 10}.000Z`,
    ...overrides,
  };
}

describe("rates and amounts", () => {
  it("works out what arrives, to the paisa", () => {
    expect(receivedAt(500, 84)).toBe(42_000);
    expect(receivedAt(123.45, 96.8303)).toBe(11_953.7);
  });

  it("works out the rate a transfer actually got, to four places", () => {
    expect(rateFrom(500, 42_000)).toBe(84);
    expect(rateFrom(300, 25_000)).toBe(83.3333);
    expect(rateFrom(0, 100)).toBe(0);
  });
});

describe("formatting", () => {
  it("writes rupees with Indian grouping and pesos with their own sign", () => {
    expect(formatForeign(100_000, "INR")).toBe("₹1,00,000");
    expect(formatForeign(42_000.5, "INR")).toBe("₹42,000.50");
    expect(formatForeign(11_200, "PHP")).toBe("₱11,200");
  });

  it("shows a rate with at least two decimals", () => {
    expect(formatRate(84)).toBe("84.00");
    expect(formatRate(96.8303)).toBe("96.8303");
  });
});

describe("remittanceTotals", () => {
  const list = [
    transfer({ country: "IN", usdAmount: 500, receivedAmount: 42_000, feeUsd: 3.99 }),
    transfer({ country: "IN", usdAmount: 2000, receivedAmount: 172_000 }),
    transfer({ country: "PH", usdAmount: 200, receivedAmount: 11_200, feeUsd: 1.5, rate: 56 }),
  ];
  const totals = remittanceTotals(list);

  it("counts dollars sent without the fees, and the fees on their own", () => {
    expect(totals.usdSent).toBe(2700);
    expect(totals.fees).toBe(5.49);
    expect(totals.count).toBe(3);
  });

  it("keeps rupees and pesos apart", () => {
    expect(totals.byCountry.IN.received).toBe(214_000);
    expect(totals.byCountry.PH.received).toBe(11_200);
    expect(totals.byCountry.IN.usdSent + totals.byCountry.PH.usdSent).toBe(totals.usdSent);
  });

  it("recomputes a country's rate from its totals rather than averaging rates", () => {
    // Averaging 84 and 86 gives 85; the money says 85.6.
    expect(totals.byCountry.IN.rate).toBe(85.6);
    expect(totals.byCountry.PH.rate).toBe(56);
  });

  it("never reads a transfer's market rate", () => {
    const withMarket = list.map((t) => ({ ...t, marketRate: 999 }));
    expect(remittanceTotals(withMarket)).toEqual(totals);
  });

  it("reports no rate for a country nothing went to", () => {
    expect(remittanceTotals([transfer({ country: "IN" })]).byCountry.PH).toEqual({
      count: 0, usdSent: 0, fees: 0, received: 0, rate: null,
    });
  });

  it("does not drift when many cent amounts are added", () => {
    const tens = Array.from({ length: 10 }, () => transfer({ usdAmount: 0.1, receivedAmount: 0.1 }));
    expect(remittanceTotals(tens).usdSent).toBe(1);
  });
});

describe("filterRemittances", () => {
  const list = [
    transfer({ date: "2026-10-08", country: "IN", note: "Rent for Amma", method: "wise", person: "kushvanth" }),
    transfer({ date: "2026-10-05", country: "PH", reason: "gift", method: "remitly", person: "g" }),
    transfer({ date: "2026-09-12", country: "IN", reason: "medical", method: "western_union" }),
  ];
  const all = { person: "overall" as const, country: "all" as const };

  it("puts the newest first", () => {
    expect(filterRemittances(list, all).map((t) => t.date)).toEqual(["2026-10-08", "2026-10-05", "2026-09-12"]);
  });

  it("filters by country, person and an inclusive date range", () => {
    expect(filterRemittances(list, { ...all, country: "PH" })).toHaveLength(1);
    expect(filterRemittances(list, { ...all, person: "g" })).toHaveLength(1);
    expect(filterRemittances(list, { ...all, from: "2026-10-05", to: "2026-10-08" })).toHaveLength(2);
  });

  it("searches the note, the service, the reason and the date in any shape", () => {
    expect(filterRemittances(list, { ...all, query: "amma" })).toHaveLength(1);
    expect(filterRemittances(list, { ...all, query: "western" })).toHaveLength(1);
    expect(filterRemittances(list, { ...all, query: "medical" })).toHaveLength(1);
    expect(filterRemittances(list, { ...all, query: "oct 5" })).toHaveLength(1);
    expect(filterRemittances(list, { ...all, query: "09/12/2026" })).toHaveLength(1);
    expect(filterRemittances(list, { ...all, query: "september" })).toHaveLength(1);
  });

  it("breaks a same-day tie by the one recorded later", () => {
    const early = transfer({ date: "2026-10-01", createdAt: "2026-10-01T08:00:00.000Z" });
    const late = transfer({ date: "2026-10-01", createdAt: "2026-10-01T20:00:00.000Z" });
    expect(sortNewestFirst([early, late])[0]).toBe(late);
  });
});

describe("periods", () => {
  const today = "2026-10-08";
  const list = [
    transfer({ date: "2026-10-01" }),
    transfer({ date: "2026-08-31" }),
    transfer({ date: "2026-05-01" }),
    transfer({ date: "2026-01-15" }),
    transfer({ date: "2025-12-31" }),
  ];

  it("covers whole calendar months, including this one", () => {
    expect(inPeriod(list, "this-month", today)).toHaveLength(1);
    expect(inPeriod(list, "3-months", today)).toHaveLength(2);
    expect(inPeriod(list, "6-months", today)).toHaveLength(3);
    expect(inPeriod(list, "this-year", today)).toHaveLength(4);
    expect(inPeriod(list, "all", today)).toHaveLength(5);
  });

  it("names the months it covers", () => {
    expect(periodLabel("this-month", today)).toBe("Oct 2026");
    expect(periodLabel("3-months", today)).toBe("Aug – Oct 2026");
    expect(periodLabel("all", today, list)).toBe("Dec 2025 – Oct 2026");
  });

  it("keeps empty months on the axis and the two currencies in their own buckets", () => {
    const buckets = monthlyBuckets(
      [
        transfer({ date: "2026-08-03", country: "IN", usdAmount: 100, receivedAmount: 8_400 }),
        transfer({ date: "2026-10-02", country: "PH", usdAmount: 50, receivedAmount: 2_800 }),
        transfer({ date: "2026-10-04", country: "IN", usdAmount: 10, receivedAmount: 840, feeUsd: 2 }),
      ],
      "3-months",
      today
    );
    expect(buckets.map((b) => b.key)).toEqual(["2026-08", "2026-09", "2026-10"]);
    expect(buckets[1]).toMatchObject({ count: 0, usdSent: 0 });
    expect(buckets[2]).toMatchObject({ usdSent: 60, fees: 2, received: { IN: 840, PH: 2_800 } });
  });

  it("labels months with the year once the range crosses one", () => {
    const buckets = monthlyBuckets([transfer({ date: "2025-12-31" })], "all", today);
    expect(buckets[0]!.label).toBe("Dec ’25");
    expect(buckets).toHaveLength(11);
  });
});

describe("reasonBreakdown", () => {
  it("sums dollars per reason in the fixed order and leaves unused reasons out", () => {
    const rows = reasonBreakdown([
      transfer({ reason: "gift", usdAmount: 20 }),
      transfer({ reason: "family", usdAmount: 100 }),
      transfer({ reason: "family", usdAmount: 50.5 }),
    ]);
    expect(rows).toEqual([
      { reason: "family", count: 2, usdSent: 150.5 },
      { reason: "gift", count: 1, usdSent: 20 },
    ]);
  });
});

describe("drafts", () => {
  const valid = {
    person: "kushvanth" as const,
    date: "2026-10-08",
    country: "IN" as const,
    usdAmount: 500,
    receivedAmount: 42_000,
    rate: 84,
    method: "remitly" as const,
    reason: "family" as const,
  };

  it("says what is missing, in words", () => {
    expect(draftProblem(valid)).toBeNull();
    expect(draftProblem({ ...valid, usdAmount: 0 })).toBe("Enter the dollars sent");
    expect(draftProblem({ ...valid, country: "PH", receivedAmount: undefined })).toBe("Enter the PHP that arrived");
    expect(draftProblem({ ...valid, feeUsd: -1 })).toBe("The fee can't be negative");
  });

  it("drops an empty fee, a blank note and a stray service name", () => {
    const clean = cleanDraft({ ...valid, feeUsd: 0, note: "  ", methodName: "Xoom" });
    expect(clean.feeUsd).toBeUndefined();
    expect(clean.note).toBeUndefined();
    expect(clean.methodName).toBeUndefined();
    expect(cleanDraft({ ...valid, method: "other", methodName: " Xoom " }).methodName).toBe("Xoom");
  });
});
