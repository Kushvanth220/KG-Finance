import type { RealtimeChannel } from "@supabase/supabase-js";
import {
  createClient,
  getCachedSyncConfig,
  getSyncWorkspaceId,
  loadSyncConfig,
  type SyncConfig,
} from "@/lib/supabase/client";
import type { FinanceState } from "@/types";
import { pickRicherState, readLocalFinanceBackup, scoreFinanceState } from "@/lib/recover-finance-data";
import { isPristineFinanceState } from "@/lib/default-state";
import { mergeFinanceStates } from "@/lib/finance-merge";

/** Bumped to reset stale per-device sync timestamps from older builds. */
export const SYNC_META_KEY = "kg-finance-sync-meta-v1";
/**
 * The last state this phone and the cloud agreed on. It is what a three-way
 * merge needs to tell "added here" from "deleted there" when both phones
 * have moved since. Written after every successful push or pull.
 */
const SYNC_BASE_KEY = "kg-finance-sync-base-v1";
const SYNC_PROJECT_KEY = "kg-finance-sync-project-url";

export type SyncStatus = "idle" | "syncing" | "synced" | "error" | "offline";

export interface SyncMeta {
  lastSyncedAt: string | null;
  lastPushedAt: string | null;
  lastLocalEditAt: string | null;
}

export interface RemoteFinanceRow {
  workspace_id: string;
  data: FinanceState;
  updated_at: string;
}

export interface SyncDiagnosticStep {
  name: string;
  ok: boolean;
  message: string;
}

export interface SyncDiagnostics {
  ok: boolean;
  workspaceId: string;
  configured: boolean;
  steps: SyncDiagnosticStep[];
  cloudUpdatedAt?: string;
  cloudTransactionCount?: number;
}

type SyncListener = (status: SyncStatus, error?: string) => void;

let applyingRemote = false;
let pendingLocalChanges = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let realtimeChannel: RealtimeChannel | null = null;
let activeConfig: SyncConfig | null = null;
let lastSyncError: string | null = null;
let syncInProgress: Promise<void> | null = null;
let pushStateGetter: (() => FinanceState) | null = null;
let pushWorkspaceId: string | null = null;
const listeners = new Set<SyncListener>();
const initialSyncListeners = new Set<() => void>();

let initialSyncComplete = typeof window === "undefined";
let cloudReachable = false;

const PUSH_DEBOUNCE_MS = 250;
/**
 * Fallback only: the other phone's save arrives over the realtime channel
 * within a second. Each poll is a ~100-byte timestamp read, so this cadence
 * costs almost nothing against the cloud's bandwidth allowance.
 */
const POLL_INTERVAL_MS = 5_000;

let sessionPullConfig: {
  workspaceId: string;
  getLocalState: () => FinanceState;
  applyRemoteState: (state: FinanceState) => void;
} | null = null;

function getConfigOrThrow() {
  const config = activeConfig ?? getCachedSyncConfig();
  if (!config) throw new Error("Supabase is not configured");
  return config;
}

export function isApplyingRemoteSync() {
  return applyingRemote;
}

export function getLastSyncError() {
  return lastSyncError;
}

export function getCurrentWorkspaceId() {
  return activeConfig?.workspaceId ?? getSyncWorkspaceId();
}

