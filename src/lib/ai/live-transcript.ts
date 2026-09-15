export const ENGLISH_ONLY_REPLY = "Sorry, I didn't get you. I can speak only English.";

/** Indic, Arabic, CJK, Hangul — strip from voice captions. */
const NON_ENGLISH_SCRIPT =
  /[\u0900-\u097F\u0980-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0B7F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F\u0D80-\u0DFF\u0E00-\u0E7F\u0600-\u06FF\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF]/g;

const JOINABLE_WORDS = new Set([
  "account",
  "balance",
  "current",
  "costco",
  "credit",
  "debit",
  "dollar",
  "doordash",
  "edit",
  "expense",
  "green",
  "greendot",
  "grocery",
  "groceries",
  "g",
  "hundred",
  "income",
  "jarvis",
  "kushvanth",
  "rolling",
  "salaar",
  "thousand",
  "update",
  "want",
]);

function scrubTranscriptChunk(text: string): string {
  return text
    .replace(/<ctrl\d+>/gi, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(NON_ENGLISH_SCRIPT, "")
    .replace(/[括]/g, "'")
    .replace(/[\u2018\u2019\uFF07]/g, "'");
}

export function sanitizeLiveTranscript(text: string): string {
  return repairSpokenEnglish(scrubTranscriptChunk(text).replace(/\s+/g, " ").trim());
}

/** True when the text is clearly not English (Hindi/Kannada/Telugu/etc.). */
export function looksNonEnglish(text: string): boolean {
  const scripts = text.match(NON_ENGLISH_SCRIPT)?.length ?? 0;
  if (scripts < 4) return false;
  const latin = text.match(/[A-Za-z]/g)?.length ?? 0;
  return scripts > latin;
}

function looksLikeEnglishOnlyRefusal(text: string): boolean {
  const collapsed = text.toLowerCase().replace(/[^a-z]/g, "");
  return (
    collapsed.includes("canspeakonlyenglish") ||
    collapsed.includes("ispeakonlyenglish") ||
    collapsed.includes("didntgetyou")
  );
}

function joinSplitEnglishWords(text: string): string {
  const tokens = text.split(" ").filter(Boolean);
  const merged: string[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const current = tokens[index]!;
    const next = tokens[index + 1];
    if (next) {
      const glued = `${current}${next}`.toLowerCase().replace(/[^a-z]/g, "");
      if (JOINABLE_WORDS.has(glued) || glued === "greendot") {
        const originalCase =
          glued === "greendot" ? "Green Dot" : `${current}${next}`;
        merged.push(originalCase);
        index += 1;
        continue;
      }
    }
    merged.push(current);
  }

  return merged.join(" ");
}

function isShortVoiceCommit(text: string): boolean {
  return /^(yes|yeah|yep|yup|no|nope)(?:[,.]?\s+(?:please|save(?: it)?))?[.!?]*$/i.test(
    text.trim()
  );
}

function repairSpokenEnglish(text: string): string {
  if (!text) return text;
  if (looksLikeEnglishOnlyRefusal(text)) return ENGLISH_ONLY_REPLY;

  const repaired = joinSplitEnglishWords(
    text
      .replace(/\b(Green)(Dot)\b/gi, "Green Dot")
      .replace(/\bgreen\s+dog\b/gi, "Green Dot")
      .replace(/\bgreendog\b/gi, "Green Dot")
      .replace(/\bManogreen\b/gi, "Green Dot")
      .replace(/\bMano\s*green\b/gi, "Green Dot")
  );

  return repaired.replace(/\s+/g, " ").trim();
}

/**
 * Gemini Live sends transcription *deltas*. Concatenate as-is.
 * Only replace when a later chunk is clearly the full cumulative line.
 */
export function appendTranscriptFragment(previous: string, fragment: string): string {
  if (!fragment) return previous;
  if (!previous) return fragment;
  if (fragment === previous) return previous;
  if (fragment.startsWith(previous)) return fragment;
  if (previous.startsWith(fragment) && previous.length - fragment.length < 8) {
    return previous;
  }
  return previous + fragment;
}

export interface VoiceTranscriptLine {
  id: string;
  role: "user" | "model";
  text: string;
  draft?: boolean;
  created_at?: string;
}

export interface LiveTranscriptSession {
  reset: () => void;
  addUserFragment: (fragment: string, options?: { finished?: boolean; interim?: boolean }) => void;
  addModelFragment: (fragment: string, finished?: boolean) => void;
  onTurnComplete: () => void;
  onInterrupted: () => void;
  getLines: () => VoiceTranscriptLine[];
}

export function createLiveTranscriptSession(
  onChange: (lines: VoiceTranscriptLine[]) => void,
  onCommit?: (line: VoiceTranscriptLine) => void
): LiveTranscriptSession {
  let committed: VoiceTranscriptLine[] = [];
  let userBuffer = "";
  let userInterim = "";
  let modelBuffer = "";
  let delayedCommit: ReturnType<typeof setTimeout> | null = null;

  const clearDelayedCommit = () => {
    if (delayedCommit) {
      clearTimeout(delayedCommit);
      delayedCommit = null;
    }
  };

  const emit = () => {
    const drafts: VoiceTranscriptLine[] = [];
    const userText = sanitizeLiveTranscript(userBuffer || userInterim);
    if (userText) {
      drafts.push({
        id: "user-draft",
        role: "user",
        text: userText,
        draft: true,
      });
    }
    if (modelBuffer.trim()) {
      drafts.push({
        id: "model-draft",
        role: "model",
        text: sanitizeLiveTranscript(modelBuffer),
        draft: true,
      });
    }
    onChange([...committed, ...drafts]);
  };

  const commitUser = () => {
    clearDelayedCommit();
    const text = sanitizeLiveTranscript(userBuffer || userInterim);
    userBuffer = "";
    userInterim = "";
    if (!text) {
      emit();
      return;
    }
    committed = [
      ...committed,
      { id: `user-${Date.now()}`, role: "user", text, created_at: new Date().toISOString() },
    ];
    onCommit?.(committed[committed.length - 1]!);
    emit();
  };

  const scheduleDelayedUserCommit = () => {
    clearDelayedCommit();
    delayedCommit = setTimeout(() => {
      delayedCommit = null;
      const text = sanitizeLiveTranscript(userBuffer || userInterim);
      if (isShortVoiceCommit(text)) commitUser();
    }, 950);
  };

  const commitModel = () => {
    const text = sanitizeLiveTranscript(modelBuffer);
    modelBuffer = "";
    if (!text) {
      emit();
      return;
    }
    const last = committed[committed.length - 1];
    if (last?.role === "model" && last.text === text) {
      emit();
      return;
    }
    committed = [
      ...committed,
      { id: `model-${Date.now()}`, role: "model", text, created_at: new Date().toISOString() },
    ];
    onCommit?.(committed[committed.length - 1]!);
    emit();
  };

  return {
    reset() {
      clearDelayedCommit();
      committed = [];
      userBuffer = "";
      userInterim = "";
      modelBuffer = "";
      emit();
    },
    addUserFragment(fragment, options) {
      const chunk = scrubTranscriptChunk(fragment);
      if (!chunk.replace(/\s/g, "")) return;
      const incoming = sanitizeLiveTranscript(chunk);

      if (options?.interim) {
        if (
          userBuffer &&
          incoming &&
          !incoming.toLowerCase().startsWith(userBuffer.toLowerCase()) &&
          !isShortVoiceCommit(incoming)
        ) {
          userBuffer = sanitizeLiveTranscript(`${userBuffer} ${incoming}`);
          userInterim = "";
          if (!isShortVoiceCommit(userBuffer)) clearDelayedCommit();
          emit();
          return;
        }
        userInterim = incoming;
        emit();
        const current = sanitizeLiveTranscript(userBuffer || userInterim);
        if (isShortVoiceCommit(current) && !options.finished) {
          if (!userBuffer) userBuffer = current;
          scheduleDelayedUserCommit();
        } else if (!isShortVoiceCommit(current)) {
          clearDelayedCommit();
        }
        return;
      }

      userInterim = "";
      const spaced =
        userBuffer && chunk && !chunk.startsWith(" ") && !userBuffer.endsWith(" ")
          ? ` ${chunk}`
          : chunk;
      userBuffer = appendTranscriptFragment(userBuffer, spaced);
      const text = sanitizeLiveTranscript(userBuffer);
      emit();
      if (options?.finished && !isShortVoiceCommit(text)) {
        commitUser();
        return;
      }
      if (isShortVoiceCommit(text)) {
        scheduleDelayedUserCommit();
        return;
      }
      clearDelayedCommit();
      if (options?.finished) commitUser();
    },
    addModelFragment(fragment, finished) {
      const chunk = scrubTranscriptChunk(fragment);
      if (!chunk.replace(/\s/g, "")) return;
      if (userBuffer.trim() || userInterim.trim()) commitUser();
      modelBuffer = appendTranscriptFragment(modelBuffer, chunk);
      emit();
      if (finished) commitModel();
    },
    onTurnComplete() {
      const text = sanitizeLiveTranscript(userBuffer || userInterim);
      if (isShortVoiceCommit(text)) {
        scheduleDelayedUserCommit();
        commitModel();
        return;
      }
      commitUser();
      commitModel();
    },
    onInterrupted() {
      modelBuffer = "";
      emit();
    },
    getLines() {
      return committed;
    },
  };
}
