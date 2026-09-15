import { roundMoney } from "@/lib/money";
import { MONTHS } from "@/lib/ai/reminders";
import type {
  DueFollowUp,
  Rule,
  RuleAggregate,
  RuleAggregatePeriod,
  RuleEntry,
  RuleField,
  RuleFollowUp,
} from "./types";

/**
 * The rule engine: works out what a rule computes, what it is still waiting
 * for, and when to ask.
 *
 * Expressions are PARSED, never evaluated as code. They arrive from chat, so
 * `eval` here would let a sentence become a program. A tiny recursive-descent
 * parser over + - * / ( ) and field names covers everything a workspace rule
 * has needed, and refuses anything it does not recognise.
 */

type Token = { kind: "num"; value: number } | { kind: "name"; value: string } | { kind: "op"; value: string };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    const ch = input[i]!;

    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    if (/[0-9.]/.test(ch)) {
      let raw = "";
      while (i < input.length && /[0-9.]/.test(input[i]!)) {
        raw += input[i];
        i += 1;
      }
      const value = Number(raw);
      if (!Number.isFinite(value)) throw new Error(`Not a number: "${raw}"`);
      tokens.push({ kind: "num", value });
      continue;
    }

    if (/[a-zA-Z_]/.test(ch)) {
      let raw = "";
      while (i < input.length && /[a-zA-Z0-9_]/.test(input[i]!)) {
        raw += input[i];
        i += 1;
      }
      tokens.push({ kind: "name", value: raw });
      continue;
    }

    if ("+-*/()".includes(ch)) {
      tokens.push({ kind: "op", value: ch });
      i += 1;
      continue;
    }

    throw new Error(`Cannot use "${ch}" in a calculation.`);
  }

  return tokens;
}

/**
 * Arithmetic over the entry's values. Unknown names resolve to 0 rather than
 * throwing: a Flex block logged before its tips are known should still show a
 * running total, not an error.
 */
export function evaluateExpression(
  expression: string,
  values: Record<string, string | number>
): number {
  const tokens = tokenize(expression);
  let pos = 0;

  const peek = () => tokens[pos];
  const eat = (value: string) => {
    const token = peek();
    if (token && token.kind === "op" && token.value === value) {
      pos += 1;
      return true;
    }
    return false;
  };

  // primary := number | name | "(" expr ")" | "-" primary
  function primary(): number {
    if (eat("(")) {
      const inner = expr();
      if (!eat(")")) throw new Error("Missing a closing bracket.");
      return inner;
    }
    if (eat("-")) return -primary();
    if (eat("+")) return primary();

    const token = peek();
    if (!token) throw new Error("The calculation stops in the middle.");
    pos += 1;

    if (token.kind === "num") return token.value;
    if (token.kind === "name") {
      const raw = values[token.value];
      const num = typeof raw === "number" ? raw : Number(raw);
      return Number.isFinite(num) ? num : 0;
    }
    throw new Error(`Did not expect "${token.value}" here.`);
  }

  function term(): number {
    let left = primary();
    for (;;) {
      if (eat("*")) left *= primary();
      else if (eat("/")) {
        const right = primary();
        // Dividing by nothing yields nothing, not Infinity on a money screen.
        left = right === 0 ? 0 : left / right;
      } else return left;
    }
  }

  function expr(): number {
    let left = term();
    for (;;) {
      if (eat("+")) left += term();
      else if (eat("-")) left -= term();
      else return left;
    }
  }

  const result = expr();
  if (pos !== tokens.length) throw new Error("There is leftover text in the calculation.");
  return Number.isFinite(result) ? result : 0;
}

