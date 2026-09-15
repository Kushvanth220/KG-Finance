import { GoogleGenAI, Modality } from "@google/genai";
import {
  ASSISTANT_LANGUAGE,
  GEMINI_LIVE_API_VERSION,
  LIVE_REALTIME_INPUT_CONFIG,
  liveModelFallbackList,
  buildLiveTranscriptionConfig,
} from "@/lib/ai/live-config";
import { resolveAssistantLiveVoice, type AssistantVoiceGender } from "@/lib/ai/assistant-voice";
import { ASSISTANT_TOOLS } from "@/lib/ai/tools";
import { buildSystemInstruction } from "@/lib/ai/system-instructions";
import { resolveWorkspaceFinanceContext } from "@/lib/ai/resolve-finance-context";
import { readGeminiApiKey } from "@/lib/ai/env";
import type { FinanceState } from "@/types";

function getGeminiServerClient() {
  const apiKey = readGeminiApiKey();
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server.");
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: { apiVersion: GEMINI_LIVE_API_VERSION },
  });
}

export async function createLiveEphemeralToken(
  assistantName?: string,
  voiceGender?: AssistantVoiceGender,
  clientFinanceState?: FinanceState,
  behaviorInstructions: string[] = [],
  reminders: string[] = [],
  rules: string[] = []
) {
  const financeContext = await resolveWorkspaceFinanceContext(clientFinanceState, true);
  const systemInstruction = buildSystemInstruction(financeContext, {
    assistantName,
    behaviorInstructions,
    reminders,
    rules,
    voice: true,
  });
  const voiceName = resolveAssistantLiveVoice(voiceGender);

  const client = getGeminiServerClient();
  const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const newSessionExpireTime = new Date(Date.now() + 2 * 60 * 1000).toISOString();
  const models = liveModelFallbackList();
  let lastError: Error | null = null;

  for (const model of models) {
    try {
      const token = await client.authTokens.create({
        config: {
          uses: 1,
          expireTime,
          newSessionExpireTime,
          liveConnectConstraints: {
            model,
            config: {
              responseModalities: [Modality.AUDIO],
              systemInstruction,
              tools: ASSISTANT_TOOLS as never,
              speechConfig: {
                languageCode: ASSISTANT_LANGUAGE,
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: voiceName,
                  },
                },
              },
              realtimeInputConfig: LIVE_REALTIME_INPUT_CONFIG,
              inputAudioTranscription: buildLiveTranscriptionConfig(),
              outputAudioTranscription: {},
            },
          },
          httpOptions: { apiVersion: GEMINI_LIVE_API_VERSION },
        },
      });

      if (!token.name) {
        throw new Error("Failed to create Gemini Live ephemeral token.");
      }

      return {
        token: token.name,
        model,
        expires_at: expireTime,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Live token create failed.");
    }
  }

  throw lastError ?? new Error("Failed to create Gemini Live ephemeral token.");
}
