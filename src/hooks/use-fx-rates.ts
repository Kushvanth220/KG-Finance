"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { FxRates } from "@/lib/fx";

/**
 * Today's USD → INR / PHP market rates, shared by everything on the page.
 *
 * One small store rather than state per component: the rate panel and the
 * transfer form show the same number, and polling runs once however many
 * components are reading. The last good answer is kept on this device, so
 * the rates are on screen at once and survive a failed refresh — said to be
 * old, never silently.
 *
 * Polling every ten minutes while the page is visible; the server keeps its
 * own ten-minute copy, so this costs nothing upstream. The sources publish
 * daily, so polling faster would only repeat the same number.
 */

export interface FxState {
  rates: FxRates | null;
  status: "idle" | "loading" | "ready" | "error";
  error: string | null;
}

const STORAGE_KEY = "kg-fx-rates";
const POLL_MS = 10 * 60_000;
/**
 * A request that never answers (a phone between towers) must not leave the
 * panel saying "Checking" forever — or make every later refresh wait on it.
 */
const TIMEOUT_MS = 15_000;
const SERVER_STATE: FxState = { rates: null, status: "idle", error: null };

let state: FxState = SERVER_STATE;
let restored = false;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function emit(next: Partial<FxState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): FxState {
  if (!restored) {
    restored = true;
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) state = { ...state, rates: JSON.parse(saved) as FxRates };
    } catch {
      // Blocked or corrupt storage: start without a remembered rate.
    }
  }
  return state;
}

export function refreshFxRates(manual = false): Promise<void> {
  if (inflight) return inflight;
  emit({ status: "loading" });
  inflight = (async () => {
    try {
      const response = await fetch(`/api/fx${manual ? "?refresh=1" : ""}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const body = (await response.json()) as FxRates | { ok: false; error?: string };
      if (!response.ok || !body.ok) throw new Error(("error" in body && body.error) || "Rates unavailable");
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(body));
      } catch {
        // Not remembering the rate is no reason to refuse it.
      }
      emit({ rates: body, status: body.stale ? "error" : "ready", error: body.stale ? body.error ?? null : null });
    } catch {
      emit({
        status: "error",
        error: typeof navigator !== "undefined" && !navigator.onLine ? "You're offline." : "Couldn't reach the rate service.",
      });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

const refreshNow = () => refreshFxRates(true);

let pollers = 0;
let timer: ReturnType<typeof setInterval> | null = null;

function isDue() {
  const checked = state.rates ? Date.parse(state.rates.checkedAt) : 0;
  return Date.now() - checked >= POLL_MS;
}

function onVisible() {
  if (document.visibilityState === "visible" && isDue()) void refreshFxRates();
}

export function useFxRates() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => SERVER_STATE);

  useEffect(() => {
    pollers += 1;
    if (pollers === 1) {
      void refreshFxRates();
      timer = setInterval(onVisible, POLL_MS);
      document.addEventListener("visibilitychange", onVisible);
    }
    return () => {
      pollers -= 1;
      if (pollers === 0) {
        if (timer) clearInterval(timer);
        timer = null;
        document.removeEventListener("visibilitychange", onVisible);
      }
    };
  }, []);

  return { ...snapshot, refresh: refreshNow };
}
