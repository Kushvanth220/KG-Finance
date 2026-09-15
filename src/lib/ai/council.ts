import { MEMBERS_LABEL, OWNER_LABEL, MEMBER_LABEL } from "@/lib/branding";
import {
  continueGeminiWithToolResults,
  generateGeminiPlainReply,
  generateGeminiReply,
  type GeminiChatOutcome,
  type GeminiChatTurn,
  type GeminiToolResponseInput,
} from "@/lib/ai/gemini-client";
import {
  generateChatGptReply,
  generateClaudeReply,
  getAiProviderStatus,
  type AiProviderId,
} from "@/lib/ai/providers";
import { ASSISTANT_WRITE_TOOLS, spokenSaveConfirmation } from "@/lib/ai/assistant-confirmation";
import type { AssistantToolCall } from "@/lib/ai/tools";
import { buildSystemInstruction } from "@/lib/ai/system-instructions";
import { inferAssistantToolCall } from "@/lib/ai/infer-write-intent";
import type { AiUserId } from "@/lib/ai/person";
import type { Part } from "@google/generative-ai";

export type CouncilChatOutcome = GeminiChatOutcome & {
  providers: AiProviderId[];
};

/** The workspace system prompt is large — give each hidden layer room to finish before it's dropped. */
const HIDDEN_LAYER_TIMEOUT_MS = 6000;

/** What the request is actually doing right now — reported to the client as it happens. */
export type CouncilStage = "input" | "draft" | "review" | "merge" | "output";

export type LayerStatus = "pending" | "answered" | "failed" | "skipped";

/** Gemini runs on a free tier; ChatGPT and Claude are billed per token. */
export type LayerRole = "free" | "paid";

export const LAYER_ROLES: Record<AiProviderId, LayerRole> = {
  gemini: "free",
  chatgpt: "paid",
  claude: "paid",
};

export interface CouncilProgress {
  onStage?: (stage: CouncilStage) => void;
  onLayer?: (
    id: AiProviderId,
    status: LayerStatus,
    meta?: { ms?: number; role?: LayerRole }
  ) => void;
  /** Whether the paid review ran this turn, and why — drives the UI and the savings note. */
  onCascade?: (info: { reviewed: boolean; reason: string }) => void;
}

/**
 * Report each layer the moment it settles, rather than after all of them do —
 * this is what makes the client's graph reflect real timing.
 */
function trackLayer<T>(
  id: AiProviderId,
  promise: Promise<T>,
  isUsable: (value: T) => boolean,
  progress?: CouncilProgress
): Promise<T> {
  const startedAt = Date.now();
  return promise.then(
    (value) => {
      const ms = Date.now() - startedAt;
      progress?.onLayer?.(id, isUsable(value) ? "answered" : "failed", {
        ms,
        role: LAYER_ROLES[id],
      });
      return value;
    },
    (error) => {
      const ms = Date.now() - startedAt;
      progress?.onLayer?.(id, "failed", { ms, role: LAYER_ROLES[id] });
      // Layer errors are swallowed by allSettled — log them or a provider can
      // sit broken (wrong model, no credits) while the UI still shows it "Live".
      console.warn(
        `[council] ${id} failed after ${ms}ms:`,
        error instanceof Error ? error.message : error
      );
      throw error;
    }
  );
}

interface CouncilRequest {
  userId: AiUserId;
  financeContext: string;
  assistantName?: string;
  behaviorInstructions?: string[];
  reminders?: string[];
  rules?: string[];
  speakingWith?: AiUserId | null;
  history: GeminiChatTurn[];
  message: string;
  progress?: CouncilProgress;
}

interface HiddenCandidate {
  id: AiProviderId;
  text: string;
}

const HIDDEN_LAYER_RULES = `You are one hidden layer in a 3-model network (Gemini, ChatGPT, Claude). All three are equals.
Answer the user's finance question yourself. Do not wait for another model.
ALWAYS reply in English, whatever language the user used. Never mirror their language, never mix languages, never output non-English script. Short. Warm. One question at a time.
Never invent balances or transactions — use the finance snapshot.
NEVER say you updated, adjusted, saved, or recorded money unless this turn includes a tool result with saved true.
If they want to change Green Dot or any account balance and already gave the number, call the tool — do not only talk.
If they say yes after a balance/expense preview, call the write tool with user_confirmed true. Do not say "updating now."
If they ask to remember/remind something, call save_reminder. Do not talk about account balances.
Never mention Gemini, ChatGPT, Claude, OpenAI, Anthropic, or that you are a hidden layer.`;

