import { describe, expect, it } from "vitest";
import { reconcileFlex } from "@/lib/flex-income";
import type { Rule, RuleEntry } from "@/lib/rules/types";
import type { IncomeEntry, IncomeSource } from "@/types";

/**
 * Flex blocks → income entries. The whole point is "never twice": a block
 * posted from two phones, or re-planned ten times, must produce one entry.
 */

const rule: Rule = {
  id: "R",
  name: "Amazon Flex blocks",
  scope: "kushvanth",
  enabled: true,
  description: "",
  trigger: { kind: "conversation_start", question: "" },
  fields: [
    { key: "start_time", label: "Start time", type: "time", askAt: "start", required: true },
    { key: "finish_time", label: "Finish time", type: "time", askAt: "start", required: true },
    { key: "base_pay", label: "Base pay", type: "money", askAt: "start", required: true },
    { key: "tips", label: "Tips", type: "money", askAt: "follow_up", required: false },
  ],
  followUps: [{ id: "flex-tips", afterHours: 27, question: "Tips?", fields: ["tips"], anchorField: "start_time" }],
  calculations: [{ key: "total", label: "Total", expression: "base_pay + tips", money: true }],
  charts: [],
  aggregates: [],
  repeatable: true,
  showOnDashboard: false,
  payout: { kind: "income", amountKey: "total", target: "Amazon Flex", autoPost: true, accountId: "acct", postFrom: "2026-09-01" },
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

const block = (id: string, date: string, base: number, tips?: number): RuleEntry => ({
  id,
  ruleId: "R",
  date,
  openedAt: `${date}T10:00:00.000Z`,
  values: tips === undefined ? { start_time: "08:00", finish_time: "10:00", base_pay: base } : { start_time: "08:00", finish_time: "10:00", base_pay: base, tips },
  answered: tips === undefined ? [] : ["flex-tips"],
  complete: tips !== undefined,
});

const sources: IncomeSource[] = [
  { id: "sb", person: "kushvanth", name: "Flex Base Pay" },
  { id: "st", person: "kushvanth", name: "Flex Tip" },
  { id: "sx", person: "kushvanth", name: "Grubhub" },
];
const income = (id: string, sourceId: string, amount: number, date = "2026-09-05"): IncomeEntry => ({
  id, person: "kushvanth", sourceId, amount, date, depositType: "debit", depositAccountId: "acct",
});

describe("reconcileFlex", () => {
  it("lines up earned against deposited and counts blocks still waiting on tips", () => {
    const r = reconcileFlex(
      rule,
      [block("a", "2026-09-02", 40, 10), block("b", "2026-09-03", 30)],
      [income("i1", "sb", 40), income("i2", "st", 10), income("i3", "sx", 999)],
      sources
    );
    expect(r.earnedBase).toBe(70);
    expect(r.earnedTips).toBe(10);
    expect(r.deposited).toBe(50);
    expect(r.outstanding).toBe(30);
    expect(r.blocksAwaitingTips).toBe(1);
  });
});
