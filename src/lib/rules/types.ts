import type { Person } from "@/types";

/**
 * Rules — the workspace's own logic, written in the app instead of in code.
 *
 * A rule says: when this happens, ask me these things, wait this long, ask the
 * rest, then work the numbers out this way. The Amazon Flex case is the shape
 * everything else is measured against: a block gets logged with its base pay,
 * 27 hours later the tips are known, and only then is the deposit real.
 *
 * The point is that neither the app nor the assistant should need new code to
 * learn a new one. The user describes it, the assistant writes it down, and
 * both of them follow the same record from then on.
 */

/** Who the rule belongs to. Workspace rules apply to both people. */
export type RuleScope = Person | "shared";

export type RuleFieldType = "money" | "number" | "text" | "date" | "time";

export interface RuleField {
  /** Machine name used in calculations, e.g. "base_pay". */
  key: string;
  label: string;
  type: RuleFieldType;
  /** The question the assistant asks to fill this in. */
  question?: string;
  /** Asked when the entry is opened, or when the follow-up comes due. */
  askAt: "start" | "follow_up";
  required: boolean;
  /**
   * Only ask this when an earlier answer matches.
   *
   * "Did you use your own car?" -> yes -> "How many miles?". Without this every
   * question is asked every time, which turns a two-question rule into an
   * interrogation.
   */
  askIf?: { field: string; equals: string };
}

/**
 * A delayed second question. Amazon Flex tips land about 27 hours after the
 * block, so the entry stays open until then rather than being written twice.
 */
export interface RuleFollowUp {
  id: string;
  /** Hours after the anchor before this is raised. */
  afterHours: number;
  question: string;
  /** Field keys this follow-up fills in. */
  fields: string[];
  /**
   * Count the delay from a value STORED on the entry rather than from the
   * moment it was logged.
   *
   * Three Flex blocks logged together at midnight would otherwise all ask about
   * tips at the same time — 27 hours after the typing, not 27 hours after each
   * block. Anchoring to `start_time` gives each block its own clock. Falls back
   * to the logged time when the field is empty or unreadable.
   */
  anchorField?: string;
}

/**
 * A named number worked out from the fields, e.g. total = base_pay + tips.
 * Expressions are arithmetic over field keys — see `evaluateExpression`, which
 * parses them rather than calling eval.
 */
export interface RuleCalculation {
  key: string;
  label: string;
  expression: string;
  /** Render as currency. Almost always true here. */
  money: boolean;
}

export type RuleChartType =
  | "bar"
  | "line"
  | "area"
  | "pie"
  | "donut"
  | "scatter"
  | "bubble";

export interface RuleChart {
  id: string;
  title: string;
  type: RuleChartType;
  /** Field/calculation key, or "date" for the entry's own date. */
  x: string;
  /** Field/calculation key to measure. */
  y: string;
  /** Optional third measure — bubble size. */
  size?: string;
}

/**
 * A summary of a rule's records, chosen by the person rather than built into
 * the rule.
 *
 * Every rule stores the same shape — dated entries with numeric fields — so one
 * aggregation layer serves all of them. There is no "Flex chart" and separate
 * "rent chart"; there is a rule, and a set of summaries you switch on.
 */
export type RuleAggregatePeriod = "day" | "week" | "month" | "all";
export type RuleAggregateMethod = "sum" | "average" | "count" | "min" | "max";

export interface RuleAggregate {
  id: string;
  label: string;
  /** Field or calculation key to measure. Ignored when the method is count. */
  measure: string;
  method: RuleAggregateMethod;
  period: RuleAggregatePeriod;
  /** How to draw it. A single "all" figure renders as a number, not a chart. */
  chart: RuleChartType;
  /** Off by default for the noisier ones, like per-entry detail. */
  enabled: boolean;
}

export const RULE_AGGREGATE_PERIODS: { value: RuleAggregatePeriod; label: string }[] = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
  { value: "all", label: "Total" },
];

