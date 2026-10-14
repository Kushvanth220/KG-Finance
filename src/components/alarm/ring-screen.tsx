"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { ChevronDown, ChevronUp, Volume2 } from "lucide-react";
import {
  DEFAULT_SNOOZE_MINUTES,
  formatReminderAmount,
  formatTime,
  toStamp,
  type Reminder,
} from "@/lib/ai/reminders";
import { playOnce, soundLocked, startAlarm, subscribeSound } from "@/lib/alarm-sound";
import { PERSON_LABELS } from "@/types";

/**
 * The ringing screen: one card, flick it up for done, pull it down for later.
 *
 * An alarm takes the whole screen, shakes now and then, and keeps sounding
 * (and vibrating, where the phone allows it) until it is handled. A reminder
 * with a time rises as a sheet over the app instead, with one soft chime.
 * Both use the same card and the same two moves, so there is one thing to
 * learn. The hints above and below the card are buttons too, for anyone who
 * would rather tap.
 */

const FLICK_DISTANCE = 90;
const FLICK_SPEED = 500;

export function RingScreen({
  reminder,
  ringAt,
  now,
  onDone,
  onSnooze,
}: {
  reminder: Reminder;
  ringAt: Date;
  now: Date;
  onDone: () => void;
  onSnooze: () => void;
}) {
  const still = useReducedMotion();
  const alarm = !!reminder.alarm;
  const [leaving, setLeaving] = useState<null | "up" | "down">(null);
  const y = useMotionValue(0);
  const upLight = useTransform(y, [-120, -20, 0], [1, 0.75, 0.6]);
  const downLight = useTransform(y, [0, 20, 120], [0.6, 0.75, 1]);
  const cardScale = useTransform(y, [-300, 0, 300], [0.94, 1, 0.94]);
  const cardRef = useRef<HTMLDivElement>(null);
  // An alarm found on opening the app rings before anyone has touched the page, and browsers
  // hold sound back until a touch: say so, rather than ringing in silence.
  const locked = useSyncExternalStore(subscribeSound, soundLocked, () => false);

  // Sound and vibration for as long as it is on screen.
  useEffect(() => {
    if (!alarm) {
      playOnce(reminder.sound ?? "chime", 0.1);
      return;
    }
    const stopSound = startAlarm(reminder.sound ?? "chime", !!reminder.louder);
    let buzz: number | undefined;
    if (reminder.vibrate !== false && typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([600, 250, 600]);
      buzz = window.setInterval(() => navigator.vibrate([600, 250, 600]), 2400);
    }
    return () => {
      stopSound();
      if (buzz) window.clearInterval(buzz);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(0);
    };
  }, [alarm, reminder.sound, reminder.louder, reminder.vibrate]);

  useEffect(() => {
    cardRef.current?.focus({ preventScroll: true });
  }, []);

  const leave = (way: "up" | "down") => {
    if (leaving) return;
    setLeaving(way);
    if (still) (way === "up" ? onDone : onSnooze)();
  };

  const time = formatTime(toStamp(ringAt).slice(11)) ?? "";
  const [clock, meridiem] = time.split(" ");
  const late = now.getTime() - ringAt.getTime() > 2 * 60_000;
  const snooze = reminder.snoozeMinutes ?? DEFAULT_SNOOZE_MINUTES;
  const day = ringAt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const detail = [
    reminder.amount ? formatReminderAmount(reminder.amount) : null,
    reminder.person ? PERSON_LABELS[reminder.person] : "Both",
  ]
    .filter(Boolean)
    .join(" · ");

  const card = (
    <motion.div
      ref={cardRef}
      tabIndex={0}
      role="group"
      aria-label={`${reminder.text}. Arrow up or swipe up for done, arrow down or swipe down to snooze.`}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp") { event.preventDefault(); leave("up"); }
        if (event.key === "ArrowDown") { event.preventDefault(); leave("down"); }
      }}
      drag={leaving || still ? false : "y"}
      dragSnapToOrigin
      dragElastic={0.6}
      style={{ y, scale: cardScale }}
      onDragEnd={(_, info) => {
        if (info.offset.y < -FLICK_DISTANCE || info.velocity.y < -FLICK_SPEED) leave("up");
        else if (info.offset.y > FLICK_DISTANCE || info.velocity.y > FLICK_SPEED) leave("down");
      }}
      animate={leaving ? { y: leaving === "up" ? -720 : 720, opacity: 0, rotate: leaving === "up" ? -4 : 4 } : undefined}
      transition={{ duration: 0.7, ease: [0.5, 0, 0.25, 1] }}
      onAnimationComplete={() => {
        if (leaving && !still) (leaving === "up" ? onDone : onSnooze)();
      }}
      className="kg-ring-card grid w-full max-w-sm cursor-grab touch-none select-none justify-items-center gap-1 rounded-[26px] px-4 py-5 text-center outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-ice)] active:cursor-grabbing"
    >
      <Image src="/brand/lion-mark.webp" alt="" width={48} height={48} className="h-12 w-12" draggable={false} />
      <p className="text-[20px] font-semibold leading-tight">{reminder.text}</p>
      <p className="kg-ring-dim text-[13px] tabular-nums">{detail}</p>
      {reminder.note ? <p className="kg-ring-dim mt-1 text-[12px]">{reminder.note}</p> : null}
    </motion.div>
  );

  const hints = (body: React.ReactNode) => (
    <div className="flex w-full flex-1 flex-col items-center justify-center gap-4">
      <motion.button
        type="button"
        onClick={() => leave("up")}
        style={{ opacity: upLight }}
        className="flex flex-col items-center gap-0.5 rounded-xl px-4 py-1 font-mono text-[11px] tracking-wide"
      >
        <ChevronUp className="kg-ring-nudge-up h-5 w-5" />
        Swipe up · done
      </motion.button>
      {body}
      <motion.button
        type="button"
        onClick={() => leave("down")}
        style={{ opacity: downLight }}
        className="flex flex-col items-center gap-0.5 rounded-xl px-4 py-1 font-mono text-[11px] tracking-wide"
      >
        Swipe down · snooze {snooze} min
        <ChevronDown className="kg-ring-nudge-down h-5 w-5" />
      </motion.button>
    </div>
  );

  const eyebrow = (
    <p className="kg-ring-dim inline-flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.14em]">
      <span className="kg-ring-pulse h-2 w-2 rounded-full bg-accent" />
      {late ? `Missed · ${day}` : `${alarm ? "Alarm" : "Reminder"} · ${day}`}
    </p>
  );

  if (alarm) {
    return (
      <motion.div
        role="alertdialog"
        aria-modal="true"
        aria-label={`Alarm: ${reminder.text}`}
        className="kg-ring fixed inset-0 z-[200] flex flex-col items-center px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(3.5rem,env(safe-area-inset-top))]"
        initial={still ? false : { opacity: 0, scale: 1.04, filter: "blur(8px) brightness(2)" }}
        animate={{ opacity: 1, scale: 1, filter: "blur(0px) brightness(1)" }}
        exit={{ opacity: 0, filter: "blur(6px)" }}
        transition={{ duration: 1.1, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <div className="kg-ring-buzz flex w-full flex-1 flex-col items-center">
          {eyebrow}
          <p className="mt-3 font-light tabular-nums tracking-tight" style={{ fontSize: "clamp(64px, 20vw, 96px)", lineHeight: 1 }}>
            {clock}
            <span className="kg-ring-dim ml-1 text-[18px] font-medium tracking-normal">{meridiem}</span>
          </p>
          {locked && reminder.sound !== "silent" ? (
            <p className="kg-ring-card mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em]">
              <Volume2 className="h-3.5 w-3.5" aria-hidden /> Tap anywhere for sound
            </p>
          ) : null}
          {hints(card)}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      role="alertdialog"
      aria-modal="true"
      aria-label={`Reminder: ${reminder.text}`}
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/45"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="kg-ring flex h-[min(430px,80vh)] w-full max-w-lg flex-col items-center rounded-t-[30px] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5"
        initial={still ? false : { y: "105%" }}
        animate={{ y: 0 }}
        exit={{ y: "105%" }}
        transition={{ type: "spring", stiffness: 210, damping: 26 }}
      >
        {eyebrow}
        <p className="kg-ring-dim mt-1 text-[12px] tabular-nums">{time}</p>
        {hints(card)}
      </motion.div>
    </motion.div>
  );
}
