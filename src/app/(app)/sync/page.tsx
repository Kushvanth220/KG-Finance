"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, Cloud, CloudOff, Loader2, RefreshCw } from "lucide-react";
import { SyncArt } from "@/components/art/page-art";
import { Tilt3D } from "@/components/art/tilt-3d";
import { AiUsageCard } from "@/components/sync/ai-usage-card";
import { GlassCard } from "@/components/ui/glass-card";
import { getSyncWorkspaceId, loadSyncConfig } from "@/lib/supabase/client";
import {
  getCurrentSyncStatus,
  getLastCheckedAt,
  getLastSyncError,
  hasPendingLocalChanges,
  onSyncStatusChange,
  readSyncMeta,
  syncNow,
  type SyncStatus,
} from "@/lib/supabase/sync";
import { useFinanceStore } from "@/store/finance-store";
import { startRulesLiveSync, useRulesStore } from "@/store/rules-store";
import { cn } from "@/lib/utils";

/**
 * The one page that answers "are our phones showing the same thing?"
 *
 * It says so in one line, backs it with a side-by-side count of what this
 * phone holds against what the cloud holds, and offers one button. The
 * project URL and workspace key are there for a bad day, folded away.
 */

interface CloudCounts {
  updated_at: string;
  transactions: number;
  incomeEntries: number;
  accounts: number;
  bills: number;
  flexDeposits: number;
}

interface HealthPayload {
  ok?: boolean;
  configured?: boolean;
  url?: string;
  workspaceId?: string;
  error?: string;
  matched?: CloudCounts;
  rows?: Array<{ workspace_id: string; transactions: number }>;
}

function agoLabel(iso: string | null, now: number): string {
  if (!iso) return "never";
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleString("en-US", { month: "2-digit", day: "2-digit", hour: "numeric", minute: "2-digit" });
}

/** The technical reasons, said plainly. */
function explain(error: string): string {
  if (/unreachable|Cannot reach|Failed to fetch|fetch failed|NAME_NOT_RESOLVED/i.test(error)) {
    return "This phone can't reach the cloud right now. Check the connection — it retries by itself.";
  }
  if (/Table missing|does not exist|Could not find the table/i.test(error)) {
    return "The cloud table is missing. Run supabase/setup.sql in Supabase → SQL Editor.";
  }
  if (/permission|RLS/i.test(error)) {
    return "The cloud refused the save (permissions). Run supabase/setup.sql again.";
  }
  if (/changed while saving/i.test(error)) {
    return "The other phone saved at the same moment — merged and retried.";
  }
  return error;
}