/** Check an expression before saving it, so a bad rule fails at write time. */
export function validateExpression(
  expression: string,
  fieldKeys: string[]
): { ok: true } | { ok: false; error: string } {
  if (!expression.trim()) return { ok: false, error: "The calculation is empty." };
  try {
    const probe: Record<string, number> = {};
    for (const key of fieldKeys) probe[key] = 1;
    evaluateExpression(expression, probe);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Bad calculation." };
  }

  const used = expression.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) ?? [];
  // A time field also offers "<key>_minutes" for arithmetic.
  const derived = fieldKeys.map((key) => `${key}_minutes`);
  const unknown = used.filter((name) => !fieldKeys.includes(name) && !derived.includes(name));
  if (unknown.length > 0) {
    return {
      ok: false,
      error: `The calculation mentions ${unknown.map((n) => `"${n}"`).join(", ")}, which the rule does not collect.`,
    };
  }
  return { ok: true };
}

/**
 * Anything a person says for a time, as 24-hour "HH:mm".
 *
 * Voice hands over "12:45 PM", "2pm", "2.30 pm" — none of which parse as
 * HH:mm, so they used to be stored verbatim and every calculation built on
 * them silently became zero. Returns null when it genuinely is not a time.
 */
export function toClockTime(value: unknown): string | null {
  const raw = String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!raw) return null;

  const match = /^(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?$/.exec(raw);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  const suffix = match[3]?.replace(/\./g, "");

  if (minutes > 59) return null;
  if (suffix === "pm" && hours < 12) hours += 12;
  if (suffix === "am" && hours === 12) hours = 0;
  if (hours > 23) return null;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** "14:30" -> 870. Minutes since midnight, for arithmetic on time fields. */
export function timeToMinutes(value: unknown): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/**
 * Every field plus every calculation, resolved for one entry.
 *
 * Time fields also appear as `<key>_minutes` so calculations can do arithmetic
 * on them — a block from 12:45 to 14:15 is `(finish_time_minutes -
 * start_time_minutes) / 60` hours. The original "12:45" is kept for display;
 * only the derived number is for maths. A finish before the start is treated
 * as crossing midnight rather than going negative.
 */
export function resolveEntry(rule: Rule, entry: RuleEntry): Record<string, number | string> {
  const resolved: Record<string, number | string> = { ...entry.values };

  // Calculations run against a separate context where a time is a NUMBER of
  // minutes. The returned map keeps "12:45" for display, so a table still
  // reads like a clock while "finish_time - start_time" is real arithmetic
  // instead of NaN quietly collapsing to zero.
  const math: Record<string, number | string> = { ...entry.values };
  for (const field of rule.fields) {
    if (field.type !== "time") continue;
    const minutes = timeToMinutes(entry.values[field.key]);
    if (minutes == null) continue;
    math[field.key] = minutes;
    math[`${field.key}_minutes`] = minutes;
    resolved[`${field.key}_minutes`] = minutes;
  }

  // An overnight shift finishes "before" it started. Which field is the finish
  // is decided by declaration order — the rule lists start then finish — so
  // only the later one wraps past midnight, and only when it reads earlier.
  const timeFields = rule.fields.filter((field) => field.type === "time");
  for (let i = 1; i < timeFields.length; i += 1) {
    const earlierKey = timeFields[i - 1]!.key;
    const laterKey = timeFields[i]!.key;
    const from = math[earlierKey];
    const to = math[laterKey];
    if (typeof from === "number" && typeof to === "number" && to < from) {
      const wrapped = to + 24 * 60;
      math[laterKey] = wrapped;
      math[`${laterKey}_minutes`] = wrapped;
      resolved[`${laterKey}_minutes`] = wrapped;
    }
  }

  for (const calculation of rule.calculations) {
    try {
      const value = evaluateExpression(calculation.expression, math);
      const final = calculation.money ? roundMoney(value) : value;
      resolved[calculation.key] = final;
      // Later calculations can build on earlier ones.
      math[calculation.key] = final;
    } catch {
      resolved[calculation.key] = 0;
      math[calculation.key] = 0;
    }
  }

  return resolved;
}

function fieldsAskedAt(rule: Rule, when: RuleField["askAt"]): RuleField[] {
  return rule.fields.filter((field) => field.askAt === when);
}

/** Fields still missing from an entry, so the assistant knows what to ask. */
export function missingFields(rule: Rule, entry: RuleEntry): RuleField[] {
  return rule.fields.filter((field) => {
    if (!field.required) return false;
    const value = entry.values[field.key];
    return value === undefined || value === "" || value === null;
  });
}

/**
 * Complete means nothing more to collect — every required field filled AND
 * every follow-up answered.
 *
 * The follow-up half matters: a Flex block whose tips are optional would
 * otherwise be "complete" the moment the base pay was logged, while the rule
 * was still going to come back 27 hours later and ask about tips.
 */
export function isEntryComplete(rule: Rule, entry: RuleEntry): boolean {
  if (missingFields(rule, entry).length > 0) return false;
  return rule.followUps.every((followUp) => entry.answered.includes(followUp.id));
}

/** When a follow-up on this entry comes due. */
export function followUpDueAt(entry: RuleEntry, followUp: RuleFollowUp): Date {
  const anchor = anchorInstant(entry, followUp);
  return new Date(anchor.getTime() + followUp.afterHours * 3_600_000);
}

/**
 * The moment a follow-up counts from: a stored time on the entry's own date
 * when the rule names one, otherwise when the entry was logged.
 */
function anchorInstant(entry: RuleEntry, followUp: RuleFollowUp): Date {
  const key = followUp.anchorField;
  if (key) {
    const minutes = timeToMinutes(entry.values[key]);
    if (minutes != null && /^\d{4}-\d{2}-\d{2}$/.test(entry.date)) {
      const at = new Date(`${entry.date}T00:00:00`);
      if (!Number.isNaN(at.getTime())) {
        at.setMinutes(at.getMinutes() + minutes);
        return at;
      }
    }
    // A date field can anchor too, e.g. "3 days after the invoice date".
    const raw = String(entry.values[key] ?? "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const at = new Date(`${raw}T00:00:00`);
      if (!Number.isNaN(at.getTime())) return at;
    }
  }
  return new Date(entry.openedAt);
}

/**
 * Follow-ups that are due now and still unanswered, oldest first.
 *
 * This is what turns "ask me about tips 27 hours later" from a note into
 * something the assistant actually raises on its own.
 */
export function dueFollowUps(
  rules: Rule[],
  entries: RuleEntry[],
  now: Date = new Date()
): DueFollowUp[] {
  const byId = new Map(rules.map((rule) => [rule.id, rule]));
  const due: DueFollowUp[] = [];

  for (const entry of entries) {
    const rule = byId.get(entry.ruleId);
    if (!rule || !rule.enabled) continue;

    for (const followUp of rule.followUps) {
      if (entry.answered.includes(followUp.id)) continue;
      const dueAt = followUpDueAt(entry, followUp);
      if (dueAt > now) continue;
      due.push({
        rule,
        entry,
        followUp,
        dueAt,
        overdueHours: Math.floor((now.getTime() - dueAt.getTime()) / 3_600_000),
      });
    }
  }

  return due.sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime());
}

