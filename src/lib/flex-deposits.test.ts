import { describe, expect, it } from "vitest";
import {
  blocksAwaitingTips,
  depositIdFor,
  depositIncomeEntries,
  expectedPayouts,
  matchRecordedIncome,
  nextPayoutDate,
  payoutDateFor,
  splitLanded,
} from "./flex-deposits";
import { ensureFlexRule } from "./flex";
import type { Rule, RuleEntry } from "@/lib/rules/types";
import type { FlexDeposit } from "@/types";

const rule = ensureFlexRule([], (draft) => ({
  ...draft,
  id: "flex",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
})) as Rule;

function block(id: string, date: string, base: number, tips?: number, finish = "12:00"): RuleEntry {
  return {
    id,
    ruleId: rule.id,
    date,
    openedAt: `${date}T${finish}:00.000Z`,
    values: { start_time: "09:00", finish_time: finish, base_pay: base, ...(tips === undefined ? {} : { tips }) },
    answered: tips === undefined ? [] : ["flex-tips"],
    complete: true,
  };
}

describe("payout days", () => {
  it("are the next Tuesday or Friday strictly after the block", () => {
    expect(nextPayoutDate("2026-09-14")).toBe("2026-09-15"); // Mon → Tue
    expect(nextPayoutDate("2026-09-15")).toBe("2026-09-18"); // Tue → Fri
    expect(nextPayoutDate("2026-09-18")).toBe("2026-09-22"); // Fri → Tue
    expect(nextPayoutDate("2026-09-12")).toBe("2026-09-15"); // Sat → Tue
  });

  it("roll forward past the latest confirmed deposit", () => {
    expect(payoutDateFor("2026-09-14", null)).toBe("2026-09-15");
    expect(payoutDateFor("2026-09-14", "2026-09-15")).toBe("2026-09-18");
    expect(payoutDateFor("2026-09-16", "2026-09-15")).toBe("2026-09-18");
  });
});

const flexSources = [
  { id: "src-flex", name: "Flex", person: "kushvanth" as const },
  { id: "src-rent", name: "Rent", person: "kushvanth" as const },
];

function recorded(id: string, date: string, amount: number, sourceId = "src-flex") {
  return { id, person: "kushvanth" as const, sourceId, amount, date, depositType: "debit" as const, depositAccountId: "x" };
}

describe("matchRecordedIncome", () => {
  // Driven Mon 09/14 ($53), Tue 09/15 ($148), Wed 09/16 ($97): money for a
  // day shows up two days later, and the driver records it then.
  const entries = [
    block("a", "2026-09-14", 43, 10),
    block("b", "2026-09-15", 33, 19),
    block("c", "2026-09-15", 77, 19),
    block("d", "2026-09-16", 63, 34),
  ];
  const income = [recorded("i1", "2026-09-16", 53), recorded("i2", "2026-09-17", 148)];

  it("pays for driven days in order and leaves the rest pending", () => {
    const ledger = matchRecordedIncome(rule, entries, [], income, flexSources, "2026-09-17");
    expect(ledger.matches.map((m) => [m.date, m.covers.map((c) => c.blockDate), m.excess, m.shortfall])).toEqual([
      ["2026-09-16", ["2026-09-14"], 0, 0],
      ["2026-09-17", ["2026-09-15"], 0, 0],
    ]);
    expect(ledger.pending.map((p) => [p.date, p.total, p.blocks])).toEqual([["2026-09-16", 97, 1]]);
    expect(ledger.excess).toBe(0);
  });

  it("learns how long the money takes and dates the pending days by it", () => {
    const ledger = matchRecordedIncome(rule, entries, [], income, flexSources, "2026-09-17");
    expect(ledger.lagLearned).toBe(true);
    expect(ledger.lagDays).toBe(2);
    expect(ledger.pending[0]).toMatchObject({ expectedOn: "2026-09-18", status: "upcoming", overdueDays: 0 });
    const later = matchRecordedIncome(rule, entries, [], income, flexSources, "2026-09-20");
    expect(later.pending[0]).toMatchObject({ status: "due", overdueDays: 2 });
  });

  it("falls back to two days until there is enough history", () => {
    const ledger = matchRecordedIncome(rule, entries, [], [], flexSources, "2026-09-14");
    expect(ledger.lagLearned).toBe(false);
    expect(ledger.pending[0]).toMatchObject({ date: "2026-09-14", expectedOn: "2026-09-16" });
  });

  it("calls out a day recorded twice instead of letting it pay for later days", () => {
    // 09/14 recorded on 09/16 and again on 09/17 together with 09/15's money.
    const twice = [recorded("i1", "2026-09-16", 53), recorded("i2", "2026-09-17", 201)];
    const ledger = matchRecordedIncome(rule, entries, [], twice, flexSources, "2026-09-17");
    expect(ledger.matches[1]).toMatchObject({ covers: [{ blockDate: "2026-09-15", total: 148 }], excess: 53 });
    expect(ledger.excess).toBe(53);
    expect(ledger.pending.map((p) => p.date)).toEqual(["2026-09-16"]);
  });

  it("tolerates a bank rounding difference and reports it as a shortfall", () => {
    const ledger = matchRecordedIncome(rule, entries, [], [recorded("i1", "2026-09-16", 52.5)], flexSources, "2026-09-16");
    expect(ledger.matches[0]).toMatchObject({ covers: [{ blockDate: "2026-09-14", total: 53 }], excess: 0, shortfall: 0.5 });
  });

  it("never lets money pay for a day driven after it was recorded", () => {
    const early = [recorded("i1", "2026-09-13", 53)];
    const ledger = matchRecordedIncome(rule, entries, [], early, flexSources, "2026-09-17");
    expect(ledger.matches[0]).toMatchObject({ covers: [], excess: 53 });
    expect(ledger.pending).toHaveLength(3);
  });

  it("ignores income from other sources and what the app wrote itself", () => {
    const mixed = [
      recorded("i1", "2026-09-16", 500, "src-rent"),
      recorded("flex-base-a", "2026-09-14", 43),
      recorded("flex-tip-a", "2026-09-14", 10),
    ];
    const ledger = matchRecordedIncome(rule, entries, [], mixed, flexSources, "2026-09-17");
    expect(ledger.matches).toEqual([]);
    // The per-block entries cover block "a" directly; nothing is double counted.
    expect(ledger.pending.map((p) => p.date)).toEqual(["2026-09-15", "2026-09-16"]);
  });

  it("treats a confirmed deposit as covering its parts", () => {
    const deposit: FlexDeposit = {
      id: "flexdep-2026-09-16",
      date: "2026-09-16",
      accountId: "bofa",
      expected: 53,
      actual: 53,
      parts: [
        { entryId: "a", part: "base", amount: 43, blockDate: "2026-09-14" },
        { entryId: "a", part: "tip", amount: 10, blockDate: "2026-09-14" },
      ],
      createdAt: "2026-09-16T14:00:00.000Z",
    };
    const ledger = matchRecordedIncome(rule, entries, [deposit], [], flexSources, "2026-09-17");
    expect(ledger.pending.map((p) => p.date)).toEqual(["2026-09-15", "2026-09-16"]);
  });

  it("rolls tips that arrive late into the block's own day", () => {
    const withoutTips = [block("a", "2026-09-14", 43)];
    expect(expectedPayouts(rule, withoutTips, [], [], flexSources, "2026-09-14")[0]).toMatchObject({ base: 43, tips: 0, total: 43 });
    const withTips = [block("a", "2026-09-14", 43, 10)];
    expect(expectedPayouts(rule, withTips, [], [], flexSources, "2026-09-14")[0]).toMatchObject({ base: 43, tips: 10, total: 53 });
  });
});

