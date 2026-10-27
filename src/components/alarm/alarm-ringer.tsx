"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence } from "motion/react";
import { useAssistantPreferencesStore } from "@/store/assistant-preferences-store";
import { pendingRing, rings, type Reminder } from "@/lib/ai/reminders";
import { onRemindersChanged } from "@/lib/supabase/sync";
import { RingScreen } from "@/components/alarm/ring-screen";

/**
 * Watches the clock while the app is open and rings what is due.
 *
 * Every 15 seconds it asks each alarm and timed reminder whether a ring has
 * come and not been handled. It also rings on request: a tap on the push
 * notification opens the app with `?ring=<id>`, and a push that arrives while
 * the app is open is passed on by the service worker. Done and Snooze from a
 * notification's buttons are saved on the server, so the reminders are pulled
 * again whenever the app comes back to the front — and the moment another
 * device says it saved some, with a check every 30 seconds behind that.
 */

const ALARM_WINDOW = 2 * 3_600_000;
// A reminder that popped up while you were away is old news after half an hour.
const REMINDER_WINDOW = 30 * 60_000;

const subscribeNothing = () => () => {};

export function AlarmRinger() {
  // Reminders live in this browser's storage; render nothing until it is
  // read, so the server's empty first render matches.
  const mounted = useSyncExternalStore(subscribeNothing, () => true, () => false);
  const reminders = useAssistantPreferencesStore((state) => state.structuredReminders);
  const handleRing = useAssistantPreferencesStore((state) => state.handleRing);
  const [now, setNow] = useState(() => new Date());
  const [asked, setAsked] = useState<string | null>(null);
  // Rings dismissed here, so one asked for by link can't come straight back.
  const [handled, setHandled] = useState<string[]>([]);

  useEffect(() => {
    const hydrate = () => void useAssistantPreferencesStore.getState().hydrateFromServer();
    const tick = window.setInterval(() => setNow(new Date()), 15_000);
    const pull = window.setInterval(() => {
      if (document.visibilityState === "visible") hydrate();
    }, 30_000);
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      setNow(new Date());
      hydrate();
    };
    const stopListening = onRemindersChanged(hydrate);
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; id?: string } | null;
      if (data?.type === "kg-ring" && data.id) {
        setAsked(data.id);
        setNow(new Date());
      }
      if (data?.type === "kg-reminders-changed") hydrate();
    };
    document.addEventListener("visibilitychange", onVisible);
    navigator.serviceWorker?.addEventListener("message", onMessage);
    hydrate();
    return () => {
      window.clearInterval(tick);
      window.clearInterval(pull);
      stopListening();
      document.removeEventListener("visibilitychange", onVisible);
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, []);

  const fromLink = mounted ? new URLSearchParams(window.location.search).get("ring") : null;

  const current = useMemo((): { reminder: Reminder; at: Date } | null => {
    if (!mounted) return null;
    const wanted = asked ?? fromLink;
    if (wanted && !handled.includes(wanted)) {
      const reminder = reminders.find((item) => item.id === wanted);
      if (reminder && !reminder.done) {
        return { reminder, at: pendingRing(reminder, now, ALARM_WINDOW) ?? now };
      }
    }
    const due = reminders
      .filter((item) => rings(item))
      .map((reminder) => ({ reminder, at: pendingRing(reminder, now, reminder.alarm ? ALARM_WINDOW : REMINDER_WINDOW) }))
      .filter((item): item is { reminder: Reminder; at: Date } => item.at !== null)
      .sort((a, b) => a.at.getTime() - b.at.getTime());
    return due[0] ?? null;
  }, [mounted, asked, fromLink, handled, reminders, now]);

  const finish = (reminder: Reminder, outcome: "done" | "snooze") => {
    handleRing(reminder.id, outcome, new Date());
    setHandled((list) => [...list, reminder.id]);
    setAsked(null);
    // Leave the link without the ring, and clear the matching notification.
    const url = new URL(window.location.href);
    if (url.searchParams.has("ring")) {
      url.searchParams.delete("ring");
      window.history.replaceState(window.history.state, "", url.toString());
    }
    void navigator.serviceWorker?.getRegistration().then((registration) =>
      registration?.getNotifications({ tag: `kg-ring-${reminder.id}` }).then((list) => list.forEach((n) => n.close()))
    );
    setNow(new Date());
  };

  if (!mounted) return null;
  // Rendered on the body itself: inside the app's frame, a transformed parent
  // would trap "fixed" and the header and tab bar would sit on top of it.
  return createPortal(
    <AnimatePresence>
      {current ? (
        <RingScreen
          key={`${current.reminder.id}-${current.at.getTime()}`}
          reminder={current.reminder}
          ringAt={current.at}
          now={now}
          onDone={() => finish(current.reminder, "done")}
          onSnooze={() => finish(current.reminder, "snooze")}
        />
      ) : null}
    </AnimatePresence>,
    document.body
  );
}