/** Should the rule's opening question be asked today? */
export function triggerDueToday(rule: Rule, now: Date = new Date()): boolean {
  if (!rule.enabled) return false;
  const { kind, weekday, dayOfMonth } = rule.trigger;
  if (kind === "manual") return false;
  if (kind === "daily") return true;
  if (kind === "weekly") return weekday == null || now.getDay() === weekday;
  if (kind === "monthly") {
    if (dayOfMonth == null) return false;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    return now.getDate() === Math.min(dayOfMonth, lastDay);
  }
  return false;
}

export interface RuleTable {
  columns: { key: string; label: string; money: boolean }[];
  /**
   * Each row carries the id of the entry it came from.
   *
   * Callers used to re-sort the entries themselves and pair them with rows by
   * position. Two Flex blocks on the same day made those two orders disagree,
   * so the delete button on a row removed a different block than the one being
   * looked at. The row knows what it is; nobody should have to guess.
   *
   * `__entryId` cannot collide with a field key — `toKey` strips leading
   * underscores, so no user-authored field can ever produce this name.
   */
  rows: (Record<string, string | number> & { __entryId: string })[];
}

/**
 * The rule's entries as a table — the same shape whether it is rendered on the
 * page, drawn as a chart, or read back to the assistant as markdown.
 */
