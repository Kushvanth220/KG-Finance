import type { Person } from "@/types";

export const ASSISTANT_MIC_READY_EVENT = "assistant-mic-ready";

export const WAKE_GREETINGS = [
  "hey",
  "hay",
  "hi",
  "high",
  "hello",
  "hella",
  "helo",
  "hullo",
  "howdy",
  "yo",
  "ok",
  "okay",
] as const;

const JARVIS_ALIASES = [
  "jarvis",
  "jar vis",
  "jarviss",
  "jarvish",
  "jervis",
  "gervis",
  "javis",
  "jarvus",
];

const SIRI_ALIASES = ["siri", "series", "seeri"];

const SALAAR_ALIASES = ["salaar", "salar", "salah", "sallar"];

function nameAliases(assistantName: string): string[] {
  const name = normalizeWakeText(assistantName);
  const extras = [...SIRI_ALIASES];
  if (!name) return extras;
  if (name === "jarvis") return [...JARVIS_ALIASES, ...extras];
  if (SALAAR_ALIASES.includes(name) || name === "salaar") {
    return [...SALAAR_ALIASES, ...extras];
  }
  if (SIRI_ALIASES.includes(name)) return [...SIRI_ALIASES];
  return [name, ...extras];
}

export function normalizeWakeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collapsed(text: string) {
  return normalizeWakeText(text).replace(/\s+/g, "");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsGreeting(text: string): boolean {
  const normalized = normalizeWakeText(text);
  const mashed = collapsed(text);
  return WAKE_GREETINGS.some((greeting) => {
    if (new RegExp(`\\b${escapeRegExp(greeting)}\\b`, "i").test(normalized)) return true;
    if (normalized.startsWith(`${greeting} `)) return true;
    return mashed.startsWith(greeting);
  });
}

function nameMatchesText(text: string, assistantName: string): boolean {
  const aliases = nameAliases(assistantName);
  if (aliases.length === 0) return false;

  const normalized = normalizeWakeText(text);
  if (!normalized) return false;
  const collapsedText = collapsed(text);

  for (const alias of aliases) {
    const wordPattern = new RegExp(`\\b${escapeRegExp(alias)}\\b`, "i");
    if (wordPattern.test(normalized)) return true;

    const collapsedName = collapsed(alias);
    if (collapsedName.length >= 2 && collapsedText.includes(collapsedName)) {
      return true;
    }
  }

  return false;
}

/** "Hey Jarvis", "Hi Jarvis", "hellojarvis" (no space), or the name alone. */
export function transcriptContainsWakePhrase(transcript: string, assistantName: string): boolean {
  const text = normalizeWakeText(transcript);
  if (!text) return false;

  const mashed = collapsed(text);
  const aliases = nameAliases(assistantName);

  for (const greeting of WAKE_GREETINGS) {
    for (const alias of aliases) {
      const combo = collapsed(`${greeting}${alias}`);
      if (mashed === combo || mashed.startsWith(combo) || mashed.includes(combo)) {
        return true;
      }
    }
  }

  if (!nameMatchesText(text, assistantName)) return false;
  if (containsGreeting(text)) return true;

  const collapsedName = collapsed(assistantName);
  if (!collapsedName) return false;
  if (mashed === collapsedName) return true;
  if (mashed.startsWith(collapsedName)) return true;

  return false;
}

export function formatWakePhrase(assistantName: string): string {
  return `Hey ${assistantName.trim()}`;
}

export function formatWakeHint(assistantName: string): string {
  const name = assistantName.trim() || "Jarvis";
  return `Hey / Hi / Hello ${name} (or hey${name.toLowerCase()})`;
}

export function buildRecognitionTranscript(
  results: { length: number; [index: number]: { 0: { transcript: string } } }
): string {
  const parts: string[] = [];
  for (let index = 0; index < results.length; index += 1) {
    const line = results[index]?.[0]?.transcript?.trim();
    if (line) parts.push(line);
  }
  return parts.join(" ").trim();
}

/**
 * Pick exactly one person — longest matching name wins.
 */
export function resolveWakePerson(
  transcript: string,
  entries: Array<{ person: Person; name: string }>
): Person | null {
  const matches = entries.filter((entry) => transcriptContainsWakePhrase(transcript, entry.name));
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0]!.person;

  matches.sort(
    (a, b) => normalizeWakeText(b.name).length - normalizeWakeText(a.name).length
  );
  return matches[0]!.person;
}

export function wakeNamesAreTooSimilar(
  entries: Array<{ person: Person; name: string }>
): boolean {
  const normalized = entries.map((entry) => normalizeWakeText(entry.name)).filter(Boolean);
  for (let i = 0; i < normalized.length; i += 1) {
    for (let j = i + 1; j < normalized.length; j += 1) {
      const a = normalized[i]!;
      const b = normalized[j]!;
      if (a === b || a.startsWith(b) || b.startsWith(a)) return true;
    }
  }
  return false;
}