export function onSyncStatusChange(listener: SyncListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isInitialSyncComplete() {
  return initialSyncComplete;
}

export function onInitialSyncComplete(listener: () => void) {
  if (initialSyncComplete) {
    listener();
    return () => {};
  }

  initialSyncListeners.add(listener);
  return () => {
    initialSyncListeners.delete(listener);
  };
}

export function markInitialSyncComplete() {
  if (initialSyncComplete) return;
  initialSyncComplete = true;
  for (const listener of initialSyncListeners) {
    listener();
  }
  initialSyncListeners.clear();
}

/** Clear stale sync timestamps when switching Supabase projects. */
export function ensureSyncProjectForConfig(config: SyncConfig) {
  if (typeof window === "undefined") return;

  const previousUrl = localStorage.getItem(SYNC_PROJECT_KEY);
  if (previousUrl && previousUrl !== config.supabaseUrl) {
    localStorage.removeItem(SYNC_META_KEY);
  }

  localStorage.setItem(SYNC_PROJECT_KEY, config.supabaseUrl);
}

let currentStatus: SyncStatus = "idle";
let lastCheckedAt: string | null = null;

/** When this phone last heard back from the cloud, whether or not anything changed. */
export function getLastCheckedAt(): string | null {
  return lastCheckedAt;
}

/** The status as of the last event, for a page that mounts between events. */
export function getCurrentSyncStatus(): SyncStatus {
  return currentStatus;
}

/** Edits made here that have not reached the cloud yet. */
export function hasPendingLocalChanges(): boolean {
  return pendingLocalChanges || Boolean(readSyncMeta().lastLocalEditAt);
}

/** A sync on demand: send what is waiting, then pick up what is new. */
export async function syncNow(): Promise<void> {
  if (!sessionPullConfig) return;
  await runAutoSyncCycle(
    sessionPullConfig.workspaceId,
    sessionPullConfig.getLocalState,
    sessionPullConfig.applyRemoteState
  );
}

function notifyStatus(status: SyncStatus, error?: string) {
  currentStatus = status;
  if (error) {
    lastSyncError = error;
  } else if (status === "synced") {
    lastSyncError = null;
  }

  for (const listener of listeners) {
    listener(status, error);
  }
}

export function readSyncMeta(): SyncMeta {
  if (typeof window === "undefined") {
    return { lastSyncedAt: null, lastPushedAt: null, lastLocalEditAt: null };
  }

  try {
    const raw = localStorage.getItem(SYNC_META_KEY);
    if (!raw) return { lastSyncedAt: null, lastPushedAt: null, lastLocalEditAt: null };
    const parsed = JSON.parse(raw) as Partial<SyncMeta>;
    return {
      lastSyncedAt: parsed.lastSyncedAt ?? null,
      lastPushedAt: parsed.lastPushedAt ?? null,
      lastLocalEditAt: parsed.lastLocalEditAt ?? null,
    };
  } catch {
    return { lastSyncedAt: null, lastPushedAt: null, lastLocalEditAt: null };
  }
}

function writeSyncMeta(meta: SyncMeta) {
  if (typeof window === "undefined") return;
  localStorage.setItem(SYNC_META_KEY, JSON.stringify(meta));
}

function readSyncBase(): RemoteFinanceRow | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SYNC_BASE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<RemoteFinanceRow>;
    return parsed && parsed.data && typeof parsed.updated_at === "string" ? (parsed as RemoteFinanceRow) : null;
  } catch {
    return null;
  }
}

function writeSyncBase(row: RemoteFinanceRow) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SYNC_BASE_KEY, JSON.stringify(row));
  } catch {
    // Out of room: the next merge falls back to a union, which loses nothing.
  }
}

/** Has the cloud changed since this phone last agreed with it? */
function cloudMovedSince(remote: RemoteFinanceRow, meta = readSyncMeta()): boolean {
  return !meta.lastSyncedAt || remote.updated_at !== meta.lastSyncedAt;
}

/** Anything typed here that the cloud has not yet been told about. */
function hasUnsyncedLocalEdits(meta = readSyncMeta()): boolean {
  return pendingLocalChanges || Boolean(meta.lastLocalEditAt);
}

/**
 * Both sides moved: fold the cloud's changes and ours together, show the
 * result here, and send it up — so neither phone's work is lost.
 */
