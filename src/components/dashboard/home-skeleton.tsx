"use client";

import { useSyncExternalStore } from "react";
import { isInitialSyncComplete, onInitialSyncComplete } from "@/lib/supabase/sync";

/**
 * Whether the first look at the cloud has finished this visit. Until it has,
 * an empty phone (a new one, or one whose data was cleared) has nothing true
 * to show, and "$0 available · 0 reminders" read as a real answer.
 */
export function useFirstSyncDone(): boolean {
  return useSyncExternalStore(onInitialSyncComplete, isInitialSyncComplete, () => false);
}

/** Home's shape while the first numbers are on their way: placeholders, never fake zeros. */
export function HomeSkeleton() {
  return (
    <div className="space-y-3 pb-4 max-w-lg mx-auto" aria-busy="true" aria-label="Getting your numbers">
      <div className="flex items-center gap-2.5">
        <div className="kg-skel h-9 w-9 rounded-lg" />
        <div className="space-y-1.5">
          <div className="kg-skel h-4 w-40 rounded-md" />
          <div className="kg-skel h-3 w-28 rounded-md" />
        </div>
      </div>
      <div className="kg-skel h-9 rounded-xl" />
      <div className="kg-skel h-24 rounded-2xl" />
      <div className="kg-skel h-72 rounded-[var(--card-radius)]" />
      <p className="text-center text-[11px] text-muted">Getting your numbers from the cloud…</p>
    </div>
  );
}
