import { NextResponse } from "next/server";
import { updateStoredReminder } from "@/lib/ai/chat-store";
import { DEFAULT_SNOOZE_MINUTES, toStamp } from "@/lib/ai/reminders";
import { zonedWallClock } from "@/lib/zoned-date";

export const dynamic = "force-dynamic";

/**
 * Done or Snooze, tapped on a notification while the app is closed.
 *
 * The service worker calls this; the change is saved on the server as the
 * newest copy, so the phone that tapped it and the other one both pick it up
 * on their next sync. Done covers this ring and anything before it; Snooze
 * rings again after the reminder's snooze length.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { id?: string; action?: string };
    const id = String(body.id ?? "");
    if (!id || (body.action !== "done" && body.action !== "snooze")) {
      return NextResponse.json({ ok: false, error: "Send an id and done or snooze." }, { status: 400 });
    }
    const now = zonedWallClock();
    const updated = await updateStoredReminder(id, (reminder) => {
      if (body.action === "snooze") {
        const minutes = reminder.snoozeMinutes ?? DEFAULT_SNOOZE_MINUTES;
        return { ...reminder, snoozedUntil: toStamp(new Date(now.getTime() + minutes * 60_000)) };
      }
      if (reminder.repeat === "once") return { ...reminder, done: true, snoozedUntil: undefined };
      return { ...reminder, doneThrough: toStamp(now), snoozedUntil: undefined };
    });
    if (!updated) {
      return NextResponse.json({ ok: false, error: "That reminder isn't saved on the server yet." }, { status: 404 });
    }
    return NextResponse.json({ ok: true, reminder: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update the reminder.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