async function mergeAndPush(
  workspaceId: string,
  remote: RemoteFinanceRow,
  localState: FinanceState,
  applyRemoteState: (state: FinanceState) => void,
  attempt = 0
): Promise<RemoteFinanceRow> {
  const base = readSyncBase();
  const merged = mergeFinanceStates(base?.data ?? null, localState, remote.data);
  applyingRemote = true;
  applyRemoteState(merged);
  applyingRemote = false;
  try {
    const row = await pushFinanceState(workspaceId, merged, {
      skipSafetyCheck: true,
      expectStamp: remote.updated_at,
    });
    notifyStatus("synced");
    return row;
  } catch (error) {
    // The other phone saved between our read and our write: read again and
    // fold that in too. Two tries covers any realistic race.
    if (error instanceof SyncConflictError && attempt < 2) {
      const fresh = await fetchRemoteFinance(workspaceId);
      if (fresh) return mergeAndPush(workspaceId, fresh, merged, applyRemoteState, attempt + 1);
    }
    throw error;
  }
}

function countFinanceRecords(state: FinanceState): number {
  return (
    (state.transactions?.length ?? 0) +
    (state.incomeEntries?.length ?? 0) +
    (state.accounts?.length ?? 0) +
    (state.debts?.length ?? 0) +
    (state.incomeSources?.length ?? 0)
  );
}

/** True when downloading remote state would erase meaningful local history. */
export function wouldWipeLocalData(remote: FinanceState, local: FinanceState): boolean {
  const remoteTx = remote.transactions?.length ?? 0;
  const localTx = local.transactions?.length ?? 0;
  const remoteRecords = countFinanceRecords(remote);
  const localRecords = countFinanceRecords(local);

  if (localTx > 0 && remoteTx === 0) return true;
  if (localRecords > 10 && remoteRecords < localRecords * 0.25) return true;
  if (localTx >= 5 && remoteTx < Math.ceil(localTx * 0.2)) return true;

  return false;
}

/** True when uploading local state would erase meaningful cloud history. */
export function wouldWipeRemoteData(remote: FinanceState, local: FinanceState): boolean {
  const remoteTx = remote.transactions?.length ?? 0;
  const localTx = local.transactions?.length ?? 0;
  const remoteRecords = countFinanceRecords(remote);
  const localRecords = countFinanceRecords(local);

  if (remoteTx > 0 && localTx === 0) return true;
  if (remoteRecords > 10 && localRecords < remoteRecords * 0.25) return true;
  if (remoteTx >= 5 && localTx < Math.ceil(remoteTx * 0.2)) return true;

  return false;
}

function assertSafeToPush(remote: FinanceState | null, local: FinanceState) {
  if (!remote) return;
  if (wouldWipeRemoteData(remote, local)) {
    throw new Error(
      "Blocked upload — your device data looks empty compared to the cloud. Restoring from cloud instead."
    );
  }
}

function helpfulErrorMessage(error: unknown) {
  // Supabase errors are plain objects with a message, not Error instances.
  const message =
    error instanceof Error
      ? error.message
      : typeof (error as { message?: unknown })?.message === "string"
        ? String((error as { message: string }).message)
        : "Unknown error";

  if (
    message.includes("Failed to fetch") ||
    message.includes("fetch failed") ||
    message.includes("ENOTFOUND") ||
    message.includes("getaddrinfo") ||
    message.includes("could not be resolved")
  ) {
    return "Cannot reach Supabase. Copy the exact Project URL from Supabase → Settings → API into .env.local, then restart the app.";
  }

  if (message.includes("workspace_id") && message.includes("does not exist")) {
    return "Database table is outdated. Run supabase/setup.sql in Supabase SQL Editor.";
  }

  if (message.includes("Could not find the table")) {
    return "Table missing. Run supabase/setup.sql in Supabase SQL Editor.";
  }

  if (message.includes("permission denied") || message.includes("RLS")) {
    return "Database permissions blocked sync. Run supabase/setup.sql again.";
  }

  return message;
}

export function isCloudReachable() {
  return cloudReachable;
}

export async function fetchRemoteFinance(
  workspaceId: string
): Promise<RemoteFinanceRow | null> {
  const config = getConfigOrThrow();
  const supabase = createClient(config);
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("workspace_finance")
    .select("workspace_id, data, updated_at")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) throw new Error(helpfulErrorMessage(error));
  // Any answer from the cloud proves it is there. Without this, one failed
  // fetch at launch left the whole session refusing to upload.
  cloudReachable = true;
  lastCheckedAt = new Date().toISOString();
  if (!data) return null;

  return {
    workspace_id: data.workspace_id,
    data: data.data as FinanceState,
    updated_at: data.updated_at,
  };
}