/**
 * The paid layers no longer re-answer the question from scratch — they check the
 * free layer's draft. This is the whole cost saving: the full workspace prompt is
 * ~5,000 input tokens, this one is ~235, so a review costs about an eighth of an
 * independent answer while still catching bad arithmetic and invented balances.
 */
const REVIEW_LAYER_RULES = `You are checking one draft reply for a shared finance assistant used by ${MEMBERS_LABEL}.

If the draft is correct, complete, and safe, reply with exactly: APPROVE
Otherwise reply with the corrected message only — one or two short sentences, then at most one question. No preamble, no explanation of what you changed, no mention of a draft or a review.

Reject or fix a draft that: gets arithmetic wrong, splits an amount into shares that do not add up to the total, states a balance that contradicts the facts given, claims money was saved or recorded, or contains non-English text.
Never claim anything was saved. English only.`;

/** Reviewer said the draft was fine, in any of the shapes models actually emit. */
function isApproval(text: string): boolean {
  return /^\s*approve\b[.!]?\s*$/i.test(text);
}

/**
 * Deciding when a second opinion is worth real money. Arithmetic and shared-bill
 * splits are exactly where a wrong answer costs them, so those always escalate;
 * greetings and one-word turns never do.
 */
function reviewDecision(draft: string, userMessage: string): { reviewed: boolean; reason: string } {
  const msg = userMessage.trim();
  const hasMoney = /\$\s?\d|\b\d+\.\d{2}\b/.test(draft);
  const asksForMath =
    /\b(split|divide|share|total|breakdown|how much|net worth|owes?|balance|sum|each|left|per person)\b/i.test(
      msg
    );
  const smallTalk =
    /^(hi|hey|hello|yo|good (morning|afternoon|evening|night)|thanks|thank you|ok|okay|yes|yeah|no|nope|bye)\b/i.test(
      msg
    );

  if (hasMoney) return { reviewed: true, reason: "money in the answer" };
  if (asksForMath) return { reviewed: true, reason: "asked for a calculation" };
  if (smallTalk) return { reviewed: false, reason: "small talk" };
  if (draft.length > 200) return { reviewed: true, reason: "long answer" };
  return { reviewed: false, reason: "simple answer" };
}

/** Compact facts for the reviewer — enough to catch an invented balance, no more. */
function reviewFacts(financeContext: string): string {
  return financeContext.slice(0, 700);
}

const OUTPUT_LAYER_RULES = `You are the output layer of a 3-model network.
Three hidden layers answered independently. Produce ONE best reply, always in English — never in another language and never mixing languages, regardless of what the user wrote.
Keep correct numbers. Drop guesses that conflict with the finance snapshot.
NEVER claim a balance/expense/income was saved unless a hidden layer cites a tool result with saved true.
If any hidden layer pretended a save happened, discard that and ask for the missing number or a yes instead.
One or two short sentences, then at most one question.
Never mention the models or that this was a vote.`;

/**
 * Hard guard, not just a prompt rule: any reply containing non-Latin script is
 * rejected so another layer's English answer wins instead. Covers Devanagari,
 * Bengali, Gurmukhi, Gujarati, Odia, Tamil, Telugu, Kannada, Malayalam,
 * Sinhala, Thai, Arabic, Hiragana/Katakana, CJK and Hangul.
 */
const NON_ENGLISH_OUTPUT =
  /[ऀ-ॿঀ-৿਀-੿઀-૿଀-୿஀-௿ఀ-౿ಀ-೿ഀ-ൿ඀-෿฀-๿؀-ۿ぀-ヿ一-鿿가-힯]/;

export function isEnglishOutput(text: string): boolean {
  return !NON_ENGLISH_OUTPUT.test(text);
}

function isUsableReply(text: string | null | undefined): text is string {
  if (!text) return false;
  const trimmed = text.trim();
  if (trimmed.length < 2 || trimmed.length > 800) return false;
  if (!isEnglishOutput(trimmed)) return false;
  if (
    /as an ai|language model|chatgpt|openai|gemini|claude|anthropic|hidden layer/i.test(
      trimmed
    )
  ) {
    return false;
  }
  return true;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9$]+/g, " ")
      .split(" ")
      .filter((word) => word.length > 2)
  );
}