export const RULE_AGGREGATE_METHODS: { value: RuleAggregateMethod; label: string }[] = [
  { value: "sum", label: "Total" },
  { value: "average", label: "Average" },
  { value: "count", label: "Count" },
  { value: "min", label: "Lowest" },
  { value: "max", label: "Highest" },
];

/**
 * `conversation_start` fires at the top of a chat rather than at a clock time —
 * "whenever we start talking, check whether there were blocks today". It is the
 * natural trigger for anything tied to a daily catch-up rather than to an hour.
 */
export type RuleTriggerKind =
  | "conversation_start"
  | "daily"
  | "weekly"
  | "monthly"
  | "manual";

export interface RuleTrigger {
  kind: RuleTriggerKind;
  /** HH:mm, when the assistant should raise it. */
  time?: string;
  /** 0 = Sunday, for weekly. */
  weekday?: number;
  /** 1-31, for monthly. */
  dayOfMonth?: number;
  /** What the assistant opens with, e.g. "Any Amazon Flex blocks today?" */
  question: string;
}

/** Post a finished entry into the finance store as real money. */
export interface RulePayout {
  kind: "income" | "expense" | "none";
  /** Which calculation or field carries the amount. */
  amountKey: string;
  /** Income source or spend category name to file it under. */
  target?: string;
  /** Account the money lands in. */
  accountId?: string;
  /** Never post automatically — a rule may compute money it does not move. */
  autoPost: boolean;
  /**
   * yyyy-MM-dd. Only entries on or after this day are posted. Everything
   * before was recorded by hand, and posting it again would count it twice.
   */
  postFrom?: string;
}

export interface Rule {
  id: string;
  name: string;
  scope: RuleScope;
  enabled: boolean;
  /**
   * The rule in the user's own words. This is what the assistant reads and
   * follows, so it stays plain English rather than being generated from fields.
   */
  description: string;
  trigger: RuleTrigger;
  fields: RuleField[];
  followUps: RuleFollowUp[];
  calculations: RuleCalculation[];
  charts: RuleChart[];
  /** Which summaries of this rule's data appear on the dashboard. */
  aggregates: RuleAggregate[];
  payout: RulePayout;
  /**
   * One trigger can produce several records.
   *
   * Three Flex blocks in a day is three entries, so the assistant keeps asking
   * "any more?" until told no. A rent rule is not repeatable — asking twice
   * would be nonsense.
   */
  repeatable: boolean;
  /** Show this rule's table and charts on the dashboard. */
  showOnDashboard: boolean;
  createdAt: string;
  updatedAt: string;
}

/** One recorded occurrence — a single Flex block, a single shift. */
export interface RuleEntry {
  id: string;
  ruleId: string;
  /** yyyy-MM-dd of the occurrence. */
  date: string;
  /** ISO timestamp the entry was opened, which follow-ups count from. */
  openedAt: string;
  /**
   * ISO timestamp of the last change, used to settle a merge between devices.
   * Absent on entries written before syncing merged at entry level; `openedAt`
   * stands in for those.
   */
  updatedAt?: string;
  values: Record<string, string | number>;
  /** Follow-up ids already answered. */
  answered: string[];
  /** True once every required field is filled. */
  complete: boolean;
  /** Set when the payout has been written to the finance store. */
  postedTransactionId?: string;
  notes?: string;
}

/** A follow-up that has come due and is still unanswered. */
export interface DueFollowUp {
  rule: Rule;
  entry: RuleEntry;
  followUp: RuleFollowUp;
  dueAt: Date;
  overdueHours: number;
}

export const RULE_CHART_TYPES: { value: RuleChartType; label: string }[] = [
  { value: "bar", label: "Bar" },
  { value: "line", label: "Line" },
  { value: "area", label: "Area" },
  { value: "pie", label: "Pie" },
  { value: "donut", label: "Donut" },
  { value: "scatter", label: "Scatter" },
  { value: "bubble", label: "Bubble" },
];

export const RULE_FIELD_TYPES: { value: RuleFieldType; label: string }[] = [
  { value: "money", label: "Money" },
  { value: "number", label: "Number" },
  { value: "text", label: "Text" },
  { value: "date", label: "Date" },
  { value: "time", label: "Time" },
];