/** Just the cloud's timestamp — a few bytes, so polling can stay cheap. */
async function fetchRemoteStamp(workspaceId: string): Promise<string | null> {
  const config = getConfigOrThrow();
  const supabase = createClient(config);
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("workspace_finance")
    .select("updated_at")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw new Error(helpfulErrorMessage(error));
  cloudReachable = true;
  lastCheckedAt = new Date().toISOString();
  return data?.updated_at ?? null;
}

/** Thrown when the cloud changed under a push; the caller merges again and retries. */
export class SyncConflictError extends Error {
  constructor() {
    super("The cloud changed while saving; merging again.");
    this.name = "SyncConflictError";
  }
}

export async function pushFinanceState(
  workspaceId: string,
  state: FinanceState,
  options?: {
    skipSafetyCheck?: boolean;
    /**
     * The cloud stamp this state was built on. The save only lands if the
     * cloud still carries it — otherwise the other phone saved in between,
     * and writing now would bury that save.
     */
    expectStamp?: string;
  }
): Promise<RemoteFinanceRow> {
  if (!cloudReachable && !options?.skipSafetyCheck) {
    throw new Error(
      "Cloud is unreachable — upload blocked to protect your database. Fix the Supabase URL first."
    );
  }

  const config = getConfigOrThrow();
  const supabase = createClient(config);
  if (!supabase) throw new Error("Supabase is not configured");

  if (!options?.skipSafetyCheck) {
    // The base snapshot IS the cloud's content whenever the stamps match, so
    // the wipe check needs no download. Only an unknown cloud gets fetched.
    const base = readSyncBase();
    if (options?.expectStamp && base && base.updated_at === options.expectStamp) {
      assertSafeToPush(base.data, state);
    } else {
      const existing = await fetchRemoteFinance(workspaceId);
      assertSafeToPush(existing?.data ?? null, state);
    }
  }

  // Ask for the stamp back, never the row: we already hold what we sent, and
  // echoing the document on every save was a large share of the bandwidth.
  let updatedAt: string;
  if (options?.expectStamp) {
    const result = await supabase
      .from("workspace_finance")
      .update({ data: state })
      .eq("workspace_id", workspaceId)
      .eq("updated_at", options.expectStamp)
      .select("updated_at")
      .maybeSingle();
    if (result.error) throw new Error(helpfulErrorMessage(result.error));
    if (!result.data) throw new SyncConflictError();
    updatedAt = result.data.updated_at;
  } else {
    const result = await supabase
      .from("workspace_finance")
      .upsert(
        {
          workspace_id: workspaceId,
          data: state,
        },
        { onConflict: "workspace_id" }
      )
      .select("updated_at")
      .single();
    if (result.error) throw new Error(helpfulErrorMessage(result.error));
    updatedAt = result.data.updated_at;
  }

  pendingLocalChanges = false;
  writeSyncMeta({
    ...readSyncMeta(),
    lastSyncedAt: updatedAt,
    lastPushedAt: updatedAt,
    lastLocalEditAt: null,
  });

  const row = { workspace_id: workspaceId, data: state, updated_at: updatedAt };
  writeSyncBase(row);
  announceStamp(updatedAt);

  return row;
}

export function markLocalChangePending() {
  pendingLocalChanges = true;
  const meta = readSyncMeta();
  writeSyncMeta({
    ...meta,
    lastLocalEditAt: new Date().toISOString(),
  });
}

/** Clear false-positive pending flag from store rehydration (not a user edit). */
export function clearPendingLocalChanges() {
  pendingLocalChanges = false;
}

