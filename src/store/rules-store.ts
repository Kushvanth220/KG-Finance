"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";
import { dueFollowUps, isEntryComplete, triggerDueToday } from "@/lib/rules/engine";
import type { DueFollowUp, Rule, RuleEntry, RuleScope } from "@/lib/rules/types";
import { zonedToday } from "@/lib/zoned-date";
import { createClient, getSyncWorkspaceId, loadSyncConfig } from "@/lib/supabase/client";

const STORAGE_KEY = "kg-finance-rules-v1";

/* ------------------------------------------------------------------ */
/* Merging two copies                                                   */
/* ------------------------------------------------------------------ */

interface RulesDocument {
  rules: Rule[];
  entries: RuleEntry[];
  deleted: Record<string, string>;
}

/** Headstones older than this have been seen by every device that matters. */
const TOMBSTONE_DAYS = 90;

function normaliseRemote(payload: {
  rules?: unknown;
  entries?: unknown;
  deleted?: unknown;
}): RulesDocument {
  // A rule arriving without a scope would match neither person on the
  // Rules page — invisible, and so impossible to edit or delete while it
  // kept syncing. Anything unrecognised is treated as workspace's, which at
  // least puts it on screen where it can be dealt with.
  const rules = (Array.isArray(payload.rules) ? (payload.rules as Rule[]) : [])
    .filter((rule) => rule && typeof rule.id === "string" && rule.id)
    .map((rule) => ({
      ...rule,
      scope:
        rule.scope === "kushvanth" || rule.scope === "g" ? rule.scope : ("shared" as const),
      enabled: rule.enabled !== false,
      fields: Array.isArray(rule.fields) ? rule.fields : [],
      followUps: Array.isArray(rule.followUps) ? rule.followUps : [],
      calculations: Array.isArray(rule.calculations) ? rule.calculations : [],
      charts: Array.isArray(rule.charts) ? rule.charts : [],
    }));
  const entries = (Array.isArray(payload.entries) ? (payload.entries as RuleEntry[]) : []).filter(
    (entry) => entry && typeof entry.id === "string" && entry.ruleId
  );
  const deleted =
    payload.deleted && typeof payload.deleted === "object"
      ? (payload.deleted as Record<string, string>)
      : {};
  return { rules, entries, deleted };
}

/**
 * Union by id, latest write winning, minus anything either side deleted.
 *
 * A union cannot drop a record only one side holds — which is the failure
 * this replaced, where a stale phone's save erased the laptop's blocks. The
 * headstones are what let a delete still travel.
 */
export function mergeRulesDocuments(local: RulesDocument, remote: RulesDocument): RulesDocument {
  const cutoff = new Date(Date.now() - TOMBSTONE_DAYS * 86400000).toISOString();
  const deleted: Record<string, string> = {};
  for (const [id, at] of Object.entries({ ...remote.deleted, ...local.deleted })) {
    if (typeof at === "string" && at > cutoff) deleted[id] = at;
  }

  const merge = <T extends { id: string }>(mine: T[], theirs: T[], at: (item: T) => string): T[] => {
    const byId = new Map<string, T>();
    for (const item of theirs) byId.set(item.id, item);
    for (const item of mine) {
      const other = byId.get(item.id);
      if (!other || at(item) >= at(other)) byId.set(item.id, item);
    }
    return [...byId.values()].filter((item) => !deleted[item.id]);
  };

  const rules = merge(local.rules, remote.rules, (rule) => rule.updatedAt ?? rule.createdAt ?? "");
  const liveRules = new Set(rules.map((rule) => rule.id));
  // An entry whose rule is gone has nothing left to explain it.
  const entries = merge(
    local.entries,
    remote.entries,
    (entry) => entry.updatedAt ?? entry.openedAt ?? ""
  ).filter((entry) => liveRules.has(entry.ruleId));

  return { rules, entries, deleted };
}

