import { describe, expect, it } from "vitest";
import {
  blocksAwaitingTips,
  depositIdFor,
  depositIncomeEntries,
  expectedPayouts,
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

describe("expectedPayouts", () => {
  const entries = [
    block("a", "2026-09-12", 60, 8), // Sat → Tue 09/15
    block("b", "2026-09-14", 72), // Mon, tips pending → Tue 09/15 (base only)
    block("c", "2026-09-16", 66, 5), // Wed → Fri 09/18
  ];

  it("groups uncovered parts by payout day with base and tips apart", () => {
    const payouts = expectedPayouts(rule, entries, [], [], "2026-09-01", "2026-09-14");
    expect(payouts.map((p) => p.date)).toEqual(["2026-09-15", "2026-09-18"]);
    expect(payouts[0]).toMatchObject({ base: 132, tips: 8, total: 140, blocks: 2, status: "upcoming", overdueDays: 0 });
    expect(payouts[1]).toMatchObject({ base: 66, tips: 5, total: 71, blocks: 1 });
  });

  it("marks a payout due once its day has come, and counts the days after", () => {
    const payouts = expectedPayouts(rule, entries, [], [], "2026-09-01", "2026-09-17");
    expect(payouts[0]).toMatchObject({ date: "2026-09-15", status: "due", overdueDays: 2 });
  });

  it("leaves out what a deposit covered, and rolls late tips to the next payout", () => {
    const deposit: FlexDeposit = {
      id: "flexdep-2026-09-15",
      date: "2026-09-15",
      accountId: "bofa",
      expected: 140,
      actual: 140,
      parts: [
        { entryId: "a", part: "base", amount: 60, blockDate: "2026-09-12" },
        { entryId: "a", part: "tip", amount: 8, blockDate: "2026-09-12" },
        { entryId: "b", part: "base", amount: 72, blockDate: "2026-09-14" },
      ],
      createdAt: "2026-09-15T14:00:00.000Z",
    };
    const later = [entries[0]!, block("b", "2026-09-14", 72, 11), entries[2]!];
    const payouts = expectedPayouts(rule, later, [deposit], [], "2026-09-01", "2026-09-16");
    expect(payouts).toHaveLength(1);
    expect(payouts[0]).toMatchObject({ date: "2026-09-18", base: 66, tips: 16, blocks: 2 });
  });

  it("treats the old per-block income entries as already deposited", () => {
    const legacy = [{ id: "flex-base-a", person: "kushvanth", sourceId: "s", amount: 60, date: "2026-09-12", depositType: "debit", depositAccountId: "x" }] as never;
    const payouts = expectedPayouts(rule, entries, [], legacy, "2026-09-01", "2026-09-14");
    expect(payouts[0]).toMatchObject({ base: 72, tips: 8 });
  });

  it("ignores blocks before the tracking start", () => {
    const payouts = expectedPayouts(rule, entries, [], [], "2026-09-15", "2026-09-14");
    expect(payouts.map((p) => p.date)).toEqual(["2026-09-18"]);
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