export function scheduleFinancePush(
  workspaceId: string,
  getState: () => FinanceState
) {
  if (applyingRemote || !activeConfig) return;

  pendingLocalChanges = true;
  pushWorkspaceId = workspaceId;
  pushStateGetter = getState;

  if (pushTimer) clearTimeout(pushTimer);

  pushTimer = setTimeout(async () => {
    pushTimer = null;
    notifyStatus("syncing");

    try {
      await pushLocalState(workspaceId, getState);
    } catch (err) {
      const message = helpfulErrorMessage(err);
      if (message.includes("Blocked upload") && sessionPullConfig) {
        try {
          await forcePullNow(workspaceId, sessionPullConfig.applyRemoteState);
          notifyStatus("synced");
          return;
        } catch {
          // fall through
        }
      }
      notifyStatus("error", message);
    }
  }, PUSH_DEBOUNCE_MS);
}

/**
 * Send this phone's edits up without burying anyone else's. If the cloud
 * moved since we last agreed with it, merge first; either way the save is
 * conditional on the stamp we read, so a save that lands in between is
 * folded in rather than overwritten.
 */
async function pushLocalState(workspaceId: string, getState: () => FinanceState) {
  const localState = getState();
  const stamp = await fetchRemoteStamp(workspaceId);

  // Nothing recorded here yet and the cloud has a record: there is nothing to
  // send. Take the cloud instead — an untouched device never overwrites or
  // merges into the shared ledger.
  if (stamp && sessionPullConfig && isPristineFinanceState(localState)) {
    const remote = await fetchRemoteFinance(workspaceId);
    if (remote) {
      applyRemoteRow(remote, sessionPullConfig.applyRemoteState);
      return;
    }
  }

  if (stamp && sessionPullConfig) {
    const base = readSyncBase();
    // Stamps agree: the cloud still holds exactly our base, so nothing needs
    // downloading — the base stands in for the cloud in every check below.
    const level = base !== null && base.updated_at === stamp && !cloudMovedSince(base);

    if (level && wouldWipeRemoteData(base.data, localState)) {
      await mergeAndPush(workspaceId, base, localState, sessionPullConfig.applyRemoteState);
      return;
    }

    if (!level) {
      const existing = await fetchRemoteFinance(workspaceId);
      if (existing) {
        await mergeAndPush(workspaceId, existing, localState, sessionPullConfig.applyRemoteState);
        return;
      }
    } else {
      try {
        await pushFinanceState(workspaceId, localState, { expectStamp: stamp });
        notifyStatus("synced");
        return;
      } catch (error) {
        if (!(error instanceof SyncConflictError)) throw error;
        const fresh = await fetchRemoteFinance(workspaceId);
        if (fresh) {
          await mergeAndPush(workspaceId, fresh, getState(), sessionPullConfig.applyRemoteState);
          return;
        }
      }
    }
  }

  await pushFinanceState(workspaceId, localState);
  notifyStatus("synced");
}

export async function flushPendingPush() {
  if (!pendingLocalChanges || !pushWorkspaceId || !pushStateGetter) return;

  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }

  notifyStatus("syncing");
  await pushLocalState(pushWorkspaceId, pushStateGetter);
}

function applyRemoteRow(
  row: RemoteFinanceRow,
  applyRemoteState: (state: FinanceState) => void
) {
  applyingRemote = true;
  applyRemoteState(row.data);
  applyingRemote = false;
  pendingLocalChanges = false;
  writeSyncMeta({
    lastSyncedAt: row.updated_at,
    lastPushedAt: readSyncMeta().lastPushedAt,
    lastLocalEditAt: null,
  });
  writeSyncBase(row);
  notifyStatus("synced");
}

function ensureBestLocalState(
  getLocalState: () => FinanceState,
  applyRemoteState: (state: FinanceState) => void
): FinanceState {
  const backup = readLocalFinanceBackup();
  const current = getLocalState();
  if (!backup) return current;

  const best = pickRicherState(backup, current);
  if (scoreFinanceState(best) > scoreFinanceState(current)) {
    applyingRemote = true;
    applyRemoteState(best);
    applyingRemote = false;
    return best;
  }

  return current;
}