export function buildRuleTable(rule: Rule, entries: RuleEntry[]): RuleTable {
  const columns = [
    { key: "date", label: "Date", money: false },
    ...rule.fields.map((field) => ({
      key: field.key,
      label: field.label,
      money: field.type === "money",
    })),
    ...rule.calculations.map((calculation) => ({
      key: calculation.key,
      label: calculation.label,
      money: calculation.money,
    })),
  ];

  const rows = entries
    .filter((entry) => entry.ruleId === rule.id)
    .slice()
    // Newest first, and same-day entries keep the order they were logged in.
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.openedAt < b.openedAt ? 1 : a.openedAt > b.openedAt ? -1 : 0;
    })
    .map((entry) => ({
      __entryId: entry.id,
      date: entry.date,
      ...resolveEntry(rule, entry),
    }));

  return { columns, rows };
}

/** Markdown table, for reading a rule's data back in chat. */
export function renderTableMarkdown(table: RuleTable, limit = 20): string {
  if (table.rows.length === 0) return "_No entries yet._";

  const head = `| ${table.columns.map((c) => c.label).join(" | ")} |`;
  const rule = `| ${table.columns.map(() => "---").join(" | ")} |`;
  const body = table.rows.slice(0, limit).map((row) => {
    const cells = table.columns.map((column) => {
      const value = row[column.key];
      if (value === undefined || value === "") return "—";
      if (column.money) return `$${Number(value).toFixed(2)}`;
      return String(value);
    });
    return `| ${cells.join(" | ")} |`;
  });

  const more = table.rows.length > limit ? `\n_${table.rows.length - limit} more rows._` : "";
  return [head, rule, ...body].join("\n") + more;
}

/**
 * Totals per column, for the summary line under a rule's table.
 *
 * Amounts add up. RATES do not: three blocks at $21, $21 and $22 an hour do
 * not make $64 an hour, which is what a plain sum printed. A calculation that
 * divides by another calculation is a rate, so its footer is worked out from
 * the column totals instead — $106.50 over 5 hours is $21.30 an hour, which is
 * the number actually worth knowing.
 */
export function summariseTable(table: RuleTable, rule?: Rule): Record<string, number> {
  const totals: Record<string, number> = {};
  const calcKeys = new Set((rule?.calculations ?? []).map((calc) => calc.key));

  const isRate = (key: string): boolean => {
    const calculation = rule?.calculations.find((item) => item.key === key);
    if (!calculation || !calculation.expression.includes("/")) return false;
    const referenced = calculation.expression.match(/[a-zA-Z_][a-zA-Z0-9_]*/g) ?? [];
    return referenced.some((name) => name !== key && calcKeys.has(name));
  };

  for (const column of table.columns) {
    if (column.key === "date") continue;
    if (isRate(column.key)) continue;

    let sum = 0;
    let numeric = false;
    for (const row of table.rows) {
      const value = Number(row[column.key]);
      if (Number.isFinite(value)) {
        sum += value;
        numeric = true;
      }
    }
    if (numeric) totals[column.key] = column.money ? roundMoney(sum) : sum;
  }

  // Second pass: rates, from the totals just computed.
  for (const column of table.columns) {
    if (!isRate(column.key)) continue;
    const calculation = rule!.calculations.find((item) => item.key === column.key)!;
    try {
      const value = evaluateExpression(calculation.expression, totals);
      totals[column.key] = calculation.money ? roundMoney(value) : value;
    } catch {
      // Leave it out rather than print something wrong.
    }
  }

  return totals;
}

