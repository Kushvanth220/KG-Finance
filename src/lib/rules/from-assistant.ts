import { v4 as uuidv4 } from "uuid";
import { defaultAggregates, toClockTime, validateExpression } from "./engine";
import type {
  Rule,
  RuleCalculation,
  RuleChart,
  RuleChartType,
  RuleField,
  RuleFieldType,
  RuleFollowUp,
  RuleScope,
  RuleTrigger,
  RuleTriggerKind,
} from "./types";
import type { RuleDraft } from "@/store/rules-store";

/**
 * Turning what the model said into a rule the app can run.
 *
 * Everything here is defensive on purpose. The arguments arrive from a language
 * model describing a sentence the user spoke, so field keys arrive with spaces
 * in them, numbers arrive as strings, and a calculation can reference a field
 * that was never declared. A rule that saves in a broken state would fail
 * silently weeks later, when a follow-up quietly computes the wrong deposit.
 */

type Built<T> = { ok: true } & T;
type Failed = { ok: false; error: string };

const CHART_TYPES: RuleChartType[] = ["bar", "line", "area", "pie", "donut", "scatter", "bubble"];
const FIELD_TYPES: RuleFieldType[] = ["money", "number", "text", "date", "time"];
const TRIGGER_KINDS: RuleTriggerKind[] = [
  "conversation_start",
  "daily",
  "weekly",
  "monthly",
  "manual",
];

/** "Base Pay" -> "base_pay". Calculations reference these, so they must be stable. */
export function toKey(raw: string): string {
  return raw
    // Split camelCase first, so "endTime" becomes "end_time" and can be
    // recognised as a synonym of "finish_time" rather than a stranger.
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^(\d)/, "f$1");
}

function asArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter((item) => item && typeof item === "object");
  return [];
}