/** A cheap fingerprint: same ids and stamps means nothing moved. */
function shapeOf(doc: RulesDocument): string {
  return JSON.stringify([
    doc.rules.map((r) => [r.id, r.updatedAt ?? ""]).sort(),
    doc.entries.map((e) => [e.id, e.updatedAt ?? e.openedAt ?? ""]).sort(),
    Object.keys(doc.deleted).sort(),
  ]);
}

/** The cloud stamp of the last document we merged; sent with each poll. */
let knownRulesStamp: string | null = null;

async function fetchRemoteRules(): Promise<RulesDocument | null> {
  const url = knownRulesStamp ? `/api/rules?stamp=${encodeURIComponent(knownRulesStamp)}` : "/api/rules";
  const response = await fetch(url, { cache: "no-store" });
  const payload = await response.json();
  if (!payload.ok || !payload.synced || payload.unchanged) return null;
  if (typeof payload.updated_at === "string") knownRulesStamp = payload.updated_at;
  return normaliseRemote(payload);
}

export type RuleDraft = Omit<Rule, "id" | "createdAt" | "updatedAt">;

interface RulesState {
  rules: Rule[];
  entries: RuleEntry[];
  /**
   * Ids of rules and entries that were deleted here, and when.
   *
   * Merging two devices by union is what stops a block logged on the phone
   * being wiped by the laptop's next save — but a plain union also resurrects
   * anything either side deleted. These headstones are the difference.
   */
  deleted: Record<string, string>;

  addRule: (draft: RuleDraft) => Rule;
  updateRule: (id: string, updates: Partial<Rule>) => void;
  deleteRule: (id: string) => void;
  toggleRule: (id: string) => void;

  /** Open an entry — the block happened, its start fields are known. */
  openEntry: (ruleId: string, values: Record<string, string | number>, date?: string) => RuleEntry | null;
  /** Fill in more values, e.g. answering the 27-hour tips question. */
  answerEntry: (entryId: string, values: Record<string, string | number>, followUpId?: string) => void;
  updateEntry: (entryId: string, updates: Partial<RuleEntry>) => void;
  deleteEntry: (entryId: string) => void;

  getRule: (id: string) => Rule | undefined;
  /** Match a rule by name, the way the assistant refers to it. */
  findRule: (match: string) => Rule[];
  rulesFor: (scope: RuleScope | "all") => Rule[];
  entriesFor: (ruleId: string) => RuleEntry[];
  openEntriesFor: (ruleId: string) => RuleEntry[];
  dueNow: (now?: Date) => DueFollowUp[];
  triggersDueToday: (now?: Date) => Rule[];

  /** Merge the workspace copy into this one, in both directions. */
  hydrateFromServer: () => Promise<void>;
  /** Push the current rules and entries. Fire-and-forget after every change. */
  syncToServer: () => Promise<void>;
}

function stamp(): string {
  return new Date().toISOString();
}

let pushing = false;
let pushAgain = false;
/**
 * The pull in flight, if any.
 *
 * Opening a screen fires several triggers at once — the first subscriber,
 * the tab's `focus`, its `visibilitychange`, and the realtime callback — and
 * each one used to start its own full download. Five identical 37 KB fetches
 * left the server at the same instant on a plain page load, none of them
 * able to send a stamp because none had finished yet. Egress is metered, so
 * later callers now join the pull already running.
 */
let pulling: Promise<void> | null = null;