export default function SyncPage() {
  const transactions = useFinanceStore((state) => state.transactions);
  const incomeEntries = useFinanceStore((state) => state.incomeEntries);
  const accounts = useFinanceStore((state) => state.accounts);
  const monthlyExpenses = useFinanceStore((state) => state.monthlyExpenses);
  const flexDeposits = useFinanceStore((state) => state.flexDeposits);
  const ruleEntries = useRulesStore((state) => state.entries);

  const [status, setStatus] = useState<SyncStatus>(getCurrentSyncStatus);
  const [error, setError] = useState<string | null>(getLastSyncError);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [workspaceId, setWorkspaceId] = useState(getSyncWorkspaceId());
  const [supabaseUrl, setSupabaseUrl] = useState<string | null>(null);
  const [cloud, setCloud] = useState<CloudCounts | null>(null);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [cloudChecking, setCloudChecking] = useState(true);
  const [cloudRules, setCloudRules] = useState<{ entries: number; updated_at: string | null } | null>(null);
  const [otherRows, setOtherRows] = useState<Array<{ workspace_id: string; transactions: number }>>([]);
  const [meta, setMeta] = useState(readSyncMeta);
  const [checkedAt, setCheckedAt] = useState<string | null>(getLastCheckedAt);
  const [pending, setPending] = useState(hasPendingLocalChanges);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Flex blocks travel on their own channel; keep it live while we look.
  useEffect(() => startRulesLiveSync(), []);

  const checkCloud = useCallback(async () => {
    setCloudChecking(true);
    try {
      const [health, rules] = await Promise.all([
        fetch("/api/cloud-health", { cache: "no-store" }).then((res) => res.json() as Promise<HealthPayload>),
        fetch("/api/rules", { cache: "no-store" })
          .then((res) => res.json() as Promise<{ ok?: boolean; entries?: unknown[]; updated_at?: string | null }>)
          .catch(() => null),
      ]);
      if (health.ok && health.matched) {
        setCloud(health.matched);
        setCloudError(null);
      } else if (health.ok && health.rows?.length) {
        setCloud(null);
        setCloudError(`Connected, but there is no row for "${health.workspaceId}" yet.`);
      } else {
        setCloud(null);
        setCloudError(health.error ?? "Could not read the cloud.");
      }
      setOtherRows((health.rows ?? []).filter((row) => row.workspace_id !== health.workspaceId));
      if (rules?.ok) setCloudRules({ entries: rules.entries?.length ?? 0, updated_at: rules.updated_at ?? null });
    } catch {
      setCloud(null);
      setCloudError("Could not reach the cloud from this phone.");
    } finally {
      setCloudChecking(false);
    }
  }, []);

  useEffect(() => {
    void loadSyncConfig().then((config) => {
      setConfigured(Boolean(config));
      if (!config) {
        setCloudChecking(false);
        return;
      }
      setWorkspaceId(config.workspaceId);
      setSupabaseUrl(config.supabaseUrl);
      void checkCloud();
    });

    const unsubscribe = onSyncStatusChange((next, err) => {
      setStatus(next);
      setError(err ?? getLastSyncError());
      setMeta(readSyncMeta());
      setPending(hasPendingLocalChanges());
      if (next === "synced") void checkCloud();
    });

    // The "ago" label and the pending flag move on their own clock.
    const tick = setInterval(() => {
      setNow(Date.now());
      setMeta(readSyncMeta());
      setPending(hasPendingLocalChanges());
      setCheckedAt(getLastCheckedAt());
    }, 3_000);

    return () => {
      unsubscribe();
      clearInterval(tick);
    };
  }, [checkCloud]);

  const runSyncNow = async () => {
    setBusy(true);
    try {
      await syncNow();
      await checkCloud();
    } finally {
      setBusy(false);
    }
  };

  const rows: Array<{ label: string; here: number; cloud: number | null }> = [
    { label: "Transactions", here: transactions.length, cloud: cloud?.transactions ?? null },
    { label: "Income entries", here: incomeEntries.length, cloud: cloud?.incomeEntries ?? null },
    { label: "Accounts", here: accounts.length, cloud: cloud?.accounts ?? null },
    { label: "Bills", here: monthlyExpenses.length, cloud: cloud?.bills ?? null },
    { label: "Flex deposits", here: flexDeposits?.length ?? 0, cloud: cloud?.flexDeposits ?? null },
    { label: "Flex blocks", here: ruleEntries.length, cloud: cloudRules?.entries ?? null },
  ];
  const allLevel = cloud !== null && rows.every((row) => row.cloud === null || row.cloud === row.here);

  const headline =
    configured === false
      ? { tone: "#ff9500", text: "Not connected yet" }
      : status === "syncing" || busy
        ? { tone: "#007aff", text: "Syncing…" }
        : status === "error"
          ? { tone: "#ff3b30", text: "Sync problem" }
          : pending
            ? { tone: "#ff9500", text: "Changes waiting to upload" }
            : cloud && !allLevel
              ? { tone: "#ff9500", text: "Cloud has something this phone hasn't" }
              : { tone: "#34c759", text: "Up to date" };

  const artStatus =
    configured === false
      ? "offline"
      : status === "syncing" || busy
        ? "syncing"
        : status === "error"
          ? "offline"
          : "synced";

  return (
    <div className="max-w-lg mx-auto space-y-4 pb-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Cloud className="w-7 h-7 text-[#007aff]" />
          Cloud Sync
        </h1>
        <p className="text-muted mt-1 text-sm">
          Both phones share one record. Edits merge — nothing gets overwritten.
        </p>
      </div>

      {/* The state, drawn: dots travel the wire only while a sync is running,
          the tick appears only once both phones agree. */}
      <Tilt3D max={6} className="rounded-2xl">
        <div className="glass rounded-2xl px-4 py-5">
          <SyncArt status={artStatus} />
        </div>
      </Tilt3D>

      {configured === false ? (
        <GlassCard className="p-5 space-y-2">
          <p className="flex items-center gap-2 font-medium text-[#ff9500]">
            <CloudOff className="h-4 w-4" /> Not connected yet
          </p>
          <p className="text-sm text-muted">
            Add the Supabase URL and anon key to Vercel&apos;s environment variables and redeploy. Until
            then each phone keeps its own copy.
          </p>
        </GlassCard>
      ) : configured === null ? (
        <GlassCard className="p-5">
          <Loader2 className="w-5 h-5 animate-spin text-[#007aff]" />
        </GlassCard>
      ) : (
        <GlassCard className="!p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold" style={{ color: headline.tone }}>
                {status === "syncing" || busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : headline.text === "Up to date" ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Cloud className="h-4 w-4" />
                )}
                {headline.text}
              </p>
              <p className="mt-0.5 text-[11px] text-muted tabular-nums">
                Checked {agoLabel(checkedAt, now)} · last change {agoLabel(meta.lastSyncedAt, now)}
                {meta.lastPushedAt ? ` · last upload ${agoLabel(meta.lastPushedAt, now)}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={runSyncNow}
              disabled={busy}
              className="hit inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#007aff] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              <RefreshCw className={cn("h-3.5 w-3.5", busy && "animate-spin")} /> Sync now
            </button>
          </div>

          {error ? (
            <div className="rounded-xl bg-[#ff3b30]/10 px-3 py-2 text-[12px]">
              <p className="font-medium text-[#ff3b30]">{explain(error)}</p>
              {explain(error) !== error ? <p className="mt-0.5 text-[10px] text-muted">{error}</p> : null}
            </div>
          ) : cloudError ? (
            <div className="rounded-xl bg-[#ff9500]/10 px-3 py-2 text-[12px] text-[#ff9500]">{cloudError}</div>
          ) : null}

          {/* This phone against the cloud, one line per kind of record. */}
          <div className="rounded-xl border border-black/5 dark:border-white/10">
            <div className="grid grid-cols-[1fr_auto_auto_1.5rem] items-center gap-x-3 border-b border-black/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted dark:border-white/10">
              <span>Record</span>
              <span className="text-right">This phone</span>
              <span className="text-right">Cloud</span>
              <span />
            </div>
            {rows.map((row) => {
              const level = row.cloud !== null && row.cloud === row.here;
              return (
                <div
                  key={row.label}
                  className="grid grid-cols-[1fr_auto_auto_1.5rem] items-center gap-x-3 px-3 py-1.5 text-[12px] tabular-nums"
                >
                  <span>{row.label}</span>
                  <span className="text-right font-semibold">{row.here}</span>
                  <span className="text-right text-muted">
                    {cloudChecking && row.cloud === null ? "…" : row.cloud === null ? "—" : row.cloud}
                  </span>
                  <span className="flex justify-end">
                    {row.cloud === null ? null : level ? (
                      <Check className="h-3.5 w-3.5 text-[#34c759]" aria-label="Level" />
                    ) : (
                      <span className="h-2 w-2 rounded-full bg-[#ff9500]" aria-label="Differs" />
                    )}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-muted">
            Counts differ for a moment while a change travels; if one stays different, tap Sync now.
            The Flex blocks travel on their own channel and refresh every 30 seconds.
          </p>
        </GlassCard>
      )}

      <AiUsageCard />

      <GlassCard className="!p-4 space-y-2">
        <p className="font-medium text-sm">How it works</p>
        <ul className="text-sm text-muted space-y-1 list-disc list-inside">
          <li>Edit anything on either phone — it uploads within a second.</li>
          <li>The other phone picks it up within a few seconds while open, or when it is next opened.</li>
          <li>Both phones can change things at the same time. The app merges the two — a spend here and a spend there both stay, and balances take both.</li>
          <li>A deletion on one phone is a deletion on both.</li>
        </ul>
      </GlassCard>

      {configured ? (
        <GlassCard className="!p-4">
          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            className="hit flex w-full items-center justify-between text-sm font-medium"
            aria-expanded={detailsOpen}
          >
            Details
            <ChevronDown className={cn("h-4 w-4 text-muted transition-transform", detailsOpen && "rotate-180")} />
          </button>
          {detailsOpen ? (
            <div className="mt-2 space-y-1 text-[11px] text-muted">
              <p className="truncate">Project: {supabaseUrl ?? "—"}</p>
              <p>Workspace: {workspaceId}</p>
              <p>Cloud record updated: {cloud?.updated_at ? new Date(cloud.updated_at).toLocaleString("en-US") : "—"}</p>
              <p>Flex record updated: {cloudRules?.updated_at ? new Date(cloudRules.updated_at).toLocaleString("en-US") : "—"}</p>
              <p>This phone last agreed with the cloud: {meta.lastSyncedAt ? new Date(meta.lastSyncedAt).toLocaleString("en-US") : "never"}</p>
              {otherRows.length > 0 ? (
                <p>Other workspaces in this project: {otherRows.map((row) => `${row.workspace_id} (${row.transactions} tx)`).join(", ")}</p>
              ) : null}
            </div>
          ) : null}
        </GlassCard>
      ) : null}
    </div>
  );
}
