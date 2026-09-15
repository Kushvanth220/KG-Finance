import type { Person } from "@/types";
import { PERSON_LABELS } from "@/types";
import { OWNER_LABEL, MEMBER_LABEL } from "@/lib/branding";

export const AI_USER_IDS = ["kushvanth", "g"] as const;
export type AiUserId = Person;

/**
 * Spoken names, as speech-to-text actually delivers them. The single-letter
 * member is matched by the letter itself and the ways it gets transcribed.
 */
const USER_ALIASES: Record<string, AiUserId> = {
  kushvanth: "kushvanth",
  kushwanth: "kushvanth",
  kushvant: "kushvanth",
  kushwant: "kushvanth",
  khushvanth: "kushvanth",
  khushwant: "kushvanth",
  kushvan: "kushvanth",
  kush: "kushvanth",
  g: "g",
  gee: "g",
  jee: "g",
  ji: "g",
};

/** Canonical spellings, for the fuzzy fallback below. */
const NAME_TARGETS: Array<{ id: AiUserId; word: string }> = [
  { id: "kushvanth", word: "kushvanth" },
];

function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const temp = prev[j]!;
      prev[j] = Math.min(
        prev[j]! + 1,
        prev[j - 1]! + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      diagonal = temp;
    }
  }
  return prev[b.length]!;
}

/**
 * Used only while waiting for "who am I talking to" — in that context a single
 * mangled word is almost certainly one of the two names, so a loose match is
 * safe and saves the user repeating themselves.
 */
function fuzzyName(word: string): AiUserId | null {
  if (word.length < 4) return null;
  let best: { id: AiUserId; score: number } | null = null;
  for (const target of NAME_TARGETS) {
    const distance = editDistance(word, target.word);
    const score = 1 - distance / Math.max(word.length, target.word.length);
    if (score >= 0.6 && (!best || score > best.score)) {
      best = { id: target.id, score };
    }
  }
  return best?.id ?? null;
}

const NAME_PATTERN = Object.keys(USER_ALIASES)
  .sort((a, b) => b.length - a.length)
  .join("|");

export function parseAiUserId(value: unknown): AiUserId | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return USER_ALIASES[normalized] ?? null;
}

export function assertAiUserId(value: unknown): AiUserId {
  const parsed = parseAiUserId(value);
  if (!parsed) {
    throw new Error(`Invalid user_id. Use one of: ${AI_USER_IDS.join(", ")}.`);
  }
  return parsed;
}

export function getAiUserDisplayName(userId: AiUserId): string {
  return PERSON_LABELS[userId];
}

export const SPEAKER_CHIPS = [
  { id: "kushvanth" as const, label: PERSON_LABELS.kushvanth },
  { id: "g" as const, label: PERSON_LABELS.g },
];

/** Who is speaking — not "paid by X" on an expense. */
export function inferSpeakerFromUtterance(
  text: string,
  options?: { awaitingIdentity?: boolean }
): Person | null {
  const normalized = text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return null;

  const direct = parseAiUserId(normalized);
  if (direct) return direct;

  const identity = normalized.match(
    new RegExp(
      `\\b(?:it'?s|this is|i am|i'?m|im|my name is)\\s+(${NAME_PATTERN})\\b`
    )
  );
  if (identity) return parseAiUserId(identity[1]);

  if (/\bpaid\s+by\b/.test(normalized)) {
    return null;
  }

  const named = normalized.match(new RegExp(`\\b(${NAME_PATTERN})\\b`));
  if (!named) {
    // Waiting on "who am I talking to?" — accept a close-enough single word,
    // because STT keeps inventing new spellings of both names.
    if (options?.awaitingIdentity) {
      const words = normalized.split(" ").filter(Boolean);
      if (words.length <= 4) {
        for (const word of words) {
          const guess = fuzzyName(word);
          if (guess) return guess;
        }
      }
    }
    return null;
  }

  const words = normalized.split(" ");
  const moneyTalk = /\b(spent|spend|paid|pay|gas|dollar|dollars|expense|account)\b/.test(
    normalized
  );
  if (options?.awaitingIdentity) {
    if (moneyTalk) return null;
    return parseAiUserId(named[1]);
  }

  if (words.length <= 8 && !moneyTalk) {
    return parseAiUserId(named[1]);
  }
  return null;
}

export function speakingWithInstruction(speaker?: Person | null): string {
  if (!speaker) {
    return `WHO IS SPEAKING:
- You do not know who is talking until they say ${OWNER_LABEL} or ${MEMBER_LABEL}.
- Ask "Who am I talking to — ${OWNER_LABEL} or ${MEMBER_LABEL}?" before recording MONEY: income, expenses, debts, debt payments, account balances, new accounts. Money belongs to a person, so it cannot be filed without one.
- If they already described an expense, remember it, then ask who is speaking.
- Do NOT ask before reminders, behaviour rules, or anything else in memory. Those are shared, not one person's — asking for a name there is a question with no purpose. Handle them right away.
- Reading anything is always fine without a name.
- Never assume who it is.`;
  }

  const name = getAiUserDisplayName(speaker);
  return `WHO IS SPEAKING:
- You are talking to ${name} (${speaker}).
- "I", "me", and "I spent" mean ${name}. Record that person's money unless they say it is for both or someone else paid.
- Default paid_by and personal expense_for to ${speaker}. "We spent" / split = expense_for both, paid_by ${speaker}, unless they name the other person.`;
}

export function askWhoIsSpeakingPrompt(): string {
  return `The user just woke you. Say only: "Hey — who am I talking to, ${OWNER_LABEL} or ${MEMBER_LABEL}?" Do not call tools. Do not list questions. Do not greet twice. Do not record money until they answer.`;
}

export function speakingWithConfirmedPrompt(speaker: Person): string {
  const name = getAiUserDisplayName(speaker);
  return `App result (do not call tools): ${JSON.stringify({
    ok: true,
    speaking_with: speaker,
  })}. You are talking to ${name}. When they say I or me, that is ${name}. Record money as ${name}'s unless they say it is for both or someone else paid. Say: "Got it, ${name}." Then ask about expenses in one short English sentence.`;
}