function asNumber(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function asBool(value: unknown, fallback: boolean): boolean {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return fallback;
}

function parseFields(raw: unknown): RuleField[] {
  return asArray(raw).flatMap<RuleField>((item) => {
    const label = String(item.label ?? item.name ?? item.key ?? "").trim();
    const key = toKey(String(item.key ?? label));
    if (!key || !label) return [];
    const type = String(item.type ?? "money").toLowerCase() as RuleFieldType;
    const askAt = String(item.ask_at ?? item.askAt ?? "start").toLowerCase();
    // "only ask this if X is yes" — accepted as either a nested object or the
    // flatter form a model tends to produce.
    const rawIf = (item.ask_if ?? item.askIf) as Record<string, unknown> | undefined;
    const ifField = rawIf ? toKey(String(rawIf.field ?? rawIf.key ?? "")) : "";
    const ifEquals = rawIf ? String(rawIf.equals ?? rawIf.value ?? "yes") : "";

    return [
      {
        key,
        label,
        type: FIELD_TYPES.includes(type) ? type : "money",
        askAt: askAt === "follow_up" || askAt === "followup" ? "follow_up" : "start",
        required: asBool(item.required, true),
        ...(item.question ? { question: String(item.question) } : {}),
        ...(ifField ? { askIf: { field: ifField, equals: ifEquals } } : {}),
      },
    ];
  });
}

/**
 * Follow-ups, and the fields they imply.
 *
 * A malformed follow-up used to be dropped without a word, so the rule saved
 * and then simply never asked — the whole point of it, gone silently. It is
 * refused now instead.
 *
 * A follow-up also DECLARES its fields: "27h later ask about tips" means the
 * rule collects tips, even if the model forgot to list it. Refusing that with
 * "the rule does not collect tips" is technically true and completely useless,
 * and it is what stopped a real voice session from saving the Flex rule.
 */
function parseFollowUps(
  raw: unknown,
  fieldKeys: string[]
): { ok: true; followUps: RuleFollowUp[]; implied: RuleField[] } | Failed {
  const followUps: RuleFollowUp[] = [];
  const implied: RuleField[] = [];

  for (const item of asArray(raw)) {
    const afterHours = asNumber(item.after_hours ?? item.afterHours);
    const question = String(item.question ?? "").trim();

    if (afterHours === undefined || afterHours <= 0) {
      return {
        ok: false,
        error: `The follow-up "${question || "(no question)"}" needs after_hours — how many hours later to ask.`,
      };
    }
    if (!question) {
      return { ok: false, error: `The follow-up after ${afterHours}h needs a question to ask.` };
    }

    const named = Array.isArray(item.fields) ? item.fields.map((f) => toKey(String(f))) : [];
    for (const key of named) {
      if (!key || fieldKeys.includes(key) || implied.some((field) => field.key === key)) continue;
      implied.push({
        key,
        label: key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
        type: key.includes("time") ? "time" : "money",
        askAt: "follow_up",
        required: false,
        question,
      });
    }

    const anchor = item.anchor_field ?? item.anchorField;
    followUps.push({
      id: String(item.id ?? uuidv4()),
      afterHours,
      question,
      fields: named.filter(Boolean),
      // Anchoring to a recorded time gives each occurrence its own clock.
      ...(anchor ? { anchorField: toKey(String(anchor)) } : {}),
    });
  }

  return { ok: true, followUps, implied };
}

function parseCalculations(
  raw: unknown,
  fieldKeys: string[]
): { ok: true; calculations: RuleCalculation[] } | Failed {
  const calculations: RuleCalculation[] = [];

  for (const item of asArray(raw)) {
    const label = String(item.label ?? item.name ?? item.key ?? "").trim();
    const key = toKey(String(item.key ?? label));
    const expression = String(item.expression ?? item.formula ?? "").trim();
    if (!key || !expression) continue;

    // Calculations may build on earlier calculations, so each one can see the
    // keys declared before it.
    const known = [...fieldKeys, ...calculations.map((calc) => calc.key)];
    const check = validateExpression(expression, known);
    if (!check.ok) {
      return { ok: false, error: `Calculation "${label || key}": ${check.error}` };
    }

    calculations.push({
      key,
      label: label || key,
      expression,
      money: asBool(item.money, true),
    });
  }

  return { ok: true, calculations };
}

function parseCharts(raw: unknown, known: string[]): RuleChart[] {
  return asArray(raw).flatMap<RuleChart>((item) => {
    const type = String(item.type ?? "bar").toLowerCase() as RuleChartType;
    const x = toKey(String(item.x ?? "date")) || "date";
    const y = toKey(String(item.y ?? ""));
    // A chart of a column that does not exist would render an empty box.
    if (!y || !known.includes(y)) return [];
    if (x !== "date" && !known.includes(x)) return [];
    const size = item.size ? toKey(String(item.size)) : undefined;
    return [
      {
        id: String(item.id ?? uuidv4()),
        title: String(item.title ?? "").trim() || `${y} by ${x}`,
        type: CHART_TYPES.includes(type) ? type : "bar",
        x,
        y,
        ...(size && known.includes(size) ? { size } : {}),
      },
    ];
  });
}

function parseTrigger(args: Record<string, unknown>, fallback?: RuleTrigger): RuleTrigger {
  let kindRaw = String(args.trigger_kind ?? fallback?.kind ?? "daily").toLowerCase().trim();
  if (/conversation|chat|open|session|talk/.test(kindRaw)) kindRaw = "conversation_start";
  const kind = TRIGGER_KINDS.includes(kindRaw as RuleTriggerKind)
    ? (kindRaw as RuleTriggerKind)
    : "daily";
  const time = String(args.trigger_time ?? fallback?.time ?? "").trim();

  return {
    kind,
    question: String(args.trigger_question ?? fallback?.question ?? "").trim(),
    ...(/^\d{1,2}:\d{2}$/.test(time) ? { time } : {}),
    ...(asNumber(args.trigger_weekday) !== undefined
      ? { weekday: asNumber(args.trigger_weekday) }
      : fallback?.weekday !== undefined
        ? { weekday: fallback.weekday }
        : {}),
    ...(asNumber(args.trigger_day_of_month) !== undefined
      ? { dayOfMonth: asNumber(args.trigger_day_of_month) }
      : fallback?.dayOfMonth !== undefined
        ? { dayOfMonth: fallback.dayOfMonth }
        : {}),
  };
}

function parseScope(raw: unknown, fallback: RuleScope = "kushvanth"): RuleScope {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "kushvanth" || value === "g" || value === "shared") return value;
  return fallback;
}

