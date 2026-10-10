import { describe, expect, it } from "vitest";
import { buildAnswerTour, litSoFar, MAX_STOPS, readingMs, splitSentences } from "./answer-tour";
import type { FinanceGraph, GraphHub, GraphLeaf, HubKey } from "./assistant-graph";

function leaf(hub: HubKey, label: string): GraphLeaf {
  return { id: `${hub}:${label.toLowerCase().replace(/\s+/g, "-")}`, hub, label, value: 1, valueText: "$1", tone: "neutral", meter: null, href: "/", prompt: "" };
}

function hub(key: HubKey, label: string, leaves: string[]): GraphHub {
  return {
    key, label, headline: 0, headlineText: "$0", caption: "", tone: "neutral", series: [], seriesLabel: "",
    stats: [], chips: [], leaves: leaves.map((name) => leaf(key, name)), href: "/", prompt: "",
  };
}

const graph: FinanceGraph = {
  person: "kushvanth",
  core: { label: "Kushvanth", headlineText: "$449.56", caption: "available" },
  monthLabel: "October 2026",
  hubs: [
    hub("spending", "Spending", ["Groceries", "Shopping", "Gas"]),
    hub("income", "Income", ["Flex", "Door Dash"]),
    hub("accounts", "Accounts", ["Chime", "Cash App"]),
    hub("bills", "Bills", []),
    hub("debts", "Debts", []),
    hub("transfers", "Transfers", []),
    hub("balance", "Balance", []),
  ],
};

const REPLY =
  "You've spent $4,553.28 on Spending so far in October. Groceries is the biggest at $412.30, then Shopping and Gas. Most of it went through Chime and Cash App. No bills are due this week.";

describe("splitSentences", () => {
  it("splits on sentence ends but keeps amounts whole", () => {
    expect(splitSentences(REPLY)).toEqual([
      "You've spent $4,553.28 on Spending so far in October.",
      "Groceries is the biggest at $412.30, then Shopping and Gas.",
      "Most of it went through Chime and Cash App.",
      "No bills are due this week.",
    ]);
  });

  it("takes markdown off and treats each bullet as its own sentence", () => {
    expect(splitSentences("## This month\n- **Groceries**: $412.30\n- Gas is *down*\n1. Pay `Chime`")).toEqual([
      "This month",
      "Groceries: $412.30",
      "Gas is down",
      "Pay Chime",
    ]);
  });

  it("keeps a link's words", () => {
    expect(splitSentences("See [your bills](/memory) today.")).toEqual(["See your bills today."]);
  });

  it("returns nothing for an empty reply", () => {
    expect(splitSentences("  \n ")).toEqual([]);
  });
});

describe("buildAnswerTour", () => {
  it("makes a stop per sentence, framing what each one names", () => {
    const stops = buildAnswerTour(graph, REPLY);
    expect(stops).toHaveLength(4);
    expect(stops[0]!.hubs).toContain("spending");
    expect(stops[1]!.leaves).toEqual(["spending:groceries", "spending:shopping", "spending:gas"]);
    expect(stops[1]!.hubs).toContain("spending");
    expect(stops[2]!.leaves).toEqual(["accounts:chime", "accounts:cash-app"]);
    expect(stops[2]!.hubs).toContain("accounts");
    expect(stops[3]!.hubs).toEqual(["bills"]);
  });

  it("keeps a sentence that names nothing, as a pull-back to the whole map", () => {
    const stops = buildAnswerTour(graph, "Good question. Chime is fine.");
    expect(stops[0]).toMatchObject({ text: "Good question.", hubs: [], leaves: [] });
    expect(stops[1]!.leaves).toEqual(["accounts:chime"]);
  });

  it("groups a long answer so the tour never passes the stop limit", () => {
    const long = Array.from({ length: 20 }, (_, i) => `Point ${i + 1} is here.`).join(" ");
    const stops = buildAnswerTour(graph, long);
    expect(stops.length).toBeLessThanOrEqual(MAX_STOPS);
    expect(stops.map((stop) => stop.text).join(" ")).toBe(long);
  });

  it("returns no tour for an empty reply", () => {
    expect(buildAnswerTour(graph, "")).toEqual([]);
  });
});

describe("readingMs", () => {
  it("holds a short sentence long enough to read, and caps a long one", () => {
    expect(readingMs("Done.")).toBe(2600);
    expect(readingMs("one two three four five six seven eight nine ten")).toBe(1500 + 10 * 280);
    expect(readingMs(Array.from({ length: 80 }, () => "word").join(" "))).toBe(8000);
  });
});

describe("litSoFar", () => {
  it("lights only the stops already reached", () => {
    const stops = buildAnswerTour(graph, REPLY);
    expect(litSoFar(stops, 0)).toEqual({ hubs: [], leaves: [] });
    expect(litSoFar(stops, 2).leaves).toEqual(["spending:groceries", "spending:shopping", "spending:gas"]);
    expect(litSoFar(stops, 4).hubs).toEqual(expect.arrayContaining(["spending", "accounts", "bills"]));
  });
});
