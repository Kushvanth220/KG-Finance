import { NextResponse } from "next/server";
import {
  fetchAssistantPreferences,
  upsertAssistantPreferences,
} from "@/lib/ai/chat-store";

export const dynamic = "force-dynamic";

interface PreferencesBody {
  assistant_name?: string;
  voice_gender?: string;
  wake_listening_enabled?: boolean;
  language?: string;
  behavior_instructions?: string[];
  reminders?: string[];
  append_behavior_instruction?: string;
  append_reminder?: string;
}

export async function GET() {
  try {
    const prefs = await fetchAssistantPreferences();
    return NextResponse.json({ ok: true, preferences: prefs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load preferences.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PreferencesBody;
    const existing = await fetchAssistantPreferences();

    let behaviorInstructions = body.behavior_instructions ?? existing?.behavior_instructions ?? [];
    if (body.append_behavior_instruction?.trim()) {
      const line = body.append_behavior_instruction.trim().slice(0, 500);
      if (!behaviorInstructions.includes(line)) {
        behaviorInstructions = [...behaviorInstructions, line];
      }
    }

    let reminders = body.reminders ?? existing?.reminders ?? [];
    if (body.append_reminder?.trim()) {
      const line = body.append_reminder.trim().slice(0, 500);
      if (!reminders.includes(line)) {
        reminders = [...reminders, line];
      }
    }

    const saved = await upsertAssistantPreferences({
      assistant_name: body.assistant_name ?? existing?.assistant_name ?? undefined,
      voice_gender: body.voice_gender ?? existing?.voice_gender ?? undefined,
      wake_listening_enabled:
        body.wake_listening_enabled ?? existing?.wake_listening_enabled ?? true,
      language: body.language ?? existing?.language ?? "en-US",
      behavior_instructions: behaviorInstructions,
      reminders,
    });

    return NextResponse.json({ ok: true, preferences: saved });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save preferences.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
