import type { AssistantToolCall } from "@/lib/ai/tools";
import { describeSchedule, DEFAULT_LEAD_DAYS, type Reminder } from "@/lib/ai/reminders";
import { parseAiUserId } from "@/lib/ai/person";
import { PERSON_LABELS } from "@/types";

export const ASSISTANT_WRITE_TOOLS = new Set([
  "record_income",
  "record_expense",
  "add_debt",
  "record_debt_payment",
  "pay_debt_from_account",
  "adjust_account_balance",
  "add_account",
  // Memory changes go through the same gate as money. Something the assistant
  // will still believe in six months deserves a look before it is written.
  "save_reminder",
  "update_reminder",
  "delete_reminder",
  "save_behavior_preference",
  "delete_behavior_preference",
  // Editing the lists the numbers are filed under.
  "update_income_source",
  "delete_income_source",
  "update_spend_category",
  "delete_spend_category",
  "update_debt",
  "delete_debt",
  // Rules are the standing instructions the app and the assistant both obey.
  // A wrong one keeps being wrong every day until someone notices, so it gets
  // the same read-back-and-agree treatment as money.
  "create_rule",
  "update_rule",
  "delete_rule",
  "log_rule_entry",
  "answer_rule_followup",
  "update_rule_entry",
  "delete_rule_entry",
]);

export function isWriteTool(name: string): boolean {
  return ASSISTANT_WRITE_TOOLS.has(name);
}

/**
 * Memory is workspace-wide: one shared list of reminders and rules, with no
 * person on them. Only money writes carry a person (expense_for, paid_by,
 * for_person), so only money writes need to know who is speaking — asking
 * before a reminder would be a question whose answer changes nothing.
 */
export const SHARED_WRITE_TOOLS = new Set([
  "save_reminder",
  "update_reminder",
  "delete_reminder",
  "save_behavior_preference",
  "delete_behavior_preference",
  // A rule names its own scope, and rule entries live in the rules store
  // rather than in anyone's accounts, so none of these need to know who is
  // speaking before they can be filed.
  "create_rule",
  "update_rule",
  "delete_rule",
  "log_rule_entry",
  "answer_rule_followup",
  "update_rule_entry",
  "delete_rule_entry",
]);

export function writeNeedsSpeaker(name: string): boolean {
  return isWriteTool(name) && !SHARED_WRITE_TOOLS.has(name);
}

export function isToolConfirmed(args: Record<string, unknown>): boolean {
  return args.user_confirmed === true || args.user_confirmed === "true";
}

export function stripConfirmationArg(args: Record<string, unknown>): Record<string, unknown> {
  const { user_confirmed, ...rest } = args;
  return rest;
}

/**
 * Consent belongs to the person, never to the model. A tool call produced by an
 * LLM (or inferred from speech) can arrive already claiming `user_confirmed`,
 * which would save real money with nothing shown on screen. Strip that claim so
 * the write is forced back through the app's own confirmation UI, where the
 * amount is displayed and a human agrees to that exact item.
 */
export function asProposedWrite(call: AssistantToolCall): AssistantToolCall {
  if (!isWriteTool(call.name) || !isToolConfirmed(call.args)) return call;
  return { ...call, args: stripConfirmationArg(call.args) };
}

function personLabel(value: unknown, fallback = "someone") {
  const parsed = parseAiUserId(value);
  return parsed ? PERSON_LABELS[parsed] : fallback;
}

export const EXPENSE_PERSON_CHIPS = [
  { id: "kushvanth" as const, label: PERSON_LABELS.kushvanth },
  { id: "g" as const, label: PERSON_LABELS.g },
  { id: "both" as const, label: "Both" },
];

export function withExpensePerson(
  args: Record<string, unknown>,
  person: (typeof EXPENSE_PERSON_CHIPS)[number]["id"]
): Record<string, unknown> {
  if (person === "both") {
    return { ...args, expense_for: "both" };
  }
  return {
    ...args,
    expense_for: person,
    paid_by: args.paid_by ?? person,
  };
}

