import type { Rule } from "@/lib/rules/types";
import type { RuleDraft } from "@/store/rules-store";

/**
 * The Amazon Flex tracker's own shape.
 *
 * Flex is the one thing tracked this closely, so it gets a page of its own
 * rather than being assembled out of a generic rule builder every time. The
 * storage underneath is still an ordinary rule — one entry per block — which
 * means the assistant, the dashboard summaries and the cloud sync all keep
 * working without knowing this page exists.
 */

/** Amazon Flex's blue, from the brand mark. */
export const FLEX_BLUE = "#0077FF";

export const FLEX_RULE_NAME = "Amazon Flex blocks";

/** Recognise the tracker's rule however it was originally named. */
export function isFlexRule(rule: Rule): boolean {
  return /amazon\s*flex|flex\s*block/i.test(rule.name);
}

export function findFlexRule(rules: Rule[]): Rule | undefined {
  return rules.find(isFlexRule);
}

function flexDraft(): RuleDraft {
  return {
    name: FLEX_RULE_NAME,
    scope: "kushvanth",
    enabled: true,
    description:
      "Daily blocks. Base pay when the block finishes, tips about 27 hours later. Deposit is base plus tips.",
    trigger: {
      kind: "conversation_start",
      question: "Any Amazon Flex blocks today?",
    },
    fields: [
      {
        key: "start_time",
        label: "Start time",
        type: "time",
        askAt: "start",
        required: true,
        question: "What time did the block start?",
      },
      {
        key: "finish_time",
        label: "Finish time",
        type: "time",
        askAt: "start",
        required: true,
        question: "What time did it finish?",
      },
      {
        key: "base_pay",
        label: "Base pay",
        type: "money",
        askAt: "start",
        required: true,
        question: "What was the base pay?",
      },
      {
        key: "tips",
        label: "Tips",
        type: "money",
        askAt: "follow_up",
        required: false,
        question: "How much were the tips?",
      },
    ],
    followUps: [
      {
        id: "flex-tips",
        afterHours: 27,
        question: "Any tips on that Amazon Flex block yet?",
        fields: ["tips"],
        // Each block's clock starts when the block did, not when it was typed in.
        anchorField: "start_time",
      },
    ],
    calculations: [
      { key: "total", label: "Total deposit", expression: "base_pay + tips", money: true },
      {
        key: "hours",
        label: "Hours worked",
        expression: "(finish_time - start_time) / 60",
        money: false,
      },
      { key: "pay_per_hour", label: "Pay per hour", expression: "total / hours", money: true },
    ],
    charts: [],
    aggregates: [],
    payout: { kind: "income", amountKey: "total", target: "Amazon Flex", autoPost: false },
    repeatable: true,
    showOnDashboard: true,
  };
}

/**
 * The rule behind the Flex page, created on first visit if it is not there.
 *
 * Returns undefined on the render that creates it; the store update re-renders
 * immediately with the real one, which keeps this side-effect-free enough to
 * call from a memo.
 */
export function ensureFlexRule(
  rules: Rule[],
  addRule: (draft: RuleDraft) => Rule
): Rule | undefined {
  const existing = findFlexRule(rules);
  if (existing) return existing;
  return addRule(flexDraft());
}
