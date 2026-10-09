"use client";

import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { disablePush, enablePush, getPushStatus, type PushStatus } from "@/lib/push-client";
import type { Person } from "@/types";
import { PERSON_LABELS } from "@/types";
import { cn } from "@/lib/utils";

/**
 * Turning the morning nudge on for this device.
 *
 * Each phone opts in for one person, so G's phone hears about G's bills and
 * shared, not one person's card. Status is spelled out because push
 * fails in four different places and "it doesn't work" helps nobody.
 */
export function NotificationCard() {
  const [status, setStatus] = useState<PushStatus | "loading">("loading");
  const [person, setPerson] = useState<Person>("kushvanth");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getPushStatus().then((next) => {
      if (!cancelled) setStatus(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const turnOn = async () => {
    setBusy(true);
    setError(null);
    try {
      setStatus(await enablePush(person));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not turn notifications on.");
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      await disablePush();
      setStatus("prompt");
    } finally {
      setBusy(false);
    }
  };

  const line =
    status === "loading"
      ? "Checking…"
      : status === "unsupported"
        ? "This browser can't receive notifications. On iPhone, add the app to the Home Screen first."
        : status === "no-key"
          ? "Not set up on the server yet (VAPID keys missing)."
          : status === "denied"
            ? "Blocked in browser settings. Allow notifications for this site to turn them on."
            : status === "subscribed"
              ? "On for this device. A nudge arrives each morning when something is due."
              : "Off. Turn on to get a morning nudge for due bills and reminders.";

  return (
    <div className="glass rounded-xl p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold">
          <BellRing className={cn("h-3.5 w-3.5", status === "subscribed" ? "text-positive" : "text-caution")} />
          Notifications
        </p>
        {status === "subscribed" ? (
          <button type="button" onClick={turnOff} disabled={busy} className="text-[11px] font-semibold text-negative disabled:opacity-40">
            Turn off
          </button>
        ) : status === "prompt" ? (
          <div className="flex items-center gap-1.5">
            <select
              value={person}
              onChange={(event) => setPerson(event.target.value as Person)}
              className="glass rounded-lg px-2 py-1 text-[11px] outline-none"
              aria-label="This phone belongs to"
            >
              <option value="kushvanth">{PERSON_LABELS.kushvanth}</option>
              <option value="g">{PERSON_LABELS.g}</option>
            </select>
            <button
              type="button"
              onClick={turnOn}
              disabled={busy}
              className="rounded-lg bg-accent px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40"
            >
              Turn on
            </button>
          </div>
        ) : null}
      </div>
      <p className="mt-1 text-[11px] text-muted">{line}</p>
      {error ? <p className="mt-1 text-[11px] text-negative">{error}</p> : null}
    </div>
  );
}