/** Plain-English summary of a rule, used in confirmation cards and on the page. */
export function describeRule(rule: Rule): string {
  const parts: string[] = [];

  const { trigger } = rule;
  if (trigger.kind === "daily") parts.push("Every day");
  else if (trigger.kind === "weekly") {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    parts.push(trigger.weekday != null ? `Every ${days[trigger.weekday]}` : "Every week");
  } else if (trigger.kind === "monthly") {
    parts.push(trigger.dayOfMonth ? `On the ${trigger.dayOfMonth} of each month` : "Every month");
  } else parts.push("When you say so");

  if (trigger.time) parts.push(`at ${trigger.time}`);
  parts.push(`ask "${trigger.question}"`);

  const startFields = fieldsAskedAt(rule, "start");
  if (startFields.length > 0) {
    parts.push(`record ${startFields.map((f) => f.label.toLowerCase()).join(", ")}`);
  }

  for (const followUp of rule.followUps) {
    parts.push(`then ${followUp.afterHours}h later ask "${followUp.question}"`);
  }

  for (const calculation of rule.calculations) {
    parts.push(`${calculation.label.toLowerCase()} = ${calculation.expression}`);
  }

  if (rule.payout.kind !== "none") {
    parts.push(
      `${rule.payout.autoPost ? "post" : "offer to post"} ${rule.payout.amountKey} as ${rule.payout.kind}`
    );
  }

  return parts.join(", ") + ".";
}

/* ------------------------------------------------------------------ *
 * Aggregation
 *
 * Every rule stores the same shape — dated entries carrying numeric fields —
 * so summarising one is the same job as summarising any other. This layer is
 * deliberately generic: nothing here knows what a Flex block is.
 * ------------------------------------------------------------------ */