function overlap(a: string, b: string): number {
  const left = tokenize(a);
  const right = tokenize(b);
  if (left.size === 0 || right.size === 0) return 0;
  let hits = 0;
  for (const word of left) {
    if (right.has(word)) hits += 1;
  }
  return hits / Math.min(left.size, right.size);
}

function pickBestCandidate(candidates: HiddenCandidate[]): HiddenCandidate {
  if (candidates.length === 1) return candidates[0]!;

  let best = candidates[0]!;
  let bestScore = -1;

  for (const candidate of candidates) {
    const agreement = candidates
      .filter((other) => other.id !== candidate.id)
      .reduce((sum, other) => sum + overlap(candidate.text, other.text), 0);
    const lengthScore = candidate.text.length >= 24 && candidate.text.length <= 420 ? 0.15 : 0;
    const score = agreement + lengthScore;
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return best;
}

function hiddenUserPayload(options: CouncilRequest, extra?: string): string {
  const historyBlock = options.history
    .slice(-8)
    .map((turn) => `${turn.role}: ${turn.content}`)
    .join("\n");
  return [
    extra,
    historyBlock,
    options.speakingWith ? `You are talking to ${options.speakingWith}.` : "You do not know who is speaking yet. Ask first.",
    `user: ${options.message}`,
    "Answer as the finance AI.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Draft → review cascade.
 *
 * Step 1 runs the FREE layer (Gemini) with the full workspace prompt; it also
 * drives tool calls. Step 2 asks the PAID layers to check that draft with a tiny
 * prompt, but only when a second opinion is worth paying for. Previously all
 * three answered independently off the same ~5,000-token prompt, so every turn
 * billed two full-price answers whether or not they added anything.
 */
async function runCascade(
  options: CouncilRequest,
  extra?: string,
  skipGemini = false
): Promise<{ gemini: GeminiChatOutcome | null; candidates: HiddenCandidate[] }> {
  const status = getAiProviderStatus();
  const configured = (id: AiProviderId) => Boolean(status.find((item) => item.id === id)?.configured);
  const { progress } = options;

  const fullSystem = [
    buildSystemInstruction(options.financeContext, {
      assistantName: options.assistantName,
      behaviorInstructions: options.behaviorInstructions,
      reminders: options.reminders,
      rules: options.rules,
      speakingWith: options.speakingWith,
    }),
    HIDDEN_LAYER_RULES,
  ].join("\n\n");
  const user = hiddenUserPayload(options, extra);

  const geminiOn = !skipGemini && configured("gemini");
  const paidLayers = (["chatgpt", "claude"] as const).filter(configured);

  // ---- Step 1: the free draft ------------------------------------------
  progress?.onStage?.("draft");
  if (geminiOn) progress?.onLayer?.("gemini", "pending", { role: "free" });
  else progress?.onLayer?.("gemini", "failed", { role: "free" });

  let gemini: GeminiChatOutcome | null = null;
  if (geminiOn) {
    try {
      const draftPromise: Promise<GeminiChatOutcome> = extra
        ? generateGeminiPlainReply(fullSystem, user).then(
            (reply) => ({ kind: "reply" as const, reply }) satisfies GeminiChatOutcome
          )
        : generateGeminiReply(options);
      gemini = await trackLayer<GeminiChatOutcome>(
        "gemini",
        draftPromise,
        // A tool call is real work too, not just a text reply.
        (outcome: GeminiChatOutcome) =>
          outcome.kind === "tool_calls" || isUsableReply(outcome.reply),
        progress
      );
    } catch {
      gemini = null;
    }
  }

  // A tool call goes straight to the app's confirmation gate — nothing to review.
  if (gemini?.kind === "tool_calls") {
    for (const id of paidLayers) progress?.onLayer?.(id, "skipped", { role: "paid" });
    progress?.onCascade?.({ reviewed: false, reason: "tool call — no review needed" });
    return { gemini, candidates: [] };
  }

  const draft = gemini?.kind === "reply" && isUsableReply(gemini.reply) ? gemini.reply : null;

  // ---- Fallback: no free draft, so the paid layers answer in full ------
  if (!draft) {
    if (paidLayers.length === 0) return { gemini, candidates: [] };
    progress?.onStage?.("review");
    for (const id of paidLayers) progress?.onLayer?.(id, "pending", { role: "paid" });
    progress?.onCascade?.({ reviewed: true, reason: "free layer unavailable" });

    const settled = await Promise.allSettled(
      paidLayers.map((id) =>
        trackLayer(
          id,
          withTimeout(
            id === "chatgpt"
              ? generateChatGptReply(fullSystem, user)
              : generateClaudeReply(fullSystem, user),
            HIDDEN_LAYER_TIMEOUT_MS
          ),
          isUsableReply,
          progress
        )
      )
    );
    const candidates: HiddenCandidate[] = [];
    settled.forEach((result, index) => {
      if (result.status === "fulfilled" && isUsableReply(result.value)) {
        candidates.push({ id: paidLayers[index]!, text: result.value });
      }
    });
    return { gemini, candidates };
  }

  const candidates: HiddenCandidate[] = [{ id: "gemini", text: draft }];

  // ---- Step 2: is a paid second opinion worth it? ----------------------
  const decision = reviewDecision(draft, options.message);
  progress?.onCascade?.(decision);

  if (!decision.reviewed || paidLayers.length === 0) {
    for (const id of paidLayers) progress?.onLayer?.(id, "skipped", { role: "paid" });
    return { gemini, candidates };
  }

  progress?.onStage?.("review");
  for (const id of paidLayers) progress?.onLayer?.(id, "pending", { role: "paid" });

  const reviewUser = [
    `Question: ${options.message}`,
    `Facts: ${reviewFacts(options.financeContext)}`,
    `Draft: ${draft}`,
  ].join("\n\n");

  const reviews = await Promise.allSettled(
    paidLayers.map((id) =>
      trackLayer(
        id,
        withTimeout(
          id === "chatgpt"
            ? generateChatGptReply(REVIEW_LAYER_RULES, reviewUser)
            : generateClaudeReply(REVIEW_LAYER_RULES, reviewUser),
          HIDDEN_LAYER_TIMEOUT_MS
        ),
        // An APPROVE is a valid, useful answer even though it is not a reply.
        (text) => isApproval(text) || isUsableReply(text),
        progress
      )
    )
  );

  // A correction becomes a candidate; a bare APPROVE just endorses the draft.
  reviews.forEach((result, index) => {
    if (result.status !== "fulfilled") return;
    const text = result.value.trim();
    if (isApproval(text) || !isUsableReply(text)) return;
    candidates.push({ id: paidLayers[index]!, text });
  });

  return { gemini, candidates };
}

const HONEST_SAVE_PROMPT =
  "Nothing was saved yet. Tell me the new amount and which account. I'll read it back, then say yes so I can save it on Accounts and History.";

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function claimsMoneyWasSaved(text: string): boolean {
  const t = text.toLowerCase().replace(/\s+/g, " ");
  return (
    /\b(i('ve| have)? (just )?(updated|adjusted|saved|recorded|changed|set))\b/.test(t) ||
    /\b(updated|adjusted|saved|recorded)\b.{0,50}\b(balance|green\s*dot|account|expense|income)\b/.test(t) ||
    /\b(the )?(expense|expenses|income|balance) (is|are|was|were) (now )?(recorded|updated|saved)\b/.test(t) ||
    /\byes[,.]? (the )?(expense|expenses) (is|are) recorded\b/.test(t) ||
    /\bbalance (is|was|has been) (now )?(updated|adjusted|set|saved)\b/.test(t) ||
    /\bgot it[.!,]?\s+i('ll| will) (update|adjust|save|record)\b/.test(t) ||
    /\bi('ll| will) update (the )?(green\s*dot|balance|account)\b/.test(t) ||
    /\b(updating|saving|recording) now\b/.test(t)
  );
}

function spokenReplyForSavedTools(responses: GeminiToolResponseInput[]): string {
  const saved = responses.find((item) => {
    const result = item.result as Record<string, unknown> | undefined;
    return result?.saved === true;
  });
  if (!saved) return "Got it.";
  return spokenSaveConfirmation({
    id: saved.id,
    name: saved.name,
    args: {},
  } as AssistantToolCall);
}

function looksLikeReminder(message: string): boolean {
  return /\b(remember|reminder|remind me|don't forget|dont forget)\b/i.test(message);
}

function looksLikeMoneyWrite(message: string): boolean {
  const t = message.toLowerCase();
  if (looksLikeReminder(t)) return false;
  return (
    /\b(update|adjust|set|change)\b.{0,48}\b(balance|green\s*dot|account)\b/.test(t) ||
    /\b(record|log|deposit|income|expense|spent|paid)\b/.test(t) ||
    /\b(add|pay)\b.{0,24}\bdebt\b/.test(t) ||
    /\bgreen\s*dot\b/.test(t)
  );
}

function isAffirmation(message: string): boolean {
  return /^(yes|yeah|yep|yup|ok|okay|correct|that's right|thats right|save it|do it|confirm)\b/i.test(
    message.trim()
  );
}

function shouldBlockFakeMoneySave(options: { message: string; history: { content: string }[] }): boolean {
  if (looksLikeReminder(options.message)) return false;
  if (looksLikeMoneyWrite(options.message) || isAffirmation(options.message)) return true;
  return options.history.slice(-4).some((turn) => looksLikeMoneyWrite(turn.content));
}

function honestCandidates(
  candidates: HiddenCandidate[],
  fallback: string
): HiddenCandidate[] {
  const honest = candidates.filter((item) => !claimsMoneyWasSaved(item.text));
  if (honest.length > 0) return honest;
  return [{ id: "gemini", text: fallback }];
}

function toolResultsSaved(responses: GeminiToolResponseInput[]): boolean {
  return responses.some((item) => {
    const result = item.result as Record<string, unknown> | undefined;
    if (!result) return false;
    if (result.saved === true) return true;
    return ASSISTANT_WRITE_TOOLS.has(item.name) && result.ok === true;
  });
}

async function outputLayer(
  options: CouncilRequest,
  candidates: HiddenCandidate[]
): Promise<{ reply: string; providers: AiProviderId[] }> {
  const providers = candidates.map((item) => item.id);
  if (candidates.length === 0) {
    throw new Error("All hidden layers failed.");
  }
  options.progress?.onStage?.("merge");
  if (candidates.length === 1) {
    return { reply: candidates[0]!.text, providers };
  }

  const consensus = candidates.every(
    (item) => overlap(item.text, candidates[0]!.text) >= 0.5
  );
  if (consensus) {
    return { reply: pickBestCandidate(candidates).text, providers };
  }

  const snapshot = options.financeContext.slice(0, 2500);
  const synthesisUser = `User asked: ${options.message}

Finance snapshot:
${snapshot}

Hidden layer Gemini: ${candidates.find((item) => item.id === "gemini")?.text ?? "(no reply)"}
Hidden layer ChatGPT: ${candidates.find((item) => item.id === "chatgpt")?.text ?? "(no reply)"}
Hidden layer Claude: ${candidates.find((item) => item.id === "claude")?.text ?? "(no reply)"}

Return only the single best reply.`;

  const status = getAiProviderStatus();
  const configured = (id: AiProviderId) =>
    status.find((item) => item.id === id)?.configured;

  /** Only a usable reply counts, so Promise.any skips duds instead of picking one. */
  const usableOnly = (promise: Promise<string>) =>
    promise.then((text) => {
      if (!isUsableReply(text)) throw new Error("Unusable synthesis.");
      return text;
    });

  // Take the first good merge rather than waiting on all three — this step used
  // to add several seconds for a reply only one model's output survives anyway.
  try {
    const merged = await Promise.any(
      [
        configured("gemini")
          ? usableOnly(
              withTimeout(
                generateGeminiPlainReply(OUTPUT_LAYER_RULES, synthesisUser),
                HIDDEN_LAYER_TIMEOUT_MS
              )
            )
          : null,
        configured("chatgpt")
          ? usableOnly(
              withTimeout(
                generateChatGptReply(OUTPUT_LAYER_RULES, synthesisUser),
                HIDDEN_LAYER_TIMEOUT_MS
              )
            )
          : null,
        configured("claude")
          ? usableOnly(
              withTimeout(
                generateClaudeReply(OUTPUT_LAYER_RULES, synthesisUser),
                HIDDEN_LAYER_TIMEOUT_MS
              )
            )
          : null,
      ].filter((item): item is Promise<string> => item !== null)
    );
    return { reply: merged, providers };
  } catch {
    // Every merge attempt failed — fall back to the best raw candidate.
    return { reply: pickBestCandidate(candidates).text, providers };
  }
}

export async function generateCouncilReply(options: CouncilRequest): Promise<CouncilChatOutcome> {
  const { gemini, candidates } = await runCascade(options);

  if (gemini?.kind === "tool_calls") {
    return { ...gemini, providers: ["gemini", ...candidates.map((item) => item.id).filter((id) => id !== "gemini")] };
  }

  const inferred = inferAssistantToolCall(options.message, options.history, options.speakingWith);
  if (inferred) {
    return {
      kind: "tool_calls",
      toolCalls: [inferred.call],
      modelParts: inferred.modelParts as never,
      providers: ["gemini", ...candidates.map((item) => item.id)],
    };
  }

  if (candidates.length === 0) {
    throw new Error("Gemini, ChatGPT, and Claude all failed to answer.");
  }

  const blockFake = shouldBlockFakeMoneySave(options);
  const output = await outputLayer(
    options,
    blockFake ? honestCandidates(candidates, HONEST_SAVE_PROMPT) : candidates
  );
  const reply =
    blockFake && claimsMoneyWasSaved(output.reply) ? HONEST_SAVE_PROMPT : output.reply;
  options.progress?.onStage?.("output");
  return { kind: "reply", reply, providers: output.providers };
}

function waitingOnUserReply(responses: GeminiToolResponseInput[]): string | null {
  for (const item of responses) {
    const result = item.result as Record<string, unknown> | undefined;
    if (!result) continue;
    if (result.status === "needs_confirmation") {
      const preview = typeof result.preview === "string" ? result.preview : "";
      return preview
        ? `${preview} Tap Yes, save when that looks right.`
        : "Tap Yes, save when that looks right.";
    }
    if (result.needs_cash_source === true) {
      return String(result.error ?? "Cash wallet is low — which account did the cash come from?");
    }
    if (result.needs_payer === true) {
      return String(result.error ?? `Who paid — ${OWNER_LABEL}, ${MEMBER_LABEL}, or both?`);
    }
    if (result.needs_speaker === true) {
      return String(result.error ?? `Who am I talking to — ${OWNER_LABEL} or ${MEMBER_LABEL}?`);
    }
    if (result.needs_account === true) {
      return String(result.error ?? "Which account should I use?");
    }
  }
  return null;
}

export async function continueCouncilWithToolResults(
  options: CouncilRequest & {
    userMessage: string;
    modelParts: Part[];
    toolResponses: GeminiToolResponseInput[];
  }
): Promise<CouncilChatOutcome> {
  if (toolResultsSaved(options.toolResponses)) {
    return {
      kind: "reply",
      reply: spokenReplyForSavedTools(options.toolResponses),
      providers: ["gemini"],
    };
  }

  const waitingReply = waitingOnUserReply(options.toolResponses);
  if (waitingReply) {
    return {
      kind: "reply",
      reply: waitingReply,
      providers: ["gemini"],
    };
  }

  const toolSummary = options.toolResponses
    .map((item) => `${item.name}: ${JSON.stringify(item.result)}`)
    .join("\n");

  const [geminiSettled, hidden] = await Promise.all([
    continueGeminiWithToolResults(options).then(
      (value) => ({ ok: true as const, value }),
      () => ({ ok: false as const, value: null })
    ),
    runCascade(
      { ...options, message: options.userMessage },
      `App tools already ran. Results:\n${toolSummary}\nWrite the user-facing reply only. Do not call tools.`,
      true
    ),
  ]);

  const geminiResult = geminiSettled.ok ? geminiSettled.value : null;

  if (geminiResult?.kind === "tool_calls") {
    return { ...geminiResult, providers: ["gemini"] };
  }

  const candidates = hidden.candidates.filter((item) => item.id !== "gemini");
  if (geminiResult?.kind === "reply" && isUsableReply(geminiResult.reply)) {
    candidates.unshift({ id: "gemini", text: geminiResult.reply });
  }

  if (candidates.length === 0) {
    throw new Error("All hidden layers failed after tools.");
  }

  const saved = toolResultsSaved(options.toolResponses);
  const blockFake = !saved && shouldBlockFakeMoneySave({
    message: options.userMessage,
    history: options.history,
  });
  const output = await outputLayer(
    { ...options, message: options.userMessage },
    blockFake ? honestCandidates(candidates, HONEST_SAVE_PROMPT) : candidates
  );
  const reply =
    blockFake && claimsMoneyWasSaved(output.reply) ? HONEST_SAVE_PROMPT : output.reply;
  options.progress?.onStage?.("output");
  return { kind: "reply", reply, providers: output.providers };
}