/** Build a complete rule from a create_rule call. */
export function ruleDraftFromArgs(
  args: Record<string, unknown>
): Built<{ draft: RuleDraft }> | Failed {
  const name = String(args.name ?? "").trim();
  if (!name) return { ok: false, error: "The rule needs a name." };

  const question = String(args.trigger_question ?? "").trim();
  if (!question) return { ok: false, error: "The rule needs an opening question to ask." };

  const declared = parseFields(args.fields);
  // Follow-ups are read first: one may declare a field (tips) that the
  // calculations then legitimately reference.
  const parsedFollowUps = parseFollowUps(
    args.follow_ups,
    declared.map((field) => field.key)
  );
  if (!parsedFollowUps.ok) return parsedFollowUps;

  const fields = [...declared, ...parsedFollowUps.implied];
  const fieldKeys = fields.map((field) => field.key);

  const calculations = parseCalculations(args.calculations, fieldKeys);
  if (!calculations.ok) return calculations;

  const known = [...fieldKeys, ...calculations.calculations.map((calc) => calc.key)];
  const followUps = parsedFollowUps.followUps;
  const charts = parseCharts(args.charts, known);

  const payoutKindRaw = String(args.payout_kind ?? "none").toLowerCase();
  const payoutKind =
    payoutKindRaw === "income" || payoutKindRaw === "expense" ? payoutKindRaw : "none";
  const amountKey = toKey(String(args.payout_amount_key ?? ""));

  if (payoutKind !== "none" && amountKey && !known.includes(amountKey)) {
    return {
      ok: false,
      error: `The payout points at "${amountKey}", which the rule does not work out.`,
    };
  }

  return {
    ok: true,
    draft: {
      name,
      scope: parseScope(args.scope),
      enabled: true,
      description: String(args.description ?? "").trim() || question,
      trigger: parseTrigger(args),
      fields,
      followUps,
      calculations: calculations.calculations,
      charts,
      // Sensible summaries from the start; the person edits them on the rule.
      aggregates: defaultAggregates(
        { fields, calculations: calculations.calculations },
        () => uuidv4()
      ),
      payout: {
        kind: payoutKind,
        amountKey,
        target: args.payout_target ? String(args.payout_target).trim() : undefined,
        // Money never moves on its own. The rule computes it; a person agrees
        // to it. This mirrors the confirmation gate on every other write.
        autoPost: false,
      },
      // Several occurrences a day is the norm for shift work, so default on
      // only when the rule collects something per-occurrence.
      repeatable: asBool(args.repeatable, false),
      showOnDashboard: asBool(args.show_on_dashboard, true),
    },
  };
}

