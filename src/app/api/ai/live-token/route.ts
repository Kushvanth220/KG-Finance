import { NextResponse } from "next/server";
import type { AssistantVoiceGender } from "@/lib/ai/assistant-voice";
import { createLiveEphemeralToken } from "@/lib/ai/gemini-live-server";
import type { FinanceState } from "@/types";

export const dynamic = "force-dynamic";

interface LiveTokenRequestBody {
  assistant_name?: string;
  voice_gender?: AssistantVoiceGender;
  finance_state?: FinanceState;
  behavior_instructions?: string[];
  reminders?: string[];
  rules?: string[];
}

function parseVoiceGender(value: unknown): AssistantVoiceGender | undefined {
  if (value === "male" || value === "female") return value;
  return undefined;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LiveTokenRequestBody;
    const tokenPayload = await createLiveEphemeralToken(
      body.assistant_name?.trim(),
      parseVoiceGender(body.voice_gender),
      body.finance_state,
      Array.isArray(body.behavior_instructions) ? body.behavior_instructions : [],
      Array.isArray(body.reminders) ? body.reminders : [],
      Array.isArray(body.rules) ? body.rules : []
    );

    return NextResponse.json({
      ok: true,
      ...tokenPayload,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create live token.";
    const status = message.includes("GEMINI_API_KEY") ? 503 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
