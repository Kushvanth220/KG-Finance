"use client";

import {
  ASSISTANT_LIVE_INPUT_MIME,
  LIVE_VOICE_MAX_CONNECT_RETRIES,
  LIVE_VOICE_RETRY_BASE_MS,
} from "@/lib/ai/live-config";
import {
  connectGeminiLiveVoice,
  type LiveFunctionResponse,
  type LiveVoiceCallbacks,
  type LiveVoiceConnection,
} from "@/lib/ai/gemini-live-client";
import type { AssistantVoiceGender } from "@/lib/ai/assistant-voice";
import type { AssistantToolResult } from "@/lib/ai/tools";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchLiveTokenPayload(body: Record<string, unknown>) {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < LIVE_VOICE_MAX_CONNECT_RETRIES; attempt += 1) {
    try {
      const response = await fetch("/api/ai/live-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!payload.ok) {
        throw new Error(payload.error ?? "Could not create live voice token.");
      }
      return payload as { token: string; model: string; expires_at?: string };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Token request failed.");
      if (attempt < LIVE_VOICE_MAX_CONNECT_RETRIES - 1) {
        await sleep(LIVE_VOICE_RETRY_BASE_MS * (attempt + 1));
      }
    }
  }

  throw lastError ?? new Error("Could not create live voice token.");
}

export async function connectLiveVoiceWithRetry(options: {
  ephemeralToken: string;
  model: string;
  assistantName?: string;
  voiceGender?: AssistantVoiceGender;
  callbacks: LiveVoiceCallbacks;
}): Promise<LiveVoiceConnection> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < LIVE_VOICE_MAX_CONNECT_RETRIES; attempt += 1) {
    try {
      return await connectGeminiLiveVoice(options);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Live connect failed.");
      if (attempt < LIVE_VOICE_MAX_CONNECT_RETRIES - 1) {
        await sleep(LIVE_VOICE_RETRY_BASE_MS * (attempt + 1));
      }
    }
  }

  throw lastError ?? new Error("Could not connect to live voice.");
}

export async function executeLiveToolCallsSafely(
  execute: () => AssistantToolResult[]
): Promise<LiveFunctionResponse[]> {
  try {
    return execute().map((result) => ({
      id: result.id,
      name: result.name,
      response: result.result,
    }));
  } catch (error) {
    return [
      {
        name: "tool_error",
        response: {
          ok: false,
          error: error instanceof Error ? error.message : "Tool execution failed.",
          instruction:
            "Explain the issue once in English and ask for the missing detail. Do not apologize repeatedly.",
        },
      },
    ];
  }
}

export { ASSISTANT_LIVE_INPUT_MIME };
