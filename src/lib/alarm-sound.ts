"use client";

import type { AlarmSound } from "@/lib/ai/reminders";

/**
 * The alarm's sound, made in the browser — no audio files to load or cache.
 *
 * Browsers only let a page make sound after someone has touched it, so a ring
 * that arrives on an untouched page may be silent until the first tap; the
 * screen and vibration still work. A closed app rings with the phone's own
 * notification sound instead.
 */

type Tone = { notes: number[]; type: OscillatorType; step: number; length: number; every: number };

const TONES: Record<Exclude<AlarmSound, "silent">, Tone> = {
  chime: { notes: [880, 1318.5], type: "sine", step: 0.14, length: 0.9, every: 2.2 },
  bell: { notes: [659.3, 987.8, 1318.5, 987.8], type: "triangle", step: 0.18, length: 1.4, every: 2.8 },
  pulse: { notes: [988, 988, 988, 988], type: "square", step: 0.16, length: 0.09, every: 1.6 },
};

export const SOUND_LABELS: Record<AlarmSound, string> = {
  chime: "Chime",
  bell: "Bell",
  pulse: "Pulse",
  silent: "Silent",
};

let shared: AudioContext | null = null;

function context(): AudioContext | null {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    shared = shared ?? new Ctor();
    if (shared.state === "suspended") void shared.resume();
    return shared;
  } catch {
    return null;
  }
}

function playPattern(ctx: AudioContext, tone: Tone, volume: number) {
  const start = ctx.currentTime + 0.03;
  tone.notes.forEach((freq, i) => {
    const at = start + i * tone.step;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = tone.type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume * (tone.type === "square" ? 0.35 : 1), at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + tone.length);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + tone.length + 0.05);
  });
}

/** One pattern, for a reminder popping up or the editor's Test button. */
export function playOnce(sound: AlarmSound = "chime", volume = 0.14) {
  if (sound === "silent") return;
  const ctx = context();
  if (ctx) playPattern(ctx, TONES[sound], volume);
}

/**
 * Ring until stopped. With `louder`, it starts soft and grows over half a
 * minute — gentler for an early alarm.
 */
export function startAlarm(sound: AlarmSound = "chime", louder = false): () => void {
  if (sound === "silent") return () => {};
  const ctx = context();
  if (!ctx) return () => {};
  const tone = TONES[sound];
  const began = Date.now();
  const volume = () => (louder ? Math.min(0.3, 0.04 + ((Date.now() - began) / 30_000) * 0.26) : 0.22);
  playPattern(ctx, tone, volume());
  const timer = window.setInterval(() => playPattern(ctx, tone, volume()), tone.every * 1000);
  return () => window.clearInterval(timer);
}