/** Monday-based week key, e.g. "2026-W36". */
function weekKey(date: string): string {
  const at = new Date(`${date}T00:00:00`);
  if (Number.isNaN(at.getTime())) return date;
  const day = (at.getDay() + 6) % 7;
  at.setDate(at.getDate() - day);
  const monday = at;
  const firstThursday = new Date(monday.getFullYear(), 0, 4);
  const week =
    1 +
    Math.round(
      (monday.getTime() - firstThursday.getTime()) / 604_800_000 +
        ((firstThursday.getDay() + 6) % 7) / 7
    );
  return `${monday.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function periodKey(date: string, period: RuleAggregatePeriod): string {
  if (period === "all") return "All";
  if (period === "month") return date.slice(0, 7);
  if (period === "week") return weekKey(date);
  return date;
}

export interface AggregatePoint {
  key: string;
  label: string;
  value: number;
  /** How many entries fed this bucket — useful under an average. */
  count: number;
}

export interface AggregateResult {
  aggregate: RuleAggregate;
  points: AggregatePoint[];
  /** The single headline number across everything in range. */
  total: number;
  money: boolean;
}

function prettyPeriodLabel(key: string, period: RuleAggregatePeriod): string {
  if (period === "all") return "Total";
  if (period === "month") {
    const [year, month] = key.split("-");
    const index = Number(month) - 1;
    return MONTHS[index] ? `${MONTHS[index]!.slice(0, 3)} ${year}` : key;
  }
  return key;
}

/**
 * Run one aggregate over a rule's entries.
 *
 * The measure may be a field or a calculation — both resolve through
 * `resolveEntry`, so a derived total aggregates exactly like a raw amount.
 */
export function runAggregate(
  rule: Rule,
  entries: RuleEntry[],
  aggregate: RuleAggregate
): AggregateResult {
  const mine = entries.filter((entry) => entry.ruleId === rule.id);
  const buckets = new Map<string, number[]>();

  for (const entry of mine) {
    const resolved = resolveEntry(rule, entry);
    const raw = aggregate.method === "count" ? 1 : Number(resolved[aggregate.measure]);
    if (!Number.isFinite(raw)) continue;
    const key = periodKey(entry.date, aggregate.period);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(raw);
    else buckets.set(key, [raw]);
  }

  const money =
    aggregate.method !== "count" &&
    (rule.fields.find((field) => field.key === aggregate.measure)?.type === "money" ||
      rule.calculations.find((calc) => calc.key === aggregate.measure)?.money === true);

  const reduce = (values: number[]): number => {
    if (values.length === 0) return 0;
    switch (aggregate.method) {
      case "count":
        return values.length;
      case "average":
        return values.reduce((sum, value) => sum + value, 0) / values.length;
      case "min":
        return Math.min(...values);
      case "max":
        return Math.max(...values);
      case "sum":
      default:
        return values.reduce((sum, value) => sum + value, 0);
    }
  };

  const points = [...buckets.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, values]) => {
      const value = reduce(values);
      return {
        key,
        label: prettyPeriodLabel(key, aggregate.period),
        value: money ? roundMoney(value) : Number(value.toFixed(2)),
        count: values.length,
      };
    });

  // The headline is computed across ALL values, not by re-reducing the buckets —
  // an average of averages is not the average, and a max of maxes only happens
  // to work.
  const everything = [...buckets.values()].flat();
  const total = reduce(everything);

  return {
    aggregate,
    points,
    total: money ? roundMoney(total) : Number(total.toFixed(2)),
    money: Boolean(money),
  };
}

/**
 * Sensible starting summaries for a rule the moment it is created.
 *
 * `idFor` receives a stable slug describing each summary. A rule saved before
 * summaries existed has none stored, so the dashboard derives them on the fly —
 * and those ids must be the SAME on every render, or toggling one would act on
 * a different summary than the one clicked.
 */
export function defaultAggregates(
  rule: Pick<Rule, "fields" | "calculations">,
  idFor: (slug: string) => string
): RuleAggregate[] {
  const money =
    rule.calculations.find((calc) => calc.money) ??
    rule.fields.find((field) => field.type === "money");
  if (!money) return [];

  const measure = money.key;
  const label = "label" in money ? money.label : measure;
  const duration = rule.calculations.find((calc) =>
    /hour|duration|time/i.test(calc.label + calc.key)
  );

  const aggregates: RuleAggregate[] = [
    { id: idFor(`${measure}-sum-day`), label: `${label} — daily`, measure, method: "sum", period: "day", chart: "bar", enabled: true },
    { id: idFor(`${measure}-sum-week`), label: `${label} — weekly`, measure, method: "sum", period: "week", chart: "bar", enabled: true },
    { id: idFor(`${measure}-sum-month`), label: `${label} — monthly`, measure, method: "sum", period: "month", chart: "bar", enabled: false },
  ];

  if (duration) {
    aggregates.push({
      id: idFor(`${duration.key}-sum-all`),
      label: `${duration.label} — total`,
      measure: duration.key,
      method: "sum",
      period: "all",
      chart: "bar",
      enabled: true,
    });
  }

  return aggregates;
}

/**
 * The questions to ask right now, in order, given what has been answered so far.
 *
 * A field with an `askIf` is skipped until its condition holds, so a rule can
 * branch — "did you drive?" gates "how many miles?" — without the caller
 * knowing anything about the rule's shape.
 */
export function fieldsToAsk(
  rule: Rule,
  when: RuleField["askAt"],
  answered: Record<string, string | number> = {}
): RuleField[] {
  return rule.fields.filter((field) => {
    if (field.askAt !== when) return false;
    if (!field.askIf) return true;

    const seen = answered[field.askIf.field];
    if (seen === undefined || seen === null || seen === "") return false;

    const want = field.askIf.equals.trim().toLowerCase();
    const got = String(seen).trim().toLowerCase();
    // "yes" is the common gate, and people say yes in several ways.
    if (["yes", "y", "true"].includes(want)) {
      return ["yes", "y", "true", "1"].includes(got) || Number(got) > 0;
    }
    return got === want;
  });
}

/** Plain-English description of a rule's question flow, for the assistant. */
export function describeQuestionFlow(rule: Rule): string {
  const lines: string[] = [];
  const start = fieldsToAsk(rule, "start");
  const gated = rule.fields.filter((field) => field.askAt === "start" && field.askIf);

  if (start.length > 0) {
    lines.push(`ask for ${start.map((f) => f.label.toLowerCase()).join(", ")}`);
  }
  for (const field of gated) {
    lines.push(
      `only ask ${field.label.toLowerCase()} when ${field.askIf!.field} is ${field.askIf!.equals}`
    );
  }
  if (rule.repeatable) {
    lines.push("then ask whether there was another one, and repeat until they say no");
  }
  return lines.join("; ");
}
