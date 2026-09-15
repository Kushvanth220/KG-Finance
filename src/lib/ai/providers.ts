import { recordAiUsage } from "@/lib/ai/usage";
import {
  readAnthropicApiKey,
  readAnthropicWorkspaceId,
  readGeminiApiKey,
  readOpenAiApiKey,
} from "@/lib/ai/env";

export type AiProviderId = "gemini" | "chatgpt" | "claude";

export interface AiProviderStatus {
  id: AiProviderId;
  label: string;
  configured: boolean;
}

export function getAiProviderStatus(): AiProviderStatus[] {
  return [
    {
      id: "gemini",
      label: "Gemini",
      configured: Boolean(readGeminiApiKey()),
    },
    {
      id: "chatgpt",
      label: "ChatGPT",
      configured: Boolean(readOpenAiApiKey()),
    },
    {
      id: "claude",
      label: "Claude",
      configured: Boolean(readAnthropicApiKey()),
    },
  ];
}

/**
 * Reply length is controlled by the system prompt ("one short sentence"), NOT by
 * this cap — a cap that bites truncates mid-sentence and the truncated text can
 * still win the merge. Claude models also emit a thinking block first, so a tight
 * budget could be spent entirely on thinking, leaving no text block at all
 * (observed: stop_reason max_tokens, 212 thinking tokens, empty reply). Keep this
 * generous enough that a normal answer always finishes.
 */
const MAX_REPLY_TOKENS = 1024;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
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

async function openaiCompatibleChat(options: {
  url: string;
  apiKey: string;
  model: string;
  system: string;
  user: string;
  label: string;
}): Promise<string> {
  const response = await withTimeout(
    fetch(options.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: options.model,
        temperature: 0.4,
        max_tokens: MAX_REPLY_TOKENS,
        messages: [
          { role: "system", content: options.system },
          { role: "user", content: options.user },
        ],
      }),
    }),
    8000,
    options.label
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`${options.label} failed (${response.status}): ${detail.slice(0, 180)}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = payload.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(`${options.label} returned an empty reply.`);
  recordAiUsage({
    provider: "chatgpt",
    model: options.model,
    inputTokens: payload.usage?.prompt_tokens ?? 0,
    outputTokens: payload.usage?.completion_tokens ?? 0,
    purpose: options.label.toLowerCase(),
  });
  return text;
}

export async function generateChatGptReply(system: string, user: string): Promise<string> {
  const apiKey = readOpenAiApiKey();
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  return openaiCompatibleChat({
    url: "https://api.openai.com/v1/chat/completions",
    apiKey,
    model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
    system,
    user,
    label: "ChatGPT",
  });
}

/** Anthropic's Messages API has a different shape than the OpenAI-compatible one above. */
export async function generateClaudeReply(system: string, user: string): Promise<string> {
  const apiKey = readAnthropicApiKey();
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured.");

  const workspaceId = readAnthropicWorkspaceId();

  const response = await withTimeout(
    fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        ...(workspaceId ? { "anthropic-workspace-id": workspaceId } : {}),
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
        max_tokens: MAX_REPLY_TOKENS,
        system,
        messages: [{ role: "user", content: user }],
      }),
    }),
    8000,
    "Claude"
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Claude failed (${response.status}): ${detail.slice(0, 180)}`);
  }

  const payload = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = payload.content
    ?.find((block) => block.type === "text")
    ?.text?.trim();
  if (!text) throw new Error("Claude returned an empty reply.");
  recordAiUsage({
    provider: "claude",
    model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
    inputTokens: payload.usage?.input_tokens ?? 0,
    outputTokens: payload.usage?.output_tokens ?? 0,
    purpose: "review",
  });
  return text;
}
