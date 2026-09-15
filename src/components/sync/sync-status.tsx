"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Cloud, CloudOff, Loader2 } from "lucide-react";
import { isSupabaseConfiguredAsync } from "@/lib/supabase/client";
import {
  getLastSyncError,
  onSyncStatusChange,
  type SyncStatus,
} from "@/lib/supabase/sync";
import { cn } from "@/lib/utils";

export function SyncStatusBadge() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [status, setStatus] = useState<SyncStatus>("offline");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void isSupabaseConfiguredAsync().then(setConfigured);

    const unsubscribe = onSyncStatusChange((next, nextError) => {
      setStatus(next);
      setError(nextError ?? getLastSyncError());
    });

    return unsubscribe;
  }, []);

  if (configured === null) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-muted">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      </span>
    );
  }

  if (!configured) {
    return (
      <Link
        href="/sync"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-[#ff9500] hover:bg-black/5 dark:hover:bg-white/5"
        title="Cloud sync not configured"
      >
        <CloudOff className="w-3.5 h-3.5" />
        Setup sync
      </Link>
    );
  }

  const label =
    status === "syncing"
      ? "Syncing"
      : status === "error"
        ? "Sync error"
        : "Auto-sync";

  const Icon = status === "syncing" ? Loader2 : Cloud;

  return (
    <Link
      href="/sync"
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all",
        "text-muted hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5",
        status === "error" && "text-[#ff3b30]"
      )}
      title={error ?? label}
    >
      <Icon className={cn("w-3.5 h-3.5", status === "syncing" && "animate-spin")} />
      {label}
    </Link>
  );
}