/**
 * Bring this phone level with the cloud. Nothing to do when the cloud has
 * not moved; a plain pull when only the cloud moved; a merge when both did.
 */
async function reconcileWithRemote(
  workspaceId: string,
  remote: RemoteFinanceRow,
  getLocalState: () => FinanceState,
  applyRemoteState: (state: FinanceState) => void
): Promise<boolean> {
  if (!cloudMovedSince(remote)) return false;
  const localState = getLocalState();

  if (hasUnsyncedLocalEdits()) {
    await mergeAndPush(workspaceId, remote, localState, applyRemoteState);
    return true;
  }

  // A cloud row that has lost most of what this phone holds is a reset or a
  // bad upload, not the other phone's edits; merging keeps everything.
  if (wouldWipeLocalData(remote.data, localState)) {
    await mergeAndPush(workspaceId, remote, localState, applyRemoteState);
    return true;
  }

  applyRemoteRow(remote, applyRemoteState);
  return true;
}

export function pullRemoteIfNewer(
  workspaceId: string,
  getLocalState: () => FinanceState,
  applyRemoteState: (state: FinanceState) => void
): Promise<boolean> {
  return (async () => {
    // Cheap check first; the full row only when the stamp says it changed.
    const stamp = await fetchRemoteStamp(workspaceId);
    if (!stamp) return false;
    if (stamp === readSyncMeta().lastSyncedAt) return false;

    const remote = await fetchRemoteFinance(workspaceId);
    if (!remote) return false;
    return reconcileWithRemote(workspaceId, remote, getLocalState, applyRemoteState);
  })();
}

export async function resolveInitialSync(
  workspaceId: string,
  getLocalState: () => FinanceState,
  applyRemoteState: (state: FinanceState) => void
): Promise<"local" | "remote" | "none"> {
  clearPendingLocalChanges();
  cloudReachable = false;

  const localState = ensureBestLocalState(getLocalState, applyRemoteState);
  const meta = readSyncMeta();
  let remote: RemoteFinanceRow | null;

  try {
    // Most app opens find nothing changed on either side. A stamp read
    // settles that without downloading the document again.
    const base = readSyncBase();
    const stamp = await fetchRemoteStamp(workspaceId);
    cloudReachable = true;
    if (
      stamp &&
      base &&
      base.updated_at === stamp &&
      stamp === meta.lastSyncedAt &&
      !meta.lastLocalEditAt &&
      !wouldWipeLocalData(base.data, localState) &&
      !wouldWipeRemoteData(base.data, localState)
    ) {
      notifyStatus("synced");
      return "none";
    }

    remote = await fetchRemoteFinance(workspaceId);
  } catch (err) {
    notifyStatus("error", helpfulErrorMessage(err));
    return "none";
  }

  if (!remote) {
    // First device on a fresh workspace: whatever this phone has becomes the
    // cloud record, even if that is an empty ledger.
    await pushFinanceState(workspaceId, localState, { skipSafetyCheck: true });
    notifyStatus("synced");
    return "local";
  }

  // A phone that has never recorded anything — a fresh install, or storage
  // that was cleared — simply adopts the cloud. Merging here would treat its
  // starter categories as additions and push them into the shared list. This
  // is judged on content alone: the "local edit" flag also trips on internal
  // store updates, so it cannot be trusted to say the device is untouched.
  if (isPristineFinanceState(localState)) {
    applyRemoteRow(remote, applyRemoteState);
    return "remote";
  }

  const moved = cloudMovedSince(remote, meta);
  const edits = Boolean(meta.lastLocalEditAt);

  // Both sides changed since this phone last agreed with the cloud — or one
  // of them looks wiped: fold them together rather than pick a winner.
  if (
    (moved && edits) ||
    wouldWipeLocalData(remote.data, localState) ||
    wouldWipeRemoteData(remote.data, localState)
  ) {
    await mergeAndPush(workspaceId, remote, localState, applyRemoteState);
    return "local";
  }

  if (edits) {
    await pushFinanceState(workspaceId, localState);
    notifyStatus("synced");
    return "local";
  }

  if (moved || scoreFinanceState(remote.data) > scoreFinanceState(localState) + 50) {
    applyRemoteRow(remote, applyRemoteState);
    return "remote";
  }

  // Level already: remember this as the point of agreement, so the next
  // merge has a base to reason from.
  writeSyncBase(remote);
  notifyStatus("synced");
  return "none";
}