export const useRulesStore = create<RulesState>()(
  persist(
    (set, get) => ({
      rules: [],
      entries: [],
      deleted: {},

      addRule: (draft) => {
        const rule: Rule = { ...draft, id: uuidv4(), createdAt: stamp(), updatedAt: stamp() };
        set({ rules: [...get().rules, rule] });
        void get().syncToServer();
        return rule;
      },

      updateRule: (id, updates) => {
        set({
          rules: get().rules.map((rule) =>
            rule.id === id ? { ...rule, ...updates, id: rule.id, updatedAt: stamp() } : rule
          ),
        });
        void get().syncToServer();
      },

      deleteRule: (id) => {
        // Entries belong to their rule; leaving them behind would haunt the
        // tables as rows nothing can explain.
        const now = stamp();
        const gone: Record<string, string> = { ...(get().deleted ?? {}), [id]: now };
        for (const entry of get().entries) {
          if (entry.ruleId === id) gone[entry.id] = now;
        }
        set({
          rules: get().rules.filter((rule) => rule.id !== id),
          entries: get().entries.filter((entry) => entry.ruleId !== id),
          deleted: gone,
        });
        void get().syncToServer();
      },

      toggleRule: (id) => {
        const rule = get().getRule(id);
        if (!rule) return;
        get().updateRule(id, { enabled: !rule.enabled });
      },

      openEntry: (ruleId, values, date) => {
        const rule = get().getRule(ruleId);
        if (!rule) return null;
        const entry: RuleEntry = {
          id: uuidv4(),
          ruleId,
          date: date ?? zonedToday(),
          openedAt: stamp(),
          updatedAt: stamp(),
          values,
          answered: [],
          complete: false,
        };
        entry.complete = isEntryComplete(rule, entry);
        set({ entries: [...get().entries, entry] });
        void get().syncToServer();
        return entry;
      },

      answerEntry: (entryId, values, followUpId) => {
        const entries = get().entries.map((entry) => {
          if (entry.id !== entryId) return entry;
          const merged: RuleEntry = {
            ...entry,
            updatedAt: stamp(),
            values: { ...entry.values, ...values },
            answered: followUpId && !entry.answered.includes(followUpId)
              ? [...entry.answered, followUpId]
              : entry.answered,
          };
          const rule = get().getRule(entry.ruleId);
          merged.complete = rule ? isEntryComplete(rule, merged) : merged.complete;
          return merged;
        });
        set({ entries });
        void get().syncToServer();
      },

      updateEntry: (entryId, updates) => {
        set({
          entries: get().entries.map((entry) => {
            if (entry.id !== entryId) return entry;
            const merged = { ...entry, ...updates, id: entry.id, updatedAt: stamp() };
            const rule = get().getRule(entry.ruleId);
            merged.complete = rule ? isEntryComplete(rule, merged) : merged.complete;
            return merged;
          }),
        });
        void get().syncToServer();
      },

      deleteEntry: (entryId) => {
        set({
          entries: get().entries.filter((entry) => entry.id !== entryId),
          deleted: { ...(get().deleted ?? {}), [entryId]: stamp() },
        });
        void get().syncToServer();
      },

      getRule: (id) => get().rules.find((rule) => rule.id === id),

      findRule: (match) => {
        const needle = match.trim().toLowerCase();
        if (!needle) return [];
        return get().rules.filter((rule) => rule.name.toLowerCase().includes(needle));
      },

      rulesFor: (scope) => {
        const rules = get().rules;
        if (scope === "all") return rules;
        // A workspace rule belongs to whoever is looking at it.
        return rules.filter((rule) => rule.scope === scope || rule.scope === "shared");
      },

      entriesFor: (ruleId) =>
        get()
          .entries.filter((entry) => entry.ruleId === ruleId)
          .slice()
          .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),

      openEntriesFor: (ruleId) =>
        get().entries.filter((entry) => entry.ruleId === ruleId && !entry.complete),

      dueNow: (now) => dueFollowUps(get().rules, get().entries, now),

      triggersDueToday: (now) => get().rules.filter((rule) => triggerDueToday(rule, now)),

      hydrateFromServer: async () => {
        // Already pulling: wait on that one rather than asking again.
        if (pulling) return pulling;

        pulling = (async () => {
        try {
          const remote = await fetchRemoteRules();
          if (!remote) return;
          const local = get();
          const mine: RulesDocument = {
            rules: local.rules,
            entries: local.entries,
            deleted: local.deleted ?? {},
          };
          const merged = mergeRulesDocuments(mine, remote);
          const shape = shapeOf(merged);
          // Only touch state when something actually moved, so a poll that
          // finds nothing new does not re-render every screen watching this.
          if (shape !== shapeOf(mine)) set(merged);
          // And push back whenever the server is the side that is behind.
          if (shape !== shapeOf(remote)) void get().syncToServer();
        } catch {
          // No cloud, or the table is not created yet — local still works.
        }
        })();

        try {
          await pulling;
        } finally {
          pulling = null;
        }
      },

      syncToServer: async () => {
        // Coalesce: one push in flight at a time; anything that changes
        // meanwhile is picked up by a follow-up run.
        if (pushing) {
          pushAgain = true;
          return;
        }
        pushing = true;
        try {
          do {
            pushAgain = false;
            // Read-merge-write. The whole document is sent, so it must first
            // absorb whatever the other phone saved since this one last
            // looked — otherwise a stale device's save is a wipe.
            let remote: RulesDocument | null = null;
            try {
              remote = await fetchRemoteRules();
            } catch {
              remote = null;
            }
            const local = get();
            const mine: RulesDocument = {
              rules: local.rules,
              entries: local.entries,
              deleted: local.deleted ?? {},
            };
            const doc = remote ? mergeRulesDocuments(mine, remote) : mine;
            if (remote && shapeOf(doc) !== shapeOf(mine)) set(doc);
            const saved = await fetch("/api/rules", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(doc),
            });
            // Our save is now the cloud's stamp; the next poll can say "unchanged".
            const result = (await saved.json().catch(() => null)) as { updated_at?: unknown } | null;
            if (typeof result?.updated_at === "string") knownRulesStamp = result.updated_at;
          } while (pushAgain);
        } catch {
          // Offline is fine; the next change pushes the whole document again.
        } finally {
          pushing = false;
        }
      },
    }),
    { name: STORAGE_KEY }
  )
);

