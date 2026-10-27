import { NextResponse } from "next/server";
import {
  fetchAssistantPreferences,
  storedReminders,
  upsertAssistantPreferences,
} from "@/lib/ai/chat-store";
import { reminderFromLegacyLine, type Reminder } from "@/lib/ai/reminders";
import { mergeReminderLists, mergeTombstones, type ReminderTombstones } from "@/lib/ai/reminder-sync";

export const dynamic = "force-dynamic";

interface PreferencesBody {
  assistant_name?: string;
  voice_gender?: string;
  wake_listening_enabled?: boolean;
  language?: string;
  behavior_instructions?: string[];
  /** Sentences only: what clients sent before reminders travelled as data. */
  reminders?: string[];
  /** The device's reminders as data. Merged with the saved ones, never a replacement. */
  reminder_data?: Reminder[];
  /** Reminders the device deleted, and when. */
  reminder_deleted?: ReminderTombstones;
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
      // The device sends its whole list, but it is one device of several: one
      // the device hasn't seen yet (made on another phone) stays, and only a
      // headstone removes one. Per reminder the newer copy wins — a Done
      // tapped on a notification beats an older copy — and "done through"
      // never moves back.
      const incoming = body.reminder_data.filter(isReminder).map((item) => {
        const { line: _line, ...clean } = item as Reminder & { line?: string };
        void _line;
        return clean;
      });
      // Saved copies whose id was made up while reading sentences can't be
      // matched by id; the device's list already carries them as data.
      const saved = (existing?.reminder_data ?? []).filter((item) => !item.id.startsWith("legacy-"));
      const deleted = mergeTombstones(existing?.reminder_deleted, body.reminder_deleted);
      let list = mergeReminderLists(incoming, saved, deleted);
      if (body.append_reminder?.trim()) {
        const line = body.append_reminder.trim().slice(0, 500);
        list = [...list, reminderFromLegacyLine(line, crypto.randomUUID())];
      }
      reminders = storedReminders(list, deleted);
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
