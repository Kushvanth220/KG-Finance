"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { contentHeld, subscribeLaunch } from "@/components/brand/launch-state";
import { isSupabaseConfiguredAsync } from "@/lib/supabase/client";
import { waitForStoreHydration } from "@/store/finance-store";

export function SyncReadyGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  // While the lion forms on the launch screen, the page waits underneath it.
  const held = useSyncExternalStore(subscribeLaunch, contentHeld, () => false);

  useEffect(() => {
    let cancelled = false;
    const fallback = window.setTimeout(() => {
      if (!cancelled) setReady(true);
    }, 1200);

    void waitForStoreHydration(1200).then(() => {
      if (cancelled) return;
      window.clearTimeout(fallback);
      setReady(true);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
    };
  }, []);

  useEffect(() => {
    void isSupabaseConfiguredAsync();
  }, []);

  if (!ready || held) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-accent" />
        <p className="text-sm font-medium">Loading your finances…</p>
      </div>
    );
  }

  return children;
}