/* ------------------------------------------------------------------ */
/* Keeping a screen fresh                                               */
/* ------------------------------------------------------------------ */

const POLL_MS = 30_000;
let liveSubscribers = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let stopRealtime: (() => void) | null = null;

function refreshRules() {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
  void useRulesStore.getState().hydrateFromServer();
}

/**
 * While any screen that shows rules is open: pull now, every 30 seconds,
 * whenever the tab comes back, and the instant the other phone saves (via a
 * realtime channel on the row, when the table is published for it).
 *
 * Returns the release. Reference-counted, so several screens share one loop.
 */
export function startRulesLiveSync(): () => void {
  if (typeof window === "undefined") return () => {};
  liveSubscribers += 1;
  if (liveSubscribers === 1) {
    refreshRules();
    pollTimer = setInterval(refreshRules, POLL_MS);
    window.addEventListener("focus", refreshRules);
    document.addEventListener("visibilitychange", refreshRules);

    void loadSyncConfig().then((config) => {
      if (!config || liveSubscribers === 0) return;
      const supabase = createClient(config);
      if (!supabase) return;
      const workspaceId = getSyncWorkspaceId(config);
      try {
        // A fresh topic each time: removeChannel is asynchronous, and asking
        // for the same name again while the old one is still winding down
        // hands back the subscribed channel, which refuses new callbacks.
        const channel = supabase
          .channel(`workspace_rules:${workspaceId}:${Date.now()}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "workspace_rules", filter: `workspace_id=eq.${workspaceId}` },
            () => refreshRules()
          )
          .subscribe();
        stopRealtime = () => {
          void supabase.removeChannel(channel);
        };
      } catch {
        // Realtime is a bonus; polling still runs.
      }
    });
  }

  return () => {
    liveSubscribers = Math.max(0, liveSubscribers - 1);
    if (liveSubscribers > 0) return;
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
    window.removeEventListener("focus", refreshRules);
    document.removeEventListener("visibilitychange", refreshRules);
    stopRealtime?.();
    stopRealtime = null;
  };
}

/** Rules as plain text for the assistant's system prompt. */
export function getRulesForAssistant(): Rule[] {
  return useRulesStore.getState().rules.filter((rule) => rule.enabled);
}

/** Follow-ups the assistant should raise right now. */
export function getDueFollowUps(now?: Date): DueFollowUp[] {
  return useRulesStore.getState().dueNow(now);
}

// Re-exported so callers can reach the engine through the store they already
// import, rather than needing both.
export { buildRuleTable, resolveEntry, validateExpression } from "@/lib/rules/engine";
