import { NextResponse } from "next/server";
import {
  fetchAssistantPreferences,
  storedReminders,
  upsertAssistantPreferences,
} from "@/lib/ai/chat-store";
import { newerReminder, reminderFromLegacyLine, type Reminder } from "@/lib/ai/reminders";

export const dynamic = "force-dynamic";

interface PreferencesBody {
  assistant_name?: string;
  voice_gender?: string;
  wake_listening_enabled?: boolean;
  language?: string;
  behavior_instructions?: string[];
  /** Sentences only: what clients sent before reminders travelled as data. */
  reminders?: string[];
  /** Reminders as data. When present, this is the list. */
  reminder_data?: Reminder[];
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

const isReminder = (value: unknown): value is Reminder =>
  !!value &&
  typeof value === "object" &&
  typeof (value as Reminder).id === "string" &&
  typeof (value as Reminder).text === "string";

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

    let reminders: Parameters<typeof upsertAssistantPreferences>[0]["reminders"];
    if (Array.isArray(body.reminder_data)) {
      // The device sends its whole list. Per reminder, a copy changed here
      // more recently (a Done or Snooze tapped on a notification) beats the
      // device's older one, and "done through" never moves back.
      const saved = new Map((existing?.reminder_data ?? []).map((item) => [item.id, item]));
      let list = body.reminder_data.filter(isReminder).map((incoming) => {
        const { line: _line, ...clean } = incoming as Reminder & { line?: string };
        void _line;
        const old = saved.get(clean.id);
        return old ? newerReminder(clean, old) : clean;
      });
      if (body.append_reminder?.trim()) {
        const line = body.append_reminder.trim().slice(0, 500);
        list = [...list, reminderFromLegacyLine(line, crypto.randomUUID())];
      }
      reminders = storedReminders(list);
    } else {
      let lines = body.reminders ?? existing?.reminders ?? [];
      if (body.append_reminder?.trim()) {
        const line = body.append_reminder.trim().slice(0, 500);
        if (!lines.includes(line)) lines = [...lines, line];
      }
      reminders = lines;
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
