import {
  GoogleGenerativeAI,
  type Content,
  type FunctionCall,
  type Part,
  type Tool,
} from "@google/generative-ai";
import { buildSystemInstruction, GEMINI_MODEL } from "@/lib/ai/system-instructions";
import { recordAiUsage } from "@/lib/ai/usage";

function noteGeminiUsage(
  result: { response: { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } } },
  purpose: string
) {
  const usage = result.response.usageMetadata;
  if (!usage) return;
  recordAiUsage({
    provider: "gemini",
    model: GEMINI_MODEL,
    inputTokens: usage.promptTokenCount ?? 0,
    outputTokens: usage.candidatesTokenCount ?? 0,
    purpose,
  });
}
import { ASSISTANT_TOOLS, type AssistantToolCall } from "@/lib/ai/tools";
import { readGeminiApiKey } from "@/lib/ai/env";
import type { AiUserId } from "@/lib/ai/person";
import type { Person } from "@/types";

export interface GeminiChatTurn {
  role: "user" | "model";
  content: string;
}

export interface GeminiToolResponseInput {
  id: string;
  name: string;
  result: Record<string, unknown>;
}

export type GeminiChatOutcome =
  | { kind: "reply"; reply: string }
  | { kind: "tool_calls"; toolCalls: AssistantToolCall[]; modelParts: Part[] };

export function getGeminiApiKey(): string {
  const key = readGeminiApiKey();
  if (!key) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }
  return key;
}

function buildModel(
  financeContext: string,
  assistantName?: string,
  behaviorInstructions: string[] = [],
  reminders: string[] = [],
  speakingWith?: Person | null
) {
  const client = new GoogleGenerativeAI(getGeminiApiKey());
  return client.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction: buildSystemInstruction(financeContext, {
      assistantName,
      behaviorInstructions,
      reminders,
      speakingWith,
    }),
    tools: ASSISTANT_TOOLS as Tool[],
  });
}

/**
 * Gemini rejects a history whose first turn is from the model
 * ("First content should be with role 'user', got model") and fails in 0ms.
 * That happens whenever the assistant spoke first or the 8-turn window happens
 * to start on a model reply. Drop the leading model turns so the draft layer
 * actually runs — when it fails, the cascade falls back to the paid layers on
 * the full prompt, which is the most expensive path there is.
 */
function mapHistory(history: GeminiChatTurn[]): Content[] {
  const firstUser = history.findIndex((turn) => turn.role === "user");
  const usable = firstUser === -1 ? [] : history.slice(firstUser);
  return usable.map((turn) => ({
    role: turn.role,
    parts: [{ text: turn.content }],
  }));
}

function extractToolCalls(functionCalls: FunctionCall[] | undefined): AssistantToolCall[] {
  if (!functionCalls?.length) return [];
  return functionCalls.map((call, index) => ({
    id: `${call.name ?? "tool"}-${index}`,
    name: call.name ?? "unknown",
    args: (call.args ?? {}) as Record<string, unknown>,
  }));
}

function parseGeminiResult(
  functionCalls: FunctionCall[] | undefined,
  modelParts: Part[]
): GeminiChatOutcome {
  const toolCalls = extractToolCalls(functionCalls);
  if (toolCalls.length > 0) {
    return { kind: "tool_calls", toolCalls, modelParts };
  }

  const text = modelParts
    .map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return { kind: "reply", reply: text };
}

export async function generateGeminiPlainReply(systemInstruction: string, user: string): Promise<string> {
  const client = new GoogleGenerativeAI(getGeminiApiKey());
  const model = client.getGenerativeModel({
    model: GEMINI_MODEL,
    systemInstruction,
  });
  const result = await model.generateContent(user);
  noteGeminiUsage(result, "plain");
  const text = result.response.text()?.trim();
  if (!text) throw new Error("Gemini returned an empty response.");
  return text;
}

export async function generateGeminiReply(options: {
  userId: AiUserId;
  financeContext: string;
  assistantName?: string;
  behaviorInstructions?: string[];
  reminders?: string[];
  speakingWith?: Person | null;
  history: GeminiChatTurn[];
  message: string;
}): Promise<GeminiChatOutcome> {
  const model = buildModel(
    options.financeContext,
    options.assistantName,
    options.behaviorInstructions ?? [],
    options.reminders ?? [],
    options.speakingWith
  );
  const chat = model.startChat({ history: mapHistory(options.history) });
  const result = await chat.sendMessage(options.message);
  noteGeminiUsage(result, "chat");
  return parseGeminiResult(
    result.response.functionCalls(),
    result.response.candidates?.[0]?.content?.parts ?? []
  );
}

/** Continue after client executed tools — replays user turn + model function call + results. */
export async function continueGeminiWithToolResults(options: {
  userId: AiUserId;
  financeContext: string;
  assistantName?: string;
  behaviorInstructions?: string[];
  reminders?: string[];
  speakingWith?: Person | null;
  history: GeminiChatTurn[];
  userMessage: string;
  modelParts: Part[];
  toolResponses: GeminiToolResponseInput[];
}): Promise<GeminiChatOutcome> {
  const model = buildModel(
    options.financeContext,
    options.assistantName,
    options.behaviorInstructions ?? [],
    options.reminders ?? [],
    options.speakingWith
  );
  const chat = model.startChat({ history: mapHistory(options.history) });

  const toolResponseParts: Part[] = options.toolResponses.map((response) => ({
    functionResponse: {
      name: response.name,
      response: response.result,
    },
  }));

  const result = await chat.sendMessage([
    { text: options.userMessage },
    ...options.modelParts,
    ...toolResponseParts,
  ]);

  return parseGeminiResult(
    result.response.functionCalls(),
    result.response.candidates?.[0]?.content?.parts ?? []
  );
}
