"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { isSupabaseConfiguredAsync } from "@/lib/supabase/client";
import { waitForStoreHydration } from "@/store/finance-store";

export function SyncReadyGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);

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

  if (!ready) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <Loader2 className="h-6 w-6 animate-spin text-[#007aff]" />
        <p className="text-sm font-medium">Loading your finances…</p>
      </div>
    );
  }

  return children;
}