export const EXPENSE_PAID_BY_CHIPS = [
  { id: "kushvanth" as const, label: "Kushvanth paid" },
  { id: "g" as const, label: `${PERSON_LABELS.g} paid` },
  { id: "split" as const, label: "Both paid" },
];

export function withPaidBy(
  args: Record<string, unknown>,
  paidBy: (typeof EXPENSE_PAID_BY_CHIPS)[number]["id"]
): Record<string, unknown> {
  return { ...args, paid_by: paidBy };
}

export function expenseWriteNeedsPayer(call: AssistantToolCall): boolean {
  if (call.name !== "record_expense") return false;
  const paidBy = String(call.args.paid_by ?? "").toLowerCase().trim();
  if (paidBy === "kushvanth" || paidBy === "g" || paidBy === "split") return false;
  return String(call.args.expense_for ?? "") === "both";
}

export function writeToolNeedsAccount(call: AssistantToolCall): boolean {
  const args = call.args;
  switch (call.name) {
    case "record_expense":
      return !args.account_name && !args.account_id;
    case "record_income":
      return !args.deposit_account_name && !args.deposit_account_id;
    case "adjust_account_balance":
      return !args.account_name && !args.account_id;
    case "pay_debt_from_account":
      return !args.from_account_name && !args.from_account_id;
    default:
      return false;
  }
}

export function accountChoicePrompt(
  callName: string,
  kind: "pay-from" | "cash-source"
): string {
  if (kind === "cash-source") {
    return "Cash wallet is low — which account did the cash come from?";
  }
  if (callName === "record_income") return "Which account was the money deposited into?";
  return "Which account?";
}

export function withPickedAccount(
  call: AssistantToolCall,
  account: { id: string; name: string },
  kind: "pay-from" | "cash-source"
): AssistantToolCall {
  if (kind === "cash-source") {
    return {
      ...call,
      args: {
        ...call.args,
        cash_source_account_id: account.id,
        cash_source_account_name: account.name,
      },
    };
  }
  if (call.name === "record_income") {
    return {
      ...call,
      args: {
        ...call.args,
        deposit_account_id: account.id,
        deposit_account_name: account.name,
      },
    };
  }
  if (call.name === "pay_debt_from_account") {
    return {
      ...call,
      args: {
        ...call.args,
        from_account_id: account.id,
        from_account_name: account.name,
      },
    };
  }
  return {
    ...call,
    args: {
      ...call.args,
      account_id: account.id,
      account_name: account.name,
    },
  };
}

export function sortAccountChips<T extends { name: string }>(chips: T[]): T[] {
  const rank = (name: string) => {
    const key = name.toLowerCase();
    if (key.includes("green")) return 0;
    if (key.includes("cash")) return 1;
    if (key.includes("chime")) return 2;
    return 3;
  };
  return [...chips].sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
}

