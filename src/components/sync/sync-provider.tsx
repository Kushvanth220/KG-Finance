"use client";

import { useEffect, useRef } from "react";
import { loadSyncConfig } from "@/lib/supabase/client";
import {
  clearPendingLocalChanges,
  flushPendingPush,
  isApplyingRemoteSync,
  markInitialSyncComplete,
  markLocalChangePending,
  onSyncStatusChange,
  runAutoSyncCycle,
  runInitialSyncSession,
  scheduleFinancePush,
  stopSyncSession,
} from "@/lib/supabase/sync";
import {
  applyRemoteFinanceState,
  getFinanceState,
  useFinanceStore,
  waitForStoreHydration,
} from "@/store/finance-store";

export function SyncProvider() {
  const readyRef = useRef(false);
  const workspaceIdRef = useRef<string | null>(null);
  const unsubscribeStoreRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    let cancelled = false;

    function startStoreSubscription() {
      if (unsubscribeStoreRef.current) return;

      unsubscribeStoreRef.current = useFinanceStore.subscribe(() => {
        if (isApplyingRemoteSync()) return;

        markLocalChangePending();

        const workspaceId = workspaceIdRef.current;
        if (!workspaceId || !readyRef.current) return;

        scheduleFinancePush(workspaceId, getFinanceState);
      });
    }

    async function startSync() {
      const config = await loadSyncConfig();
      if (cancelled || !config) {
        markInitialSyncComplete();
        return;
      }

      workspaceIdRef.current = config.workspaceId;
      readyRef.current = false;

      try {
        await waitForStoreHydration();
        if (cancelled) return;

        clearPendingLocalChanges();

        await runInitialSyncSession(
          config,
          getFinanceState,
          applyRemoteFinanceState
        );

        if (cancelled) return;

        readyRef.current = true;
        startStoreSubscription();

        await runAutoSyncCycle(
          config.workspaceId,
          getFinanceState,
          applyRemoteFinanceState
        );
      } catch {
        readyRef.current = true;
        clearPendingLocalChanges();
        const workspaceId = workspaceIdRef.current;
        if (workspaceId) {
          void runAutoSyncCycle(
            workspaceId,
            getFinanceState,
            applyRemoteFinanceState
          ).finally(() => {
            startStoreSubscription();
          });
        } else {
          startStoreSubscription();
        }
      } finally {
        markInitialSyncComplete();
      }
    }

    void startSync();

    function runBackgroundSync() {
      const workspaceId = workspaceIdRef.current;
      if (!workspaceId || !readyRef.current) return;

      void runAutoSyncCycle(
        workspaceId,
        getFinanceState,
        applyRemoteFinanceState
      );
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        void flushPendingPush();
        return;
      }
      runBackgroundSync();
    }

    function handlePageHide() {
      void flushPendingPush();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", runBackgroundSync);
    window.addEventListener("pagehide", handlePageHide);

    const unsubscribeStatus = onSyncStatusChange(() => {
      // Status is consumed by SyncStatusBadge and /sync page.
    });

    return () => {
      cancelled = true;
      unsubscribeStoreRef.current?.();
      unsubscribeStoreRef.current = null;
      unsubscribeStatus();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", runBackgroundSync);
      window.removeEventListener("pagehide", handlePageHide);
      readyRef.current = false;
      workspaceIdRef.current = null;
      stopSyncSession();
    };
  }, []);

  return null;
}