/** Build a partial update from an update_rule call, keeping what was not mentioned. */
export function ruleUpdatesFromArgs(
  args: Record<string, unknown>,
  current: Rule
): Built<{ updates: Partial<Rule> }> | Failed {
  const updates: Partial<Rule> = {};

  if (args.name != null && String(args.name).trim()) updates.name = String(args.name).trim();
  if (args.description != null) updates.description = String(args.description).trim();
  if (args.scope != null) updates.scope = parseScope(args.scope, current.scope);
  if (args.enabled != null) updates.enabled = asBool(args.enabled, current.enabled);
  if (args.show_on_dashboard != null) {
    updates.showOnDashboard = asBool(args.show_on_dashboard, current.showOnDashboard);
  }
  if (args.repeatable != null) {
    updates.repeatable = asBool(args.repeatable, current.repeatable);
  }

  const touchesTrigger =
    args.trigger_kind != null ||
    args.trigger_question != null ||
    args.trigger_time != null ||
    args.trigger_weekday != null ||
    args.trigger_day_of_month != null;
  if (touchesTrigger) updates.trigger = parseTrigger(args, current.trigger);

  // Fields and calculations MERGE by key rather than replacing wholesale.
  //
  // "Add start and finish time" produced a call listing the new fields plus
  // most of the old ones — and quietly dropped the existing "total deposit"
  // calculation, which then vanished from a rule nobody asked to change.
  // Anything not mentioned is left alone; removing one is done on the Rules
  // page, where the thing being deleted is visible.
  const mergeByKey = <T extends { key: string }>(existing: T[], incoming: T[]): T[] => {
    const merged = existing.map(
      (item) => incoming.find((candidate) => candidate.key === item.key) ?? item
    );
    const added = incoming.filter(
      (candidate) => !existing.some((item) => item.key === candidate.key)
    );
    return [...merged, ...added];
  };

  const fields =
    args.fields != null ? mergeByKey(current.fields, parseFields(args.fields)) : current.fields;
  if (args.fields != null) updates.fields = fields;
  const fieldKeys = fields.map((field) => field.key);

  let calculations = current.calculations;
  if (args.calculations != null) {
    const parsed = parseCalculations(args.calculations, fieldKeys);
    if (!parsed.ok) return parsed;
    calculations = mergeByKey(current.calculations, parsed.calculations);
    updates.calculations = calculations;
  }

  if (args.follow_ups != null) {
    const parsed = parseFollowUps(args.follow_ups, fieldKeys);
    if (!parsed.ok) return parsed;
    updates.followUps = parsed.followUps;
    if (parsed.implied.length > 0) {
      updates.fields = [...(updates.fields ?? fields), ...parsed.implied];
    }
  }

  const known = [...fieldKeys, ...calculations.map((calc) => calc.key)];
  if (args.charts != null) updates.charts = parseCharts(args.charts, known);

  // Replacing fields can orphan a calculation that referenced an old key.
  if (args.fields != null && args.calculations == null) {
    for (const calculation of current.calculations) {
      const check = validateExpression(calculation.expression, known);
      if (!check.ok) {
        return {
          ok: false,
          error: `Changing the fields would break "${calculation.label}": ${check.error} Update the calculations in the same change.`,
        };
      }
    }
  }

  if (Object.keys(updates).length === 0) {
    return { ok: false, error: "Nothing in that changes the rule." };
  }

  return { ok: true, updates };
}

/** "base pay $62.50, tips $11.25, total deposit $73.75" — for reading back. */
export function describeRuleValues(
  rule: Rule,
  resolved: Record<string, string | number>
): string {
  const parts: string[] = [];
  const money = (value: unknown) => `$${Number(value).toFixed(2)}`;

  for (const field of rule.fields) {
    const value = resolved[field.key];
    if (value === undefined || value === "") continue;
    parts.push(`${field.label.toLowerCase()} ${field.type === "money" ? money(value) : value}`);
  }
  for (const calculation of rule.calculations) {
    const value = resolved[calculation.key];
    if (value === undefined) continue;
    parts.push(
      `${calculation.label.toLowerCase()} ${calculation.money ? money(value) : value}`
    );
  }

  return parts.length > 0 ? parts.join(", ") : "nothing recorded yet";
}