function numberOr(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeRepeat(value: unknown): Reminder["repeat"] {
  const raw = String(value ?? "").toLowerCase();
  return raw === "weekly" || raw === "monthly" || raw === "yearly" ? raw : "once";
}

function ordinalDay(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  const suffix = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${suffix[(v - 20) % 10] ?? suffix[v] ?? suffix[0]}`;
}

function weekdayName(value: unknown): string {
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const n = Number(value);
  return days[n] ?? String(value);
}

function monthName(value: unknown): string {
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const n = Number(value);
  return months[n - 1] ?? String(value);
}

function moneyLabel(value: unknown): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? `$${amount.toFixed(2)}` : "this amount";
}

export function buildToolConfirmationPreview(call: AssistantToolCall): string {
  const args = call.args;

  switch (call.name) {
    case "create_rule": {
      // The name is already the lead of the sentence; describing it again
      // would read "New rule "X" — rename it to "X"".
      const rest = { ...args };
      delete rest.name;
      return `New rule "${String(args.name ?? "untitled")}" — ${describeRuleArgs(rest)}`;
    }
    case "update_rule": {
      return `Change the rule matching "${String(args.match ?? "")}" — ${describeRuleArgs(args)}`;
    }
    case "delete_rule": {
      return `Delete the rule matching "${String(args.match ?? "")}", and every entry recorded under it. This cannot be undone.`;
    }
    case "log_rule_entry": {
      const values = describeValueBag(args.values);
      const on = args.date ? ` on ${String(args.date)}` : "";
      return `Log under "${String(args.match ?? "")}"${on}: ${values}.`;
    }
    case "answer_rule_followup": {
      return `Fill in ${describeValueBag(args.values)} on that entry.`;
    }
    case "update_rule_entry": {
      const parts: string[] = [];
      if (args.values && Object.keys(args.values as object).length > 0) {
        parts.push(`set ${describeValueBag(args.values)}`);
      }
      if (args.date) parts.push(`move it to ${String(args.date)}`);
      return `Change that recorded entry — ${parts.join(", ") || "no change described"}.`;
    }
    case "delete_rule_entry": {
      return "Remove that recorded entry. This cannot be undone.";
    }
    case "record_income": {
      const on = args.date ? ` on ${String(args.date)}` : "";
      return `Record ${moneyLabel(args.amount)} income from ${String(args.source_name ?? "income")} into ${String(args.deposit_account_name ?? args.deposit_account_id ?? "an account")}${on}.`;
    }
    case "update_income_source":
      return `Rename the income source "${String(args.match ?? "")}" to "${String(args.new_name ?? "")}".`;
    case "delete_income_source":
      return `Delete the income source "${String(args.match ?? "")}". Past income keeps its history.`;
    case "update_spend_category": {
      const parts: string[] = [];
      if (args.new_name) parts.push(`rename it to "${String(args.new_name)}"`);
      if (Array.isArray(args.keywords)) parts.push(`set keywords to ${(args.keywords as string[]).join(", ") || "none"}`);
      if (args.budget !== undefined) parts.push(Number(args.budget) > 0 ? `set a ${moneyLabel(args.budget)} monthly budget` : "clear the budget");
      return `Change the category "${String(args.match ?? "")}" — ${parts.join(", ") || "no change described"}.`;
    }
    case "delete_spend_category":
      return `Delete the category "${String(args.match ?? "")}". Past expenses keep the name as text.`;
    case "update_debt": {
      const parts: string[] = [];
      if (args.name) parts.push(`rename it to "${String(args.name)}"`);
      if (args.amount !== undefined) parts.push(`set what's owed to ${moneyLabel(args.amount)}`);
      if (args.notes) parts.push(`note: ${String(args.notes)}`);
      return `Change the debt "${String(args.match ?? "")}" — ${parts.join(", ") || "no change described"}.`;
    }
    case "delete_debt":
      return `Remove the debt "${String(args.match ?? "")}" entirely. This cannot be undone.`;
    case "record_expense": {
      const category = args.category ? ` for ${args.category}` : "";
      const expenseFor =
        args.expense_for === "both"
          ? "split between both of you"
          : `${personLabel(args.expense_for, "someone")}'s expense`;
      const paidBy =
        args.paid_by === "split"
          ? "both of you paying"
          : args.paid_by
            ? `${personLabel(args.paid_by, "someone")} paying`
            : "who paid?";
      const account = args.account_name ?? args.account_id ?? "selected account";
      return `Log ${moneyLabel(args.amount)}${category} — ${expenseFor}, ${paidBy} from ${account}.`;
    }
    case "add_debt":
      return `Add debt "${String(args.name)}" for ${moneyLabel(args.amount)}.`;
    case "record_debt_payment":
      return `Record ${moneyLabel(args.amount)} payment toward ${String(args.debt_name ?? args.debt_id ?? "a debt")}.`;
    case "pay_debt_from_account":
      return `Pay ${moneyLabel(args.amount)} toward ${String(args.debt_name ?? args.debt_id ?? "a debt")} from ${String(args.from_account_name ?? args.from_account_id ?? "an account")}.`;
    case "adjust_account_balance":
      return `Set ${String(args.account_name ?? args.account_id ?? "the account")} balance to ${moneyLabel(args.new_balance)}.`;
    case "save_reminder": {
      const preview: Reminder = {
        id: "preview",
        text: String(args.reminder ?? "this"),
        done: false,
        repeat: normalizeRepeat(args.repeat),
        leadDays: numberOr(args.lead_days, DEFAULT_LEAD_DAYS),
        ...(args.date ? { date: String(args.date) } : {}),
        ...(args.day_of_month != null ? { dayOfMonth: Number(args.day_of_month) } : {}),
        ...(args.month != null ? { month: Number(args.month) } : {}),
        ...(args.weekday != null ? { weekday: Number(args.weekday) } : {}),
        ...(args.time ? { time: String(args.time) } : {}),
      };
      const lead = preview.leadDays > 0 ? `, raised ${preview.leadDays} days early` : "";
      return `Remember "${preview.text}" — ${describeSchedule(preview)}${lead}.`;
    }
    case "update_reminder": {
      const changes: string[] = [];
      if (args.new_text) changes.push(`text to "${String(args.new_text)}"`);
      if (args.repeat) changes.push(`repeat to ${String(args.repeat)}`);
      if (args.day_of_month != null) changes.push(`day to the ${ordinalDay(args.day_of_month)}`);
      if (args.weekday != null) changes.push(`day to ${weekdayName(args.weekday)}`);
      if (args.month != null) changes.push(`month to ${monthName(args.month)}`);
      if (args.date) changes.push(`date to ${String(args.date)}`);
      if (args.time) changes.push(`time to ${String(args.time)}`);
      if (args.lead_days != null) changes.push(`lead time to ${Number(args.lead_days)} days`);
      const what = changes.length > 0 ? changes.join(", ") : "nothing";
      return `Update the reminder matching "${String(args.match ?? "")}" — change ${what}.`;
    }
    case "delete_reminder":
      return `Forget the reminder matching "${String(args.match ?? "")}". This cannot be undone from chat.`;
    case "save_behavior_preference":
      return `Always follow this from now on: "${String(args.preference ?? args.instruction ?? "")}".`;
    case "delete_behavior_preference":
      return `Stop following the rule matching "${String(args.match ?? "")}".`;
    case "add_account": {
      const kind = String(args.account_type ?? "account");
      const opening = Number(args.starting_balance);
      const balance = Number.isFinite(opening) && opening !== 0 ? ` starting at ${moneyLabel(opening)}` : "";
      return `Add a new ${kind} account "${String(args.name ?? "account")}"${balance}.`;
    }
    default:
      return `Save this ${call.name.replace(/_/g, " ")} action.`;
  }
}

