/** Current Live native-audio model, then older previews if Google rejects it. */
import { EndSensitivity, StartSensitivity, TurnCoverage } from "@google/genai";

export const GEMINI_LIVE_MODEL_CANDIDATES = [
  "gemini-3.1-flash-live-preview",
  "gemini-2.5-flash-native-audio-preview-12-2025",
  "gemini-2.5-flash-native-audio-preview-09-2025",
] as const;

export const GEMINI_LIVE_MODEL =
  process.env.GEMINI_LIVE_MODEL ?? GEMINI_LIVE_MODEL_CANDIDATES[0];

export function liveModelFallbackList(preferred = GEMINI_LIVE_MODEL): string[] {
  return [...new Set([GEMINI_LIVE_MODEL_CANDIDATES[0], preferred, ...GEMINI_LIVE_MODEL_CANDIDATES])];
}

export const GEMINI_LIVE_API_VERSION = "v1alpha" as const;

export const GEMINI_LIVE_VOICE = process.env.GEMINI_LIVE_VOICE ?? "Aoede";

/** Hardcoded English locale for STT/TTS and model behavior. */
export const ASSISTANT_LANGUAGE = "en-US" as const;

export const ASSISTANT_LIVE_INPUT_MIME = "audio/pcm;rate=16000";

export const ASSISTANT_LIVE_OUTPUT_SAMPLE_RATE = 24000;

export const LIVE_VOICE_MAX_CONNECT_RETRIES = 3;

export const LIVE_VOICE_RETRY_BASE_MS = 800;

/**
 * Server VAD: wait through natural pauses so one sentence is one turn.
 * High start / low end = hear quieter speech, do not cut mid-sentence.
 * Must match on the ephemeral token and the browser connect call.
 */
export const LIVE_REALTIME_INPUT_CONFIG = {
  automaticActivityDetection: {
    disabled: false,
    startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
    endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
    prefixPaddingMs: 40,
    // 800ms of dead air after every sentence was the main "why is it slow" feeling.
    // 550ms still rides through natural pauses without cutting the speaker off.
    silenceDurationMs: 550,
  },
  turnCoverage: TurnCoverage.TURN_INCLUDES_ALL_INPUT,
};

export function buildLiveTranscriptionConfig() {
  return {
    languageCodes: [ASSISTANT_LANGUAGE],
  };
}
