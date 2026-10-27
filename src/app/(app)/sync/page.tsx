"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Check, ChevronDown, Cloud, CloudOff, Download, Loader2, RefreshCw } from "lucide-react";
import { AiUsageCard } from "@/components/sync/ai-usage-card";
import { DoubledReminders } from "@/components/sync/doubled-reminders";
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
import { zonedToday } from "@/lib/zoned-date";
import { getFinanceState, useFinanceStore } from "@/store/finance-store";
import { startRulesLiveSync, useRulesStore } from "@/store/rules-store";
import { useAssistantPreferencesStore } from "@/store/assistant-preferences-store";
import { cn } from "@/lib/utils";

/**
 * The one page that answers "are our devices showing the same thing?"
 *
 * This phone and the cloud side by side, one row per kind of record, each
 * ticked as it is found to match. Anything that needs a hand (reminders saved
 * twice, an upload waiting, a problem reaching the cloud) is said under the
 * table with its fix next to it. The project URL and workspace key are there
 * for a bad day, folded away.
 */

interface CloudCounts {
  updated_at: string;
  transactions: number;
  incomeEntries: number;
  accounts: number;
  bills: number;
  flexDeposits: number;
  /** Absent from a server that predates money transfers. */
  remittances?: number;
  /** Absent from a server that predates self transfers. */
  selfTransfers?: number;
  homeLayoutAt?: string | null;
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

interface CompareRow {
  label: string;
  here: string;
  /** Null while unknown (not checked yet, or the cloud could not say). */
  cloud: string | null;
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

/** Everything this device holds, as one file to keep somewhere safe. */
function downloadBackup(workspaceId: string) {
  const backup = {
    exportedAt: new Date().toISOString(),
    workspaceId,
    finance: getFinanceState(),
    reminders: useAssistantPreferencesStore.getState().structuredReminders,
    rules: { rules: useRulesStore.getState().rules, entries: useRulesStore.getState().entries },
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `kg-finance-backup-${zonedToday()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const ROW_HEIGHT = 40;

export default function SyncPage() {
  const still = useReducedMotion();
  const transactions = useFinanceStore((state) => state.transactions);
  const incomeEntries = useFinanceStore((state) => state.incomeEntries);
  const accounts = useFinanceStore((state) => state.accounts);
  const monthlyExpenses = useFinanceStore((state) => state.monthlyExpenses);
  const flexDeposits = useFinanceStore((state) => state.flexDeposits);
  const remittances = useFinanceStore((state) => state.remittances);
  const homeLayout = useFinanceStore((state) => state.homeLayout);
  const ruleEntries = useRulesStore((state) => state.entries);
  const reminders = useAssistantPreferencesStore((state) => state.structuredReminders);

  const [status, setStatus] = useState<SyncStatus>(getCurrentSyncStatus);
  const [error, setError] = useState<string | null>(getLastSyncError);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [workspaceId, setWorkspaceId] = useState(getSyncWorkspaceId());
  const [supabaseUrl, setSupabaseUrl] = useState<string | null>(null);
  const [cloud, setCloud] = useState<CloudCounts | null>(null);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [cloudChecking, setCloudChecking] = useState(true);
  const [cloudRules, setCloudRules] = useState<{ entries: number; updated_at: string | null } | null>(null);
  const [cloudReminders, setCloudReminders] = useState<number | null>(null);
  const [otherRows, setOtherRows] = useState<Array<{ workspace_id: string; transactions: number }>>([]);
  const [meta, setMeta] = useState(readSyncMeta);
  const [checkedAt, setCheckedAt] = useState<string | null>(getLastCheckedAt);
  const [pending, setPending] = useState(hasPendingLocalChanges);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  // Bumped after every check, so the ticks pop in again row by row.
  const [round, setRound] = useState(0);

  // Flex blocks travel on their own channel; keep it live while we look.
  useEffect(() => startRulesLiveSync(), []);

  /** The stamp the Flex block count on screen was taken from. */
  const countedRulesStamp = useRef<string | null>(null);

  const checkCloud = useCallback(async () => {
    setCloudChecking(true);
    try {
      // Counting the cloud's Flex blocks used to download the whole rules
      // document — 37 KB to learn one number, on open and after every sync.
      // The stamp answers "has it moved?" in about fifty bytes; the document
      // only travels when it has.
      const known = countedRulesStamp.current;
      const [health, rules, prefs] = await Promise.all([
        fetch("/api/cloud-health", { cache: "no-store" }).then((res) => res.json() as Promise<HealthPayload>),
        fetch(known ? `/api/rules?stamp=${encodeURIComponent(known)}` : "/api/rules", { cache: "no-store" })
          .then(
            (res) =>
              res.json() as Promise<{
                ok?: boolean;
                unchanged?: boolean;
                entries?: unknown[];
                updated_at?: string | null;
              }>
          )
          .catch(() => null),
        fetch("/api/ai/preferences", { cache: "no-store" })
          .then((res) => res.json() as Promise<{ ok?: boolean; preferences?: { reminder_data?: unknown[] } | null }>)
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
      // "unchanged" carries no document, so the count already on screen stands.
      if (rules?.ok && !rules.unchanged) {
        countedRulesStamp.current = rules.updated_at ?? null;
        setCloudRules({ entries: rules.entries?.length ?? 0, updated_at: rules.updated_at ?? null });
      }
      setCloudReminders(prefs?.ok && Array.isArray(prefs.preferences?.reminder_data) ? prefs.preferences.reminder_data.length : null);
    } catch {
      setCloud(null);
      setCloudError("Could not reach the cloud from this phone.");
    } finally {
      setCloudChecking(false);
      setRound((n) => n + 1);
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

  const count = (value: number | undefined | null) => (value == null ? null : String(value));
  const rows: CompareRow[] = [
    { label: "Spends & payments", here: String(transactions.length), cloud: count(cloud?.transactions) },
    { label: "Income", here: String(incomeEntries.length), cloud: count(cloud?.incomeEntries) },
    { label: "Accounts", here: String(accounts.length), cloud: count(cloud?.accounts) },
    {
      label: "Self transfers",
      here: String(transactions.filter((t) => t.type === "transfer").length),
      cloud: count(cloud?.selfTransfers),
    },
    { label: "Bills", here: String(monthlyExpenses.length), cloud: count(cloud?.bills) },
    { label: "Reminders", here: String(reminders.length), cloud: count(cloudReminders) },
    { label: "Flex blocks", here: String(ruleEntries.length), cloud: count(cloudRules?.entries) },
    { label: "Flex deposits", here: String(flexDeposits?.length ?? 0), cloud: count(cloud?.flexDeposits) },
    { label: "Money transfers", here: String(remittances?.length ?? 0), cloud: count(cloud?.remittances) },
    {
      label: "Home card layout",
      here: homeLayout ? "saved" : "default",
      // Same layout when both carry the same change time, or neither has one.
      cloud:
        cloud === null || cloud.homeLayoutAt === undefined
          ? null
          : (cloud.homeLayoutAt ?? null) === (homeLayout?.updatedAt ?? null)
            ? homeLayout
              ? "saved"
              : "default"
            : cloud.homeLayoutAt
              ? "newer"
              : "default",
    },
  ];
  const known = rows.filter((row) => row.cloud !== null);
  const allLevel = cloud !== null && known.every((row) => row.cloud === row.here);
  const checking = cloudChecking || busy || status === "syncing";

  const headline =
    configured === false
      ? { tone: "text-caution", text: "Not connected yet" }
      : checking
        ? { tone: "text-accent", text: "Checking…" }
        : status === "error"
          ? { tone: "text-negative", text: "Sync problem" }
          : pending
            ? { tone: "text-caution", text: "Changes waiting to upload" }
            : cloud && !allLevel
              ? { tone: "text-caution", text: "This phone and the cloud differ" }
              : { tone: "text-positive", text: "Everything matches" };

  return (
    <div className="max-w-lg mx-auto space-y-3 pb-8">
      <div>
        <h1 className="text-lg font-bold leading-tight">Cloud sync</h1>
        <p className="text-[11px] text-muted">This phone and the cloud, side by side</p>
      </div>

      {configured === false ? (
        <GlassCard className="p-5 space-y-2">
          <p className="flex items-center gap-2 font-medium text-caution">
            <CloudOff className="h-4 w-4" /> Not connected yet
          </p>
          <p className="text-sm text-muted">
            Add the Supabase URL and anon key to Vercel&apos;s environment variables and redeploy. Until
            then each phone keeps its own copy.
          </p>
        </GlassCard>
      ) : configured === null ? (
        <GlassCard className="p-5">
          <Loader2 className="w-5 h-5 animate-spin text-accent" />
        </GlassCard>
      ) : (
        <>
          <GlassCard className="!p-3 space-y-2">
            <div className="flex items-start justify-between gap-3 px-1">
              <div className="min-w-0">
                <p className={cn("flex items-center gap-1.5 text-sm font-semibold", headline.tone)}>
                  {checking ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : headline.text === "Everything matches" ? (
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
            </div>

            {/* This phone against the cloud. A light sweeps the rows while a check runs; each match ticks in turn. */}
            <div className="rounded-xl border border-black/5 dark:border-white/10">
              <div className="grid grid-cols-[1fr_4.5rem_4.5rem_1.75rem] items-center gap-x-2 border-b border-black/5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted dark:border-white/10">
                <span />
                <span className="text-right">Here</span>
                <span className="text-right">Cloud</span>
                <span />
              </div>
              <div className="relative overflow-hidden">
                {checking && !still ? <span aria-hidden className="kg-sync-scan" /> : null}
                {rows.map((row, index) => {
                  const level = row.cloud !== null && row.cloud === row.here;
                  return (
                    <div
                      key={row.label}
                      className="relative grid grid-cols-[1fr_4.5rem_4.5rem_1.75rem] items-center gap-x-2 border-b border-black/[0.04] px-3 text-[12.5px] tabular-nums last:border-b-0 dark:border-white/[0.05]"
                      style={{ height: ROW_HEIGHT }}
                    >
                      <span>{row.label}</span>
                      <span className="text-right font-semibold">{row.here}</span>
                      <span className="text-right text-muted">
                        {row.cloud === null ? (cloudChecking ? "…" : "—") : row.cloud}
                      </span>
                      <span className="flex justify-center">
                        {row.cloud === null || checking ? null : (
                          <motion.span
                            key={`${round}-${row.label}`}
                            initial={still ? false : { scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: still ? 0 : index * 0.09, type: "spring", stiffness: 420, damping: 20 }}
                            className="flex"
                          >
                            {level ? (
                              <Check className="h-4 w-4 text-positive" aria-label="Matches" />
                            ) : (
                              <span className="text-[13px] font-bold text-caution" aria-label="Differs">!</span>
                            )}
                          </motion.span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <p className="px-1 text-[10px] text-muted">
              A count can differ for a moment while a change travels; if one stays different, tap Check again.
            </p>
          </GlassCard>

          {error ? (
            <div className="rounded-2xl bg-negative/10 px-3.5 py-3 text-[12px]">
              <p className="font-medium text-negative">{explain(error)}</p>
              {explain(error) !== error ? <p className="mt-0.5 text-[10px] text-muted">{error}</p> : null}
            </div>
          ) : cloudError ? (
            <div className="rounded-2xl bg-caution/10 px-3.5 py-3 text-[12px] text-caution">{cloudError}</div>
          ) : null}

          <DoubledReminders />

          {allLevel && !checking && !error ? (
            <motion.div
              key={round}
              initial={still ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: still ? 0 : rows.length * 0.09, duration: 0.35 }}
              className="rounded-2xl border border-positive/40 bg-positive/10 px-3.5 py-3 text-[13px] font-semibold text-positive"
            >
              Everything matches · checked {agoLabel(checkedAt, now)}
            </motion.div>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => downloadBackup(workspaceId)}
              className="glass inline-flex h-12 items-center justify-center gap-1.5 rounded-2xl text-[13px] font-semibold"
            >
              <Download className="h-4 w-4" /> Download a backup
            </button>
            <button
              type="button"
              onClick={runSyncNow}
              disabled={busy}
              className="inline-flex h-12 items-center justify-center gap-1.5 rounded-2xl bg-accent text-[13px] font-bold text-white disabled:opacity-50"
            >
              <RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} /> Check again
            </button>
          </div>
        </>
      )}

      <AiUsageCard />

      <GlassCard className="!p-4 space-y-2">
        <p className="font-medium text-sm">How it works</p>
        <ul className="text-sm text-muted space-y-1 list-disc list-inside">
          <li>Edit anything on any device — it uploads within a second.</li>
          <li>Other open devices pick it up within a second or two, or when they are next opened.</li>
          <li>Two devices can change things at the same time. The app merges them — a spend here and a spend there both stay, and balances take both.</li>
          <li>Reminders and the Home card layout travel the same way. A deletion on one device is a deletion on all of them.</li>
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