/**
 * "base_pay $62.50, tips $11.25" from a loose values object.
 *
 * A key that names a time is never money — the card once read "start time
 * $1245.00" for 12:45, which is not a figure anyone should be asked to approve.
 */
function describeValueBag(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "nothing";
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length === 0) return "nothing";
  return entries
    .map(([key, value]) => {
      const label = key.replace(/_/g, " ");
      if (/time|date|hour/i.test(key)) return `${label} ${String(value)}`;
      const num = Number(value);
      return Number.isFinite(num) ? `${label} ${moneyLabel(num)}` : `${label} ${String(value)}`;
    })
    .join(", ");
}

/**
 * The whole rule in one sentence, built from the raw tool arguments rather
 * than a saved Rule — this runs BEFORE the rule exists, which is the point.
 */
function describeRuleArgs(args: Record<string, unknown>): string {
  const parts: string[] = [];

  const kind = String(args.trigger_kind ?? "").toLowerCase();
  const when =
    kind === "weekly"
      ? "every week"
      : kind === "monthly"
        ? "every month"
        : kind === "manual"
          ? "when you say so"
          : kind === "daily"
            ? "every day"
            : "";
  const time = args.trigger_time ? `at ${String(args.trigger_time)}` : "";

  // An update may touch only ONE of these. Describing the trigger only when a
  // question or a cadence was supplied left a time-only change reading "no
  // changes described" — a card asking to approve a blank.
  if (args.trigger_question) {
    parts.push(
      [when, `I ask "${String(args.trigger_question)}"`, time].filter(Boolean).join(" ")
    );
  } else if (when || time) {
    parts.push([when ? `ask ${when}` : "ask", time].filter(Boolean).join(" "));
  }
  if (args.trigger_weekday != null) {
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    parts.push(`on ${days[Number(args.trigger_weekday)] ?? String(args.trigger_weekday)}`);
  }
  if (args.trigger_day_of_month != null) {
    parts.push(`on day ${Number(args.trigger_day_of_month)} of the month`);
  }
  if (args.name != null && String(args.name).trim()) {
    parts.push(`rename it to "${String(args.name).trim()}"`);
  }
  if (args.description != null && String(args.description).trim()) {
    parts.push("update the description");
  }

  const fields = Array.isArray(args.fields) ? args.fields : [];
  const start = fields.filter(
    (f) => !f || typeof f !== "object" || String((f as Record<string, unknown>).ask_at ?? "start") === "start"
  );
  if (start.length > 0) {
    parts.push(
      `record ${start
        .map((f) => String((f as Record<string, unknown>).label ?? (f as Record<string, unknown>).key ?? "").toLowerCase())
        .filter(Boolean)
        .join(", ")}`
    );
  }

  const followUps = Array.isArray(args.follow_ups) ? args.follow_ups : [];
  for (const raw of followUps) {
    if (!raw || typeof raw !== "object") continue;
    const followUp = raw as Record<string, unknown>;
    parts.push(`${Number(followUp.after_hours ?? 0)}h later ask "${String(followUp.question ?? "")}"`);
  }

  const calculations = Array.isArray(args.calculations) ? args.calculations : [];
  for (const raw of calculations) {
    if (!raw || typeof raw !== "object") continue;
    const calculation = raw as Record<string, unknown>;
    parts.push(
      `${String(calculation.label ?? calculation.key ?? "total").toLowerCase()} = ${String(calculation.expression ?? "")}`
    );
  }

  const charts = Array.isArray(args.charts) ? args.charts : [];
  if (charts.length > 0) {
    parts.push(
      `chart it as ${charts
        .map((c) => String((c as Record<string, unknown>).type ?? "bar"))
        .join(" + ")}`
    );
  }

  if (args.enabled === false) parts.push("pause it");
  if (args.show_on_dashboard === true) parts.push("show it on the dashboard");
  if (args.show_on_dashboard === false) parts.push("keep it off the dashboard");

  return parts.length > 0 ? parts.join(", ") + "." : "no changes described.";
}