export function subscribeToFinanceChanges(
  workspaceId: string,
  getLocalState: () => FinanceState,
  applyRemoteState: (state: FinanceState) => void
) {
  const config = getConfigOrThrow();
  const supabase = createClient(config);
  if (!supabase) return;

  unsubscribeFromFinanceChanges();

  activeConfig = config;
  // The phones tell each other "I saved, here is the new stamp" over a
  // broadcast channel — a few bytes. Listening to the table itself would
  // deliver the whole document to every phone on every save.
  realtimeChannel = supabase
    .channel(`workspace:${workspaceId}`, { config: { broadcast: { self: false } } })
    .on("broadcast", { event: STAMP_EVENT }, (message) => {
      const stamp = (message.payload as { updated_at?: unknown } | undefined)?.updated_at;
      if (typeof stamp !== "string" || stamp === readSyncMeta().lastSyncedAt) return;

      void pullRemoteIfNewer(workspaceId, getLocalState, applyRemoteState).catch((err) => {
        notifyStatus("error", helpfulErrorMessage(err));
      });
    })
    .subscribe((status) => {
      if (status === "CHANNEL_ERROR") {
        notifyStatus("error", "Live sync unavailable — checking every few seconds instead");
      }
    });
}

const STAMP_EVENT = "finance-stamp";

/** Tell the other phone the cloud moved. Best effort; the poll covers a miss. */
function announceStamp(updatedAt: string) {
  if (!realtimeChannel) return;
  void realtimeChannel
    .send({ type: "broadcast", event: STAMP_EVENT, payload: { updated_at: updatedAt } })
    .catch(() => {});
}

export function startPollingSync(
  workspaceId: string,
  getLocalState: () => FinanceState,
  applyRemoteState: (state: FinanceState) => void
) {
  stopPollingSync();

  pollTimer = setInterval(() => {
    if (document.visibilityState !== "visible") return;

    void (async () => {
      if (pendingLocalChanges) {
        await flushPendingPush();
      }
      await pullRemoteIfNewer(workspaceId, getLocalState, applyRemoteState);
    })().catch((err) => {
      notifyStatus("error", helpfulErrorMessage(err));
    });
  }, POLL_INTERVAL_MS);
}

export async function runAutoSyncCycle(
  workspaceId: string,
  getLocalState: () => FinanceState,
  applyRemoteState: (state: FinanceState) => void
) {
  ensureBestLocalState(getLocalState, applyRemoteState);

  if (pendingLocalChanges) {
    await flushPendingPush();
  }
  await pullRemoteIfNewer(workspaceId, getLocalState, applyRemoteState);
}

export function stopPollingSync() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export function unsubscribeFromFinanceChanges() {
  if (realtimeChannel) {
    const config = activeConfig ?? getCachedSyncConfig();
    const supabase = createClient(config);
    if (supabase) {
      supabase.removeChannel(realtimeChannel);
    }
    realtimeChannel = null;
  }
  stopPollingSync();
}

export async function forcePushNow(
  workspaceId: string,
  getState: () => FinanceState,
  options?: { skipSafetyCheck?: boolean }
) {
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }

  pendingLocalChanges = true;
  notifyStatus("syncing");
  await pushFinanceState(workspaceId, getState(), options);
  notifyStatus("synced");
}

export async function restoreFinanceBackupToCloud(
  workspaceId: string,
  backup: FinanceState,
  applyRemoteState: (state: FinanceState) => void
): Promise<RemoteFinanceRow> {
  applyRemoteState(backup);
  return pushFinanceState(workspaceId, backup, { skipSafetyCheck: true });
}

