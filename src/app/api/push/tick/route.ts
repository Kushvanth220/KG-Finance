import { NextResponse } from "next/server";
import {
  claimPush,
  fetchAssistantPreferences,
  getWorkspaceId,
  listPushSubscriptions,
  prunePushLog,
} from "@/lib/ai/chat-store";
import {
  DEFAULT_SNOOZE_MINUTES,
  formatReminderAmount,
  formatTime,
  ringsBetween,
  toStamp,
  type Reminder,
  type Ring,
} from "@/lib/ai/reminders";
import { authorisedCron, configurePush, sendToDevices } from "@/lib/push-server";
import { zonedWallClock } from "@/lib/zoned-date";

export const dynamic = "force-dynamic";

/**
 * The every-minute check. The Supabase timer (pg_cron, see
 * supabase/alarm-timer.sql) calls this once a minute; it sends every alarm,
 * timed reminder, snooze and heads-up whose minute has come.
 *
 * Each ring is claimed in `push_log` before it is sent, so a late or doubled
 * call can't send it twice — and a call that ran late still catches rings from
 * the last few minutes instead of dropping them. Without that table it only
 * sends what fell in the last minute.
 *
 * Times are the workspace's wall clock (NEXT_PUBLIC_TIME_ZONE): "6:30 AM"
 * means 6:30 where you are, though the server runs in UTC.
 */

const CATCH_UP_MS = 10 * 60_000;
const NO_LOG_WINDOW_MS = 61_000;

function payloadFor(reminder: Reminder, ring: Ring) {
  const time = formatTime(toStamp(ring.at).slice(11)) ?? "";
  const amount = reminder.amount ? `${formatReminderAmount(reminder.amount)} · ` : "";
  const snooze = reminder.snoozeMinutes ?? DEFAULT_SNOOZE_MINUTES;
  if (ring.kind === "early") {
    const lead = reminder.leadMinutes ?? 0;
    return {
      title: `${reminder.text} in ${lead >= 60 && lead % 60 === 0 ? `${lead / 60} h` : `${lead} min`}`,
      body: `${amount}Heads-up for ${time}`,
      tag: `kg-early-${reminder.id}`,
      url: "/memory",
    };
  }
  return {
    title: reminder.text,
    body: `${amount}${reminder.alarm ? "Alarm" : "Reminder"} · ${time}${reminder.note ? ` · ${reminder.note}` : ""}`,
    tag: `kg-ring-${reminder.id}`,
    url: `/?ring=${encodeURIComponent(reminder.id)}`,
    id: reminder.id,
    at: toStamp(ring.at),
    kind: reminder.alarm ? "alarm" : "reminder",
    // An alarm stays on screen until it is handled; a reminder may slide away.
    requireInteraction: !!reminder.alarm,
    renotify: true,
    vibrate: reminder.alarm && reminder.vibrate !== false ? [600, 250, 600, 250, 600] : [200, 100, 200],
    actions: [
      { action: "done", title: "Done" },
      { action: "snooze", title: `Snooze ${snooze} min` },
    ],
  };
}

export async function GET(request: Request) {
  if (!authorisedCron(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorised." }, { status: 401 });
  }
  const dry = new URL(request.url).searchParams.has("dry");
  const keysSet = configurePush();
  if (!keysSet && !dry) {
    return NextResponse.json({ ok: false, error: "VAPID keys are not configured." }, { status: 503 });
  }

  try {
    const now = zonedWallClock();
    const [prefs, subscriptions] = await Promise.all([fetchAssistantPreferences(), listPushSubscriptions()]);
    const reminders = prefs?.reminder_data ?? [];
    const found = reminders.flatMap((reminder) =>
      ringsBetween(reminder, new Date(now.getTime() - CATCH_UP_MS), now).map((ring) => ({ reminder, ring }))
    );

    if (dry) {
      return NextResponse.json({
        ok: true,
        dry: true,
        now: toStamp(now),
        keysSet,
        devices: subscriptions.length,
        due: found.map(({ reminder, ring }) => ({ text: reminder.text, kind: ring.kind, at: toStamp(ring.at) })),
      });
    }

    const workspace = getWorkspaceId();
    let sent = 0;
    let pruned = 0;
    let skipped = 0;
    for (const { reminder, ring } of found) {
      const claim = await claimPush(`${workspace}:${reminder.id}:${ring.kind}:${toStamp(ring.at)}`);
      if (claim === false) {
        skipped += 1;
        continue;
      }
      if (claim === null && now.getTime() - ring.at.getTime() > NO_LOG_WINDOW_MS) {
        skipped += 1;
        continue;
      }
      // Rings keep for an hour in the push service; a heads-up is useless late.
      const result = await sendToDevices(subscriptions, payloadFor(reminder, ring), reminder.person, ring.kind === "early" ? 600 : 3600);
      sent += result.sent;
      pruned += result.pruned;
    }

    // Once an hour is plenty for tidying the log.
    if (now.getMinutes() === 0) await prunePushLog().catch(() => {});

    return NextResponse.json({ ok: true, now: toStamp(now), rings: found.length, sent, skipped, pruned });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tick failed.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