describe("a landed deposit", () => {
  it("keeps the base whole and lets the tips take the difference", () => {
    expect(splitLanded(140, 132, 8)).toEqual({ base: 132, tips: 8, difference: 0 });
    expect(splitLanded(135.5, 132, 8)).toEqual({ base: 132, tips: 3.5, difference: -4.5 });
    expect(splitLanded(100, 132, 8)).toEqual({ base: 100, tips: 0, difference: -40 });
  });

  it("writes one base entry and one tip entry dated the day it landed", () => {
    const deposit: FlexDeposit = {
      id: "flexdep-2026-09-15",
      date: "2026-09-15",
      accountId: "bofa",
      expected: 140,
      actual: 135.5,
      parts: [
        { entryId: "a", part: "base", amount: 60, blockDate: "2026-09-12" },
        { entryId: "a", part: "tip", amount: 8, blockDate: "2026-09-12" },
        { entryId: "b", part: "base", amount: 72, blockDate: "2026-09-14" },
      ],
      createdAt: "2026-09-15T14:00:00.000Z",
    };
    const entries = depositIncomeEntries(deposit, { baseId: "base", tipId: "tip" });
    expect(entries.map((e) => [e.id, e.amount, e.date])).toEqual([
      ["flex-dep-flexdep-2026-09-15-base", 132, "2026-09-15"],
      ["flex-dep-flexdep-2026-09-15-tip", 3.5, "2026-09-15"],
    ]);
    expect(entries[1]!.notes).toContain("adjusted");
  });

  it("gets an id both phones would choose", () => {
    expect(depositIdFor("2026-09-15", [])).toBe("flexdep-2026-09-15");
    expect(depositIdFor("2026-09-15", [{ date: "2026-09-15" } as FlexDeposit])).toBe("flexdep-2026-09-15-2");
  });
});

describe("blocksAwaitingTips", () => {
  it("lists blocks with blank tips older than the given hours", () => {
    const now = new Date("2026-09-14T20:00:00");
    const entries = [
      block("old", "2026-09-12", 60, undefined, "15:00"),
      block("fresh", "2026-09-14", 60, undefined, "12:00"),
      block("done", "2026-09-10", 60, 4),
    ];
    expect(blocksAwaitingTips(rule, entries, 48, now).map((e) => e.id)).toEqual(["old"]);
  });
});
