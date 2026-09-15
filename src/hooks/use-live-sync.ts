"use client";

import { useEffect, useState } from "react";
import { isSupabaseConfiguredAsync } from "@/lib/supabase/client";
import {
  onSyncStatusChange,
  readSyncMeta,
  type SyncStatus,
} from "@/lib/supabase/sync";

export function useLiveSync() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [status, setStatus] = useState<SyncStatus>("offline");
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);

  useEffect(() => {
    void isSupabaseConfiguredAsync().then(setConfigured);

    const refreshMeta = () => {
      setLastSyncedAt(readSyncMeta().lastSyncedAt);
    };

    refreshMeta();

    const unsubscribe = onSyncStatusChange((next) => {
      setStatus(next);
      if (next === "synced") {
        refreshMeta();
      }
    });

    const metaTimer = setInterval(refreshMeta, 3_000);

    return () => {
      unsubscribe();
      clearInterval(metaTimer);
    };
  }, []);

  return {
    configured,
    status,
    lastSyncedAt,
    isLive: configured === true && (status === "synced" || status === "idle"),
    isSyncing: status === "syncing",
  };
}
