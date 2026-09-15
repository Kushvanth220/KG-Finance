"use client";

import { GoogleGenAI, Modality } from "@google/genai";
import type { LiveServerMessage, Session } from "@google/genai";
import {
  ASSISTANT_LANGUAGE,
  ASSISTANT_LIVE_INPUT_MIME,
  GEMINI_LIVE_API_VERSION,
  LIVE_REALTIME_INPUT_CONFIG,
  buildLiveTranscriptionConfig,
} from "@/lib/ai/live-config";
import { resolveAssistantLiveVoice, type AssistantVoiceGender } from "@/lib/ai/assistant-voice";

export interface LiveToolCallPayload {
  functionCalls: Array<{
    id?: string;
    name?: string;
    args?: Record<string, unknown>;
  }>;
}

export interface LiveFunctionResponse {
  id?: string;
  name: string;
  response: Record<string, unknown>;
}

export interface LiveTranscriptionEvent {
  text: string;
  finished?: boolean;
  interim?: boolean;
}

export interface LiveVoiceCallbacks {
  onOpen?: () => void;
  onClose?: (reason?: string) => void;
  onError?: (message: string, fatal?: boolean) => void;
  onInputTranscription?: (event: LiveTranscriptionEvent) => void;
  onOutputTranscription?: (event: LiveTranscriptionEvent) => void;
  onTurnComplete?: () => void;
  onInterrupted?: () => void;
  onModelAudio?: (base64Pcm: string) => void;
  onToolCall?: (toolCall: LiveToolCallPayload) => void | Promise<void>;
}

export interface LiveVoiceConnection {
  session: Session;
  close: () => void;
  sendAudioChunk: (base64Pcm: string) => void;
  sendToolResponse: (responses: LiveFunctionResponse[]) => void;
  sendGreeting: (text: string) => void;
}

const TRANSIENT_CLOSE_REASONS = new Set(["", "aborted", "client_close"]);

export async function connectGeminiLiveVoice(options: {
  ephemeralToken: string;
  model: string;
  assistantName?: string;
  voiceGender?: AssistantVoiceGender;
  callbacks: LiveVoiceCallbacks;
}): Promise<LiveVoiceConnection> {
  const ai = new GoogleGenAI({
    apiKey: options.ephemeralToken,
    httpOptions: { apiVersion: GEMINI_LIVE_API_VERSION },
  });

  const transcription = buildLiveTranscriptionConfig();
  const liveConfig = {
    responseModalities: [Modality.AUDIO],
    speechConfig: {
      languageCode: ASSISTANT_LANGUAGE,
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName: resolveAssistantLiveVoice(options.voiceGender),
        },
      },
    },
    realtimeInputConfig: LIVE_REALTIME_INPUT_CONFIG,
    inputAudioTranscription: transcription,
    outputAudioTranscription: {},
  };

  let opened = false;
  let resolveOpened: (() => void) | null = null;
  const openedPromise = new Promise<void>((resolve) => {
    resolveOpened = resolve;
  });
  const callbacks = {
    onopen: () => {
      opened = true;
      resolveOpened?.();
      options.callbacks.onOpen?.();
    },
    onclose: (event: CloseEvent) => {
      const reason = event.reason ?? "";
      const fatal = !TRANSIENT_CLOSE_REASONS.has(reason.toLowerCase());
      options.callbacks.onClose?.(reason || undefined);
      if (fatal && reason) {
        options.callbacks.onError?.(`Connection closed: ${reason}`, true);
      }
    },
    onerror: (event: Event) => {
      const message =
        event instanceof ErrorEvent
          ? event.message || "Live voice connection error."
          : "Live voice connection error.";
      options.callbacks.onError?.(message, false);
    },
    onmessage: (message: LiveServerMessage) => {
      handleLiveMessage(message, options.callbacks);
    },
  };

  const session = await ai.live.connect({
    model: options.model,
    config: liveConfig,
    callbacks,
  });
  if (!opened) {
    await Promise.race([
      openedPromise,
      new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error("Live voice did not open.")), 12000);
      }),
    ]);
  }
  const useRealtimeText = /gemini-3/i.test(options.model);

  return {
    session,
    close: () => session.close(),
    sendAudioChunk: (base64Pcm: string) => {
      if (!opened) return;
      session.sendRealtimeInput({
        audio: {
          data: base64Pcm,
          mimeType: ASSISTANT_LIVE_INPUT_MIME,
        },
      });
    },
    sendToolResponse: (responses) => {
      session.sendToolResponse({
        functionResponses: responses.map((response) => ({
          id: response.id,
          name: response.name,
          response: response.response,
        })),
      });
    },
    sendGreeting: (text: string) => {
      if (useRealtimeText) {
        session.sendRealtimeInput({ text });
        return;
      }
      session.sendClientContent({
        turns: [{ role: "user", parts: [{ text }] }],
        turnComplete: true,
      });
    },
  };
}

function handleLiveMessage(message: LiveServerMessage, callbacks: LiveVoiceCallbacks) {
  const content = message.serverContent;
  if (content) {
    if (content.inputTranscription?.text) {
      callbacks.onInputTranscription?.({
        text: content.inputTranscription.text,
        finished: content.inputTranscription.finished,
      });
    } else if (content.interimInputTranscription?.text) {
      callbacks.onInputTranscription?.({
        text: content.interimInputTranscription.text,
        interim: true,
      });
    }

    if (content.outputTranscription?.text) {
      callbacks.onOutputTranscription?.({
        text: content.outputTranscription.text,
        finished: content.outputTranscription.finished,
      });
    }

    if (content.turnComplete) {
      callbacks.onTurnComplete?.();
    }

    if (content.interrupted) {
      callbacks.onInterrupted?.();
    }

    const parts = content.modelTurn?.parts ?? [];
    let playedAudio = false;
    for (const part of parts) {
      if (part.inlineData?.data) {
        callbacks.onModelAudio?.(part.inlineData.data);
        playedAudio = true;
      }
    }
    if (!playedAudio && message.data) {
      callbacks.onModelAudio?.(message.data);
    }
  }

  if (message.toolCall?.functionCalls?.length) {
    void (async () => {
      try {
        await callbacks.onToolCall?.({
          functionCalls: message.toolCall!.functionCalls!.map((call) => ({
            id: call.id,
            name: call.name,
            args: (call.args ?? {}) as Record<string, unknown>,
          })),
        });
      } catch (error) {
        callbacks.onError?.(
          error instanceof Error ? error.message : "Tool handler failed.",
          false
        );
      }
    })();
  }
}
