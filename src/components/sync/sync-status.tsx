"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronRight, CloudOff } from "lucide-react";
import { isSupabaseConfiguredAsync } from "@/lib/supabase/client";
import {
  getCurrentSyncStatus,
  getLastCheckedAt,
  getLastSyncError,
  hasPendingLocalChanges,
  onSyncStatusChange,
  type SyncStatus,
} from "@/lib/supabase/sync";
import { formatTime } from "@/lib/formatters";
import { cn } from "@/lib/utils";

/**
 * The one place that says whether this phone and the cloud agree: a word next
 * to the logo (Saved, Syncing…, Offline, Sync problem) that always means the
 * same thing, with the details a tap away. It replaces "Auto-sync" here and
 * the "Live" pill that used to sit under the greeting on Home.
 */

const subscribeStatus = (listener: () => void) => onSyncStatusChange(() => listener());
const subscribeOnline = (listener: () => void) => {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
};

// When realtime drops, the app falls back to checking every few seconds and
// nothing is lost: that is still "Saved", not a problem.
const isFallbackOnly = (error: string | null) => Boolean(error?.startsWith("Live sync unavailable"));

type Look = { word: string; tone: "good" | "busy" | "warn" | "bad"; title: string; detail: string };

function lookFor(status: SyncStatus, online: boolean, error: string | null): Look {
  if (!online) {
    return {
      word: "Offline",
      tone: "warn",
      title: "No signal",
      detail: hasPendingLocalChanges()
        ? "Your changes are kept on this phone and go up as soon as the signal is back."
        : "Showing what this phone has. It catches up as soon as the signal is back.",
    };
  }
  if (status === "syncing") {
    // The same state covers sending this phone's changes and fetching the other's.
    return {
      word: "Syncing…",
      tone: "busy",
      title: "Syncing with the cloud",
      detail: "Sending this phone's changes and fetching the other's. It takes a few seconds.",
    };
  }
  if (status === "error" && !isFallbackOnly(error)) {
    return { word: "Sync problem", tone: "bad", title: "Sync needs a look", detail: error ?? "The last save didn't go through." };
  }
  return {
    word: "Saved",
    tone: "good",
    title: "Saved to the cloud",
    detail: isFallbackOnly(error)
      ? "Live updates are paused, so this phone checks the cloud every few seconds instead."
      : "Both phones are up to date. Changes travel in a few seconds.",
  };
}

const DOT: Record<Look["tone"], string> = {
  good: "bg-positive",
  busy: "bg-accent kg-sync-dot-busy",
  warn: "bg-caution",
  bad: "bg-negative",
};

export function SyncStatusBadge() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const status = useSyncExternalStore(subscribeStatus, getCurrentSyncStatus, () => "idle" as SyncStatus);
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const [open, setOpen] = useState(false);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void isSupabaseConfiguredAsync().then(setConfigured);
  }, []);

  // Close on a tap anywhere else, or Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (configured === false) {
    return (
      <Link
        href="/sync"
        className="inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium text-caution hover:bg-black/5 dark:hover:bg-white/5"
      >
        <CloudOff className="h-3.5 w-3.5" />
        Set up sync
      </Link>
    );
  }

  const look = configured === null ? null : lookFor(status, online, getLastSyncError());

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => {
          setCheckedAt(getLastCheckedAt());
          setOpen((was) => !was);
        }}
        aria-expanded={open}
        aria-label={look ? `Sync: ${look.word}. Show details.` : "Checking sync"}
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold text-muted transition-colors hover:bg-black/5 hover:text-foreground dark:hover:bg-white/5"
      >
        <span className={cn("h-2 w-2 rounded-full", look ? DOT[look.tone] : "bg-muted kg-sync-dot-busy")} aria-hidden />
        <span className={cn(look?.tone === "bad" && "text-negative", look?.tone === "warn" && "text-caution")}>
          {look ? look.word : "Checking…"}
        </span>
      </button>

      {open && look ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 space-y-1.5 rounded-2xl border border-black/10 bg-[var(--modal-surface)] p-3 text-left shadow-2xl animate-scale-in dark:border-white/10">
          <p className="text-sm font-semibold">{look.title}</p>
          <p className="text-xs text-muted">{look.detail}</p>
          {checkedAt ? (
            <p className="text-[11px] text-muted">Last heard from the cloud at {formatTime("", "", checkedAt)}</p>
          ) : null}
          <Link
            href="/sync"
            onClick={() => setOpen(false)}
            className="flex items-center justify-between rounded-xl bg-black/[0.04] px-2.5 py-2 text-xs font-semibold text-accent dark:bg-white/[0.06]"
          >
            Open Cloud sync <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
