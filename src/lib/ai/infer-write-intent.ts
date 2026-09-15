import type { GeminiChatTurn } from "@/lib/ai/gemini-client";
import type { AssistantToolCall } from "@/lib/ai/tools";
import type { Person } from "@/types";

export function isAffirmation(message: string): boolean {
  return /^(yes|yeah|yep|yup|ok|okay|correct|that's right|thats right|save it|do it|confirm)\b/i.test(
    message.trim()
  );
}

/** Short yes/no-style confirm — not "Yeah I want to add expenses…" */
export function isShortAffirmation(message: string): boolean {
  return /^(?:(?:yes|yeah|yep|yup)(?:[,.]?\s+(?:please|save(?: it)?))?|ok|okay|correct|that's right|thats right|save it|do it|confirm)[.!?]*$/i.test(
    message.trim()
  );
}

export function asksIfMoneyWasSaved(message: string): boolean {
  return /\b(was it (updated|recorded|saved)|did you (update|save|record)|is it (updated|recorded|saved)|did it (update|save|go through))\b/i.test(
    message
  );
}

function looksLikeReminder(message: string): boolean {
  return /\b(remember|remind me|reminder|don't forget|dont forget)\b/i.test(message);
}

function parseAmount(raw: string): number | null {
  const amount = Number(raw.replace(/,/g, ""));
  return Number.isFinite(amount) ? amount : null;
}

/** STT aliases used in this workspace. */
export function normalizeSpeechForIntent(text: string): string {
  return text
    .replace(/\bkrishna\b/gi, "G")
    .replace(/\bgreeshma\b/gi, "G")
    .replace(/\bgriezmann\b/gi, "G")
    .replace(/\bgreen\s*(dog|dote|dhot|dott|dot)\b/gi, "GreenDot")
    .replace(/\bgreendog\b/gi, "GreenDot")
    .replace(/\bmanogreen\b/gi, "GreenDot")
    .replace(/\s+/g, " ")
    .trim();
}

function inferBalanceUpdate(text: string): AssistantToolCall | null {
  const patterns = [
    /(?:update|set|change|adjust)\s+(?:the\s+)?(.+?)\s+(?:account\s+)?(?:balance\s+)?(?:to|at)\s+\$?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /(?:green\s*dot|greendot).{0,48}(?:to|at)\s+\$?\s*([\d,]+(?:\.\d{1,2})?)/i,
    /\$?\s*([\d,]+(?:\.\d{1,2})?)\s+(?:on|in|to|for)\s+(?:the\s+)?(green\s*dot|greendot|chime)/i,
  ];

  const labeled = text.match(patterns[0]!);
  if (labeled) {
    const accountName = labeled[1]!.replace(/\b(account|balance)\b/gi, "").trim();
    const amount = parseAmount(labeled[2]!);
    if (accountName && amount != null) {
      return {
        id: "adjust_account_balance-0",
        name: "adjust_account_balance",
        args: { account_name: accountName, new_balance: amount },
      };
    }
  }

  const greenDot = text.match(patterns[1]!);
  if (greenDot) {
    const amount = parseAmount(greenDot[1]!);
    if (amount != null) {
      return {
        id: "adjust_account_balance-0",
        name: "adjust_account_balance",
        args: { account_name: "GreenDot", new_balance: amount },
      };
    }
  }

  const flipped = text.match(patterns[2]!);
  if (flipped) {
    const amount = parseAmount(flipped[1]!);
    if (amount != null) {
      return {
        id: "adjust_account_balance-0",
        name: "adjust_account_balance",
        args: { account_name: flipped[2]!, new_balance: amount },
      };
    }
  }

  return null;
}

function inferIncome(text: string): AssistantToolCall | null {
  const amountMatch = text.match(
    /(?:got|received|earned|made|deposit(?:ed)?)\s+\$?\s*([\d,]+(?:\.\d{1,2})?)/i
  );
  if (!amountMatch) return null;
  const amount = parseAmount(amountMatch[1]!);
  if (amount == null) return null;

  const fromMatch = text.match(
    /\bfrom\s+([a-z][a-z0-9&.]+(?:\s+[a-z][a-z0-9&.]+){0,3})/i
  );
  const source = fromMatch?.[1]?.trim();
  if (!source) return null;

  const accountMatch = text.match(
    /\b(green\s*dot|greendot|chime|cash app|bank of america)\b/i
  );
  return {
    id: "record_income-0",
    name: "record_income",
    args: {
      amount,
      source_name: source,
      ...(accountMatch ? { deposit_account_name: accountMatch[1] } : {}),
    },
  };
}

export function inferAccountName(text: string): string | undefined {
  if (/\b(green\s*dot|greendot)\b/i.test(text)) return "GreenDot";
  const accountMatch = text.match(
    /\b(chime|cash app|cash wallet|cash|bank of america|zolve)\b/i
  );
  if (!accountMatch) return undefined;
  const raw = accountMatch[1]!;
  if (/^cash$/i.test(raw)) return "Cash Wallet";
  return raw;
}

function inferPaidBy(text: string, speaker?: Person | null): string | undefined {
  const paidByName = text.match(
    /\bpaid\s+by\s+(g|krishna|greeshma|kushvanth|kushwanth|kush|me|i|us|both|split)\b/i
  );
  if (paidByName) {
    const who = paidByName[1]!.toLowerCase();
    if (["us", "both", "split"].includes(who)) return "split";
    if (["me", "i"].includes(who)) return speaker ?? undefined;
    if (["kushvanth", "kushwanth", "kush"].includes(who)) return "kushvanth";
    return "g";
  }
  if (/\b(?:both|we both|the two of us)\s+paid\b/i.test(text)) return "split";
  const jointlyPaid = /\bme and\b/i.test(text) || /\bbetween\s+(?:me|us)\b/i.test(text);
  if (!jointlyPaid) {
    if (/\bgma\s+paid\b/i.test(text)) return "g";
    if (/\bkushvanth\s+paid\b/i.test(text)) return "kushvanth";
    if (/\b(?:i paid|i spend|i spent)\b/i.test(text)) return speaker ?? undefined;
  }
  return undefined;
}

function inferExpenseFor(text: string, speaker?: Person | null): string | undefined {
  const forGma =
    /\b(?:for|to)\s+g\b/i.test(text) || /\bgma(?:'s)?\s+expense\b/i.test(text);
  const forKushvanth =
    /\b(?:for|to)\s+kushvanth\b/i.test(text) || /\bkushvanth(?:'s)?\s+expense\b/i.test(text);
  if (forGma && !forKushvanth) return "g";
  if (forKushvanth && !forGma) return "kushvanth";

  const forBoth =
    /\b(both|split|shared)\b/i.test(text) ||
    /\bbetween\s+(?:me|us)\b/i.test(text) ||
    /\bme and\b/i.test(text) ||
    /\b(?:for|to)\s+(?:us|both)\b/i.test(text) ||
    (/\b(we|us)\b/i.test(text) && /\b(spend|spent|paid|pay|expense)\b/i.test(text));
  if (forBoth) return "both";

  const withoutPayer = text.replace(/\bpaid\s+by\s+\w+\b/gi, " ");
  if (
    /\bgma\b/i.test(withoutPayer) &&
    !/\bkushvanth\b/i.test(withoutPayer) &&
    !/\bme and\b/i.test(text)
  ) {
    return "g";
  }
  if (/\b(?:i paid|i spend|i spent|i bought)\b/i.test(text) && speaker) {
    return speaker;
  }
  return undefined;
}

function inferExpensePeople(
  text: string,
  speaker?: Person | null
): { expense_for?: string; paid_by?: string } {
  const expense_for = inferExpenseFor(text, speaker);
  const paid_by = inferPaidBy(text, speaker);
  if (expense_for === "g" && !paid_by) return { expense_for, paid_by: "g" };
  if (expense_for === "kushvanth" && !paid_by) return { expense_for, paid_by: "kushvanth" };
  return { ...(expense_for ? { expense_for } : {}), ...(paid_by ? { paid_by } : {}) };
}

export function looksLikeExpenseCorrection(text: string): boolean {
  const trimmed = text.trim();
  if (isShortAffirmation(trimmed)) return false;
  return (
    /^(?:sorry[,.]?\s+)?(?:but\s+|and\s+|wait[,.]?\s+|actually\s+)?paid\s+by\b/i.test(trimmed) ||
    /^(?:no|wait|actually|hold on)\b/i.test(trimmed) ||
    /\bpaid\s+by\b/i.test(trimmed)
  );
}

export function mergePendingWrite(
  pending: AssistantToolCall | null,
  inferred: AssistantToolCall
): AssistantToolCall {
  if (!pending || pending.name !== inferred.name) return inferred;
  if (inferred.name !== "record_expense") {
    return { ...inferred, args: { ...pending.args, ...inferred.args } };
  }

  const inferredFor = inferred.args.expense_for;
  const pendingFor = pending.args.expense_for;
  const expenseFor = inferredFor ?? pendingFor;

  return {
    ...inferred,
    args: {
      ...pending.args,
      ...inferred.args,
      expense_for: expenseFor,
      paid_by: inferred.args.paid_by ?? pending.args.paid_by,
      account_name: inferred.args.account_name ?? pending.args.account_name,
      account_id: inferred.args.account_id ?? pending.args.account_id,
      category: inferred.args.category ?? pending.args.category,
      amount: inferred.args.amount ?? pending.args.amount,
    },
  };
}

const EXPENSE_CATEGORY =
  "gas|grocery|groceries|food|rent|wifi|electric|amazon|costco|uber|doordash|coffee|target|walmart|dining|restaurant|phone";

/**
 * Money actually leaving an account. Required before a loose amount can become
 * an expense — without it "I have 4000 dollars" reads as a $4,000 purchase.
 */
const SPEND_CUE =
  /\b(spent|spend|spending|paid|pay|paying|bought|buy|buying|purchased?|expenses?|cost|costs|charged?|billed)\b/i;

/**
 * The user reporting money they HAVE, not money they spent. These sentences
 * answer "what's your balance?" and must never become an expense.
 */
const BALANCE_STATEMENT =
  /\b(?:balance|i have|we have|it has|there(?:'s| is| are)|left|remaining|available|worth|in (?:my|the|our|his|her) account)\b/i;

/**
 * Negated, hypothetical, or future money. For a write that moves real money a
 * missed expense is recoverable; a fabricated one is not — so bail on all of it.
 */
const NOT_A_REAL_SPEND =
  /\b(?:not|never|nope|cancell?ed|cancell?ing|refunded|almost|nearly|instead of|about to|going to|gonna|planning|plan to|thinking|maybe|might|would|could|should|what if|how much|how many)\b|n['’]t\b|\bno\b|\bif\s+(?:i|we|you)\b|\bdo\s+(?:i|we)\s+(?:have|owe)\b/i;

/** Amounts written right next to a spend verb — safe on their own. */
const VERB_ANCHORED = [
  /(?:spent|spend|paid|pay|expense|bought|add(?:ed)?(?:\s+an?)?\s+expenses?)\s+(?:about\s+)?(?:of\s+)?\$?\s*([\d,]+(?:\.\d{1,2})?)/i,
  /(?:spent|spend|paid|pay)\s+for\s+[a-z]+\s+\$?\s*([\d,]+(?:\.\d{1,2})?)/i,
  /(?:spent|spend|paid|pay|bought|buy)\s+(?:\w+\s+){0,3}for\s+\$?\s*([\d,]+(?:\.\d{1,2})?)/i,
  /\bsplit\s+(?:amount\s+)?(?:of\s+)?\$?\s*([\d,]+(?:\.\d{1,2})?)/i,
];

/** Bare amounts. Only trustworthy when the sentence also says money went out. */
const LOOSE_AMOUNT = [
  /\$\s*([\d,]+(?:\.\d{1,2})?)/,
  /\b(\d{1,5}(?:\.\d{1,2})?)\s*(?:dollars?|bucks)\b/i,
  new RegExp(`\\b(\\d{1,5}(?:\\.\\d{1,2})?)\\s+(?:for\\s+)?(?:${EXPENSE_CATEGORY})\\b`, "i"),
  new RegExp(`\\b(?:${EXPENSE_CATEGORY})\\s+\\$?\\s*(\\d{1,5}(?:\\.\\d{1,2})?)\\b`, "i"),
];

function firstAmount(text: string, patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const amount = parseAmount(match[1]!);
    if (amount != null && amount > 0 && amount < 1_000_000) return amount;
  }
  return null;
}

/**
 * Deliberately conservative. A missed expense costs one more sentence of
 * conversation; a fabricated one silently moves real money between two people
 * and corrupts the Balance balance, so every ambiguous case returns null.
 */
function parseExpenseAmount(text: string): number | null {
  if (NOT_A_REAL_SPEND.test(text)) return null;

  const anchored = firstAmount(text, VERB_ANCHORED);
  if (anchored != null) return anchored;

  // A bare number is an expense only if this sentence says money went out and
  // is not simply reporting what sits in an account.
  if (!SPEND_CUE.test(text)) return null;
  if (BALANCE_STATEMENT.test(text)) return null;
  return firstAmount(text, LOOSE_AMOUNT);
}

function prettyCategory(raw: string): string {
  if (/groc/i.test(raw)) return "Groceries";
  if (/coffee|dining|restaurant/i.test(raw)) return "Food";
  if (/^gas$/i.test(raw)) return "Gas";
  if (/^wifi$/i.test(raw)) return "Wifi";
  if (/^electric$/i.test(raw)) return "Electric";
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function inferExpense(text: string, speaker?: Person | null): AssistantToolCall | null {
  const amount = parseExpenseAmount(text);
  if (amount == null) return null;

  const categoryMatch = text.match(new RegExp(`\\b(${EXPENSE_CATEGORY})\\b`, "i"));
  const accountName = inferAccountName(text);
  const people = inferExpensePeople(text, speaker);

  return {
    id: "record_expense-0",
    name: "record_expense",
    args: {
      amount,
      ...(categoryMatch ? { category: prettyCategory(categoryMatch[1]!) } : {}),
      ...(accountName ? { account_name: accountName } : {}),
      ...(people.expense_for ? { expense_for: people.expense_for } : {}),
      ...(people.paid_by ? { paid_by: people.paid_by } : {}),
      // No raw transcript here: `text` is a joined window of recent speech and
      // was landing whole conversations (including Jarvis's own lines) in the
      // saved note. The app writes its own description from the fields above.
    },
  };
}

function inferReminder(text: string): AssistantToolCall | null {
  if (!looksLikeReminder(text)) return null;
  const reminder = text
    .replace(/^(hey\s+\w+[,.]?\s*)/i, "")
    .replace(/^(please\s+)?(remember to|remind me to|don't forget to|dont forget to)\s+/i, "")
    .trim();
  return {
    id: "save_reminder-0",
    name: "save_reminder",
    args: { reminder: reminder || text },
  };
}

function functionCallParts(call: AssistantToolCall) {
  return [
    {
      functionCall: {
        name: call.name,
        args: call.args,
      },
    },
  ];
}

export function inferAssistantToolCall(
  message: string,
  history: GeminiChatTurn[] = [],
  speaker?: Person | null
): { call: AssistantToolCall; modelParts: ReturnType<typeof functionCallParts> } | null {
  const normalizedMessage = normalizeSpeechForIntent(message);
  if (isAffirmation(normalizedMessage)) {
    const priorUser = [...history].reverse().find((turn) => turn.role === "user");
    const fromPrior = priorUser
      ? inferBalanceUpdate(normalizeSpeechForIntent(priorUser.content)) ??
        inferIncome(normalizeSpeechForIntent(priorUser.content)) ??
        inferExpense(normalizeSpeechForIntent(priorUser.content), speaker)
      : null;
    const fromModel = inferBalanceUpdate(
      normalizeSpeechForIntent(
        [...history].reverse().find((turn) => turn.role === "model")?.content ?? ""
      )
    );
    const fromHistory = inferExpense(
      normalizeSpeechForIntent(history.map((turn) => turn.content).join(" ")),
      speaker
    );
    const call = fromPrior ?? fromModel ?? fromHistory;
    if (!call) return null;
    const withSpeaker = applySpeakerToWrite(call, speaker);
    // Deliberately NOT user_confirmed. "ok" is not consent for a write the user
    // has never been shown — this used to guess an expense out of the whole
    // history and save it outright. The caller must surface a preview and let
    // the user confirm that exact item.
    return { call: withSpeaker, modelParts: functionCallParts(withSpeaker) };
  }

  const reminder = inferReminder(normalizedMessage);
  if (reminder) return { call: reminder, modelParts: functionCallParts(reminder) };

  const write =
    inferBalanceUpdate(normalizedMessage) ??
    inferIncome(normalizedMessage) ??
    inferExpense(normalizedMessage, speaker);
  if (!write) return null;
  const withSpeaker = applySpeakerToWrite(write, speaker);
  return { call: withSpeaker, modelParts: functionCallParts(withSpeaker) };
}

function overlayPeopleFromTalk(
  call: AssistantToolCall,
  extraText: string,
  speaker?: Person | null
): AssistantToolCall {
  if (call.name !== "record_expense" || !extraText.trim()) return call;
  const text = normalizeSpeechForIntent(extraText);
  const expenseFor = inferExpenseFor(text, speaker);
  const paidBy = inferPaidBy(text, speaker);
  return {
    ...call,
    args: {
      ...call.args,
      ...(expenseFor ? { expense_for: expenseFor } : {}),
      ...(paidBy ? { paid_by: paidBy } : {}),
    },
  };
}

export function applySpeakerToWrite(
  call: AssistantToolCall,
  speaker?: Person | null
): AssistantToolCall {
  if (!speaker) return call;
  if (call.name === "record_expense") {
    return {
      ...call,
      args: {
        ...call.args,
        expense_for: call.args.expense_for ?? speaker,
        paid_by: call.args.paid_by ?? speaker,
      },
    };
  }
  if (call.name === "record_income") {
    return {
      ...call,
      args: {
        ...call.args,
        for_person: call.args.for_person ?? speaker,
      },
    };
  }
  return call;
}

export function withInferredAccount(
  pending: AssistantToolCall | null,
  text: string
): AssistantToolCall | null {
  if (!pending) return null;
  const accountName = inferAccountName(normalizeSpeechForIntent(text));
  if (!accountName) return pending;
  if (pending.name === "record_expense") {
    return { ...pending, args: { ...pending.args, account_name: accountName } };
  }
  if (pending.name === "record_income") {
    return { ...pending, args: { ...pending.args, deposit_account_name: accountName } };
  }
  if (pending.name === "adjust_account_balance" || pending.name === "pay_debt_from_account") {
    const key = pending.name === "pay_debt_from_account" ? "from_account_name" : "account_name";
    return { ...pending, args: { ...pending.args, [key]: accountName } };
  }
  return pending;
}

export function inferWriteFromRecentTalk(
  lines: string[],
  modelLines: string[] = [],
  speaker?: Person | null
): AssistantToolCall | null {
  const cleaned = lines.filter(Boolean).map((line) => normalizeSpeechForIntent(line));
  const max = Math.min(8, cleaned.length);
  for (let count = 1; count <= max; count += 1) {
    const joined = cleaned.slice(-count).join(" ");
    if (!joined.trim()) continue;
    const call =
      inferExpense(joined, speaker) ?? inferBalanceUpdate(joined) ?? inferIncome(joined);
    if (call) {
      return applySpeakerToWrite(
        overlayPeopleFromTalk(
          call,
          [...cleaned.slice(-count), ...modelLines.slice(-2)].join(" "),
          speaker
        ),
        speaker
      );
    }
  }
  return null;
}