/**
 * Match the value keys a model supplied against the keys a rule collects.
 *
 * Three things go wrong in practice, and all three end with a real block going
 * unrecorded:
 *  - near misses: "base" for "base_pay";
 *  - SYNONYMS: a rule field called finish_time, and the model sends end_time
 *    because the person said "end time" — this refused the whole call and the
 *    assistant then said the rule "doesn't collect times", which was false;
 *  - spoken times: "12:45 PM" is not HH:mm, and storing it verbatim made every
 *    calculation built on it quietly zero.
 *
 * Anything still unrecognised comes back naming the real keys, so the next
 * attempt can be right rather than another guess.
 */
const KEY_SYNONYMS: Record<string, string[]> = {
  start: ["begin", "from", "commence"],
  finish: ["end", "stop", "till", "until", "complete", "completion"],
  pay: ["payment", "amount", "rate", "earned", "earnings"],
  base: ["basic"],
  tips: ["tip", "gratuity"],
  time: ["clock", "hour"],
};

/** "end_time" -> "finish_time" when the rule uses the other word. */
function synonymForms(key: string): string[] {
  const parts = key.split("_");
  const forms = new Set<string>();
  parts.forEach((part, index) => {
    for (const [canonical, alternatives] of Object.entries(KEY_SYNONYMS)) {
      const group = [canonical, ...alternatives];
      if (!group.includes(part)) continue;
      for (const swap of group) {
        const next = [...parts];
        next[index] = swap;
        forms.add(next.join("_"));
      }
    }
  });
  forms.delete(key);
  return [...forms];
}

export function normalizeRuleValues(
  fields: RuleField[] | string[],
  raw: unknown
): { ok: true; values: Record<string, string | number> } | Failed {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "No values were given." };
  }

  const typed: RuleField[] =
    fields.length > 0 && typeof fields[0] === "string"
      ? (fields as string[]).map((key) => ({
          key,
          label: key,
          type: "money" as const,
          askAt: "start" as const,
          required: false,
        }))
      : (fields as RuleField[]);
  const fieldKeys = typed.map((field) => field.key);

  const values: Record<string, string | number> = {};
  const unmatched: string[] = [];

  for (const [given, value] of Object.entries(raw as Record<string, unknown>)) {
    const candidate = toKey(given);

    let match = fieldKeys.find((key) => key === given || key === candidate);

    // "base" for "base_pay" — only when exactly one field could be meant.
    if (!match) {
      const partial = fieldKeys.filter(
        (key) => key.startsWith(candidate) || candidate.startsWith(key)
      );
      if (partial.length === 1) match = partial[0];
    }
    // "end_time" for "finish_time".
    if (!match) {
      const alternatives = synonymForms(candidate);
      const hits = fieldKeys.filter((key) => alternatives.includes(key));
      if (hits.length === 1) match = hits[0];
    }
    if (!match) {
      const loose = fieldKeys.filter((key) =>
        key.replace(/_/g, "").includes(candidate.replace(/_/g, ""))
      );
      if (loose.length === 1) match = loose[0];
    }

    if (!match) {
      unmatched.push(given);
      continue;
    }

    const field = typed.find((item) => item.key === match);

    if (field?.type === "time") {
      const clock = toClockTime(value);
      if (!clock) {
        return {
          ok: false,
          error: `"${String(value)}" is not a time I can read for ${field.label}. Use something like 12:45 PM or 14:15.`,
        };
      }
      values[match] = clock;
      continue;
    }

    const num = Number(value);
    values[match] =
      typeof value === "number" || (value !== "" && Number.isFinite(num)) ? num : String(value);
  }

  if (unmatched.length > 0) {
    return {
      ok: false,
      error: `This rule does not collect ${unmatched
        .map((key) => `"${key}"`)
        .join(", ")}. It collects: ${fieldKeys.join(", ")}. Use those exact names, or add a new field with update_rule first.`,
    };
  }

  if (Object.keys(values).length === 0) {
    return { ok: false, error: `Nothing to record. This rule collects: ${fieldKeys.join(", ")}.` };
  }

  return { ok: true, values };
}