export function spokenSaveConfirmation(call: AssistantToolCall): string {
  switch (call.name) {
    case "create_rule":
      return "The rule is saved.";
    case "update_rule":
      return "The rule is updated.";
    case "delete_rule":
      return "The rule is deleted.";
    case "log_rule_entry":
      return "Logged.";
    case "answer_rule_followup":
      return "Got it, that entry is complete.";
    case "update_rule_entry":
      return "That entry is updated.";
    case "delete_rule_entry":
      return "That entry is removed.";
    case "record_expense":
      return "The expenses are recorded.";
    case "record_income":
      return "The income is recorded.";
    case "adjust_account_balance":
      return "The balance is updated.";
    case "add_account":
      return "The account is added.";
    case "save_reminder":
      return "I'll remember that.";
    case "update_reminder":
      return "The reminder is updated.";
    case "delete_reminder":
      return "I've forgotten that one.";
    case "save_behavior_preference":
      return "Got it — I'll do that from now on.";
    case "update_income_source":
    case "update_spend_category":
    case "update_debt":
      return "Updated.";
    case "delete_income_source":
    case "delete_spend_category":
    case "delete_debt":
      return "Removed.";
    case "delete_behavior_preference":
      return "I'll stop doing that.";
    case "save_reminder":
      return "Got it.";
    default:
      return "Got it.";
  }
}

export function buildConfirmationToolResult(call: AssistantToolCall) {
  const preview = buildToolConfirmationPreview(call);
  return {
    ok: false,
    status: "needs_confirmation",
    preview,
    message: `Not saved yet. Say aloud: "${preview} Is that right?" Wait for yes, then call ${call.name} again with user_confirmed true.`,
  };
}