export async function forcePullNow(
  workspaceId: string,
  applyRemoteState: (state: FinanceState) => void
) {
  notifyStatus("syncing");

  const remote = await fetchRemoteFinance(workspaceId);
  if (!remote) {
    notifyStatus("synced");
    return false;
  }

  applyRemoteRow(remote, applyRemoteState);
  return true;
}

export async function runInitialSyncSession(
  config: SyncConfig,
  getLocalState: () => FinanceState,
  applyRemoteState: (state: FinanceState) => void
) {
  if (syncInProgress) {
    await syncInProgress;
    return;
  }

  activeConfig = config;
  const workspaceId = config.workspaceId;

  syncInProgress = (async () => {
    notifyStatus("syncing");

    try {
      ensureSyncProjectForConfig(config);
      sessionPullConfig = { workspaceId, getLocalState, applyRemoteState };
      clearPendingLocalChanges();
      await resolveInitialSync(workspaceId, getLocalState, applyRemoteState);
      subscribeToFinanceChanges(workspaceId, getLocalState, applyRemoteState);
      startPollingSync(workspaceId, getLocalState, applyRemoteState);
    } catch (err) {
      notifyStatus("error", helpfulErrorMessage(err));
      throw err;
    }
  })();

  try {
    await syncInProgress;
  } finally {
    syncInProgress = null;
  }
}

export function stopSyncSession() {
  unsubscribeFromFinanceChanges();
  activeConfig = null;
  syncInProgress = null;
  pushWorkspaceId = null;
  pushStateGetter = null;
  sessionPullConfig = null;
}

export function getActiveWorkspaceId() {
  return activeConfig?.workspaceId ?? getSyncWorkspaceId();
}

export async function diagnoseSync(
  getLocalState: () => FinanceState
): Promise<SyncDiagnostics> {
  const config = await loadSyncConfig();
  const workspaceId = config?.workspaceId ?? getSyncWorkspaceId();
  const steps: SyncDiagnosticStep[] = [];

  if (!config) {
    return {
      ok: false,
      configured: false,
      workspaceId,
      steps: [
        {
          name: "Supabase config",
          ok: false,
          message:
            "Missing NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
        },
      ],
    };
  }

  activeConfig = config;
  steps.push({
    name: "Supabase config",
    ok: true,
    message: "URL and key found",
  });

  let remote: RemoteFinanceRow | null = null;

  try {
    remote = await fetchRemoteFinance(workspaceId);
    steps.push({
      name: "Read cloud",
      ok: true,
      message: remote
        ? `Cloud has ${remote.data.transactions?.length ?? 0} transactions, updated ${new Date(remote.updated_at).toLocaleString()}`
        : "No cloud data yet — will upload automatically",
    });
  } catch (err) {
    steps.push({
      name: "Read cloud",
      ok: false,
      message: helpfulErrorMessage(err),
    });
    return { ok: false, configured: true, workspaceId, steps };
  }

  try {
    const localState = getLocalState();
    if (remote && wouldWipeRemoteData(remote.data, localState)) {
      steps.push({
        name: "Write cloud",
        ok: true,
        message: "Skipped test upload — cloud has more data than this device",
      });
    } else {
      await pushFinanceState(workspaceId, localState);
      steps.push({
        name: "Write cloud",
        ok: true,
        message: "Upload test succeeded",
      });
    }
  } catch (err) {
    steps.push({
      name: "Write cloud",
      ok: false,
      message: helpfulErrorMessage(err),
    });
    return {
      ok: false,
      configured: true,
      workspaceId,
      steps,
      cloudUpdatedAt: remote?.updated_at,
      cloudTransactionCount: remote?.data.transactions?.length,
    };
  }

  return {
    ok: true,
    configured: true,
    workspaceId,
    steps,
    cloudUpdatedAt: remote?.updated_at,
    cloudTransactionCount: remote?.data.transactions?.length,
  };
}
