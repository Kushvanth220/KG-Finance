export type AssistantVoiceGender = "male" | "female";

/** Gemini Live prebuilt voices — male deeper, female warmer. */
export const ASSISTANT_LIVE_VOICES: Record<AssistantVoiceGender, string> = {
  male: "Charon",
  female: "Aoede",
};

export function resolveAssistantLiveVoice(gender?: AssistantVoiceGender | null): string {
  return ASSISTANT_LIVE_VOICES[gender ?? "female"];
}

export function getVoiceGenderLabel(gender: AssistantVoiceGender): string {
  return gender === "male" ? "Male voice" : "Female voice";
}
