"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { zonedClockNow, zonedToday } from "@/lib/zoned-date";

/**
 * A Flex block that is running right now: tapped "Start" on the way out the
 * door, "Finish" when the last package is delivered. Lives in this phone's
 * storage only — it is the phone in the car that knows — and survives the
 * app being closed in between.
 */

const KEY = "kg-flex-active-block";

export interface ActiveBlock {
  /** yyyy-MM-dd of the block. */
  date: string;
  /** "HH:MM" workspace time the block started. */
  startTime: string;
  /** ISO instant, for the running clock. */
  startedAt: string;
}

const listeners = new Set<() => void>();

function read(): ActiveBlock | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveBlock;
    return parsed && typeof parsed.startedAt === "string" ? parsed : null;
  } catch {
    return null;
  }
}

let cached: ActiveBlock | null | undefined;
function snapshot(): ActiveBlock | null {
  if (cached === undefined) cached = read();
  return cached;
}

function write(next: ActiveBlock | null) {
  cached = next;
  try {
    if (next) window.localStorage.setItem(KEY, JSON.stringify(next));
    else window.localStorage.removeItem(KEY);
  } catch {
    // Storage may be blocked; the block still runs for this session.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** "1h 23m" since the block began. */
export function elapsedLabel(startedAt: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

export function useActiveBlock() {
  const active = useSyncExternalStore(subscribe, snapshot, () => null);

  // A clock that ticks once a minute while a block runs, so the label moves.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [active]);

  const start = useCallback(() => {
    write({ date: zonedToday(), startTime: zonedClockNow(), startedAt: new Date().toISOString() });
    setNow(Date.now());
  }, []);
  const clear = useCallback(() => write(null), []);

  return { active, start, clear, elapsed: active ? elapsedLabel(active.startedAt, now) : null };
}
