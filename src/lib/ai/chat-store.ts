import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AiUserId } from "@/lib/ai/person";

export interface AiChatSession {
  id: string;
  workspace_id: string;
  user_id: AiUserId;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiChatMessage {
  id: string;
  session_id: string;
  workspace_id: string;
  user_id: AiUserId;
  role: "user" | "model";
  content: string;
  created_at: string;
}

export function getServerSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Supabase is not configured.");
  }
  return createClient(url, key);
}

export function getWorkspaceId(): string {
  return (
    process.env.WORKSPACE_ID ??
    process.env.NEXT_PUBLIC_WORKSPACE_ID ??
    "default"
  );
}

export const CHAT_RETENTION_DAYS = 30;

export async function deleteExpiredChatSessions(
  userId: AiUserId,
  workspaceId = getWorkspaceId()
) {
  const supabase = getServerSupabase();
  const cutoff = new Date(Date.now() - CHAT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { error } = await supabase
    .from("ai_chat_sessions")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .lt("updated_at", cutoff);

  if (error) throw new Error(error.message);
}

export async function listUserChatSessions(userId: AiUserId, workspaceId = getWorkspaceId()) {
  await deleteExpiredChatSessions(userId, workspaceId);
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("ai_chat_sessions")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);
  return (data ?? []) as AiChatSession[];
}

export async function getSessionForUser(
  sessionId: string,
  userId: AiUserId,
  workspaceId = getWorkspaceId()
): Promise<AiChatSession | null> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("ai_chat_sessions")
    .select("*")
    .eq("id", sessionId)
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as AiChatSession | null) ?? null;
}

export async function createUserChatSession(userId: AiUserId, title?: string) {
  const supabase = getServerSupabase();
  const workspaceId = getWorkspaceId();
  const { data, error } = await supabase
    .from("ai_chat_sessions")
    .insert({
      workspace_id: workspaceId,
      user_id: userId,
      title: title ?? "New chat",
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as AiChatSession;
}

export async function listSessionMessages(
  sessionId: string,
  userId: AiUserId,
  workspaceId = getWorkspaceId()
) {
  const session = await getSessionForUser(sessionId, userId, workspaceId);
  if (!session) throw new Error("Chat session not found for this user.");

  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("ai_chat_messages")
    .select("*")
    .eq("session_id", sessionId)
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as AiChatMessage[];
}

export async function appendChatMessage(
  sessionId: string,
  userId: AiUserId,
  role: "user" | "model",
  content: string
) {
  const workspaceId = getWorkspaceId();
  const session = await getSessionForUser(sessionId, userId, workspaceId);
  if (!session) throw new Error("Chat session not found for this user.");

  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("ai_chat_messages")
    .insert({
      session_id: sessionId,
      workspace_id: workspaceId,
      user_id: userId,
      role,
      content,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  await supabase
    .from("ai_chat_sessions")
    .update({
      updated_at: new Date().toISOString(),
      title:
        session.title === "New chat" && role === "user"
          ? content.slice(0, 60)
          : session.title,
    })
    .eq("id", sessionId)
    .eq("user_id", userId);

  return data as AiChatMessage;
}

export async function deleteUserChatSession(
  sessionId: string,
  userId: AiUserId,
  workspaceId = getWorkspaceId()
) {
  const session = await getSessionForUser(sessionId, userId, workspaceId);
  if (!session) throw new Error("Chat session not found for this user.");

  const supabase = getServerSupabase();
  const { error: messagesError } = await supabase
    .from("ai_chat_messages")
    .delete()
    .eq("session_id", sessionId)
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);

  if (messagesError) throw new Error(messagesError.message);

  const { error: sessionError } = await supabase
    .from("ai_chat_sessions")
    .delete()
    .eq("id", sessionId)
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);

  if (sessionError) throw new Error(sessionError.message);
}

export async function deleteAllUserChatSessions(
  userId: AiUserId,
  workspaceId = getWorkspaceId()
) {
  const supabase = getServerSupabase();
  const { error: messagesError } = await supabase
    .from("ai_chat_messages")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);

  if (messagesError) throw new Error(messagesError.message);

  const { error: sessionError } = await supabase
    .from("ai_chat_sessions")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);

  if (sessionError) throw new Error(sessionError.message);
}

export async function fetchWorkspaceFinance(workspaceId = getWorkspaceId()) {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("workspace_finance")
    .select("data")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data?.data ?? null;
}

export interface AssistantPreferencesRow {
  workspace_id: string;
  assistant_name: string | null;
  voice_gender: string | null;
  wake_listening_enabled: boolean;
  language: string;
  behavior_instructions: string[];
  reminders: string[];
  updated_at: string;
}

/**
 * assistant_preferences is optional — the app works without it (prefs stay local).
 * Postgres reports a missing table as 42P01; PostgREST reports PGRST205.
 */
function isMissingTableError(error: { code?: string; message?: string }): boolean {
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /could not find the table/i.test(error.message ?? "")
  );
}

export async function fetchAssistantPreferences(
  workspaceId = getWorkspaceId()
): Promise<AssistantPreferencesRow | null> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("assistant_preferences")
    .select("*")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return null;
    throw new Error(error.message);
  }
  if (!data) return null;

  const row = data as Record<string, unknown>;
  return {
    workspace_id: String(row.workspace_id),
    assistant_name: row.assistant_name ? String(row.assistant_name) : null,
    voice_gender: row.voice_gender ? String(row.voice_gender) : null,
    wake_listening_enabled: Boolean(row.wake_listening_enabled ?? true),
    language: String(row.language ?? "en-US"),
    behavior_instructions: Array.isArray(row.behavior_instructions)
      ? (row.behavior_instructions as string[])
      : [],
    reminders: Array.isArray(row.reminders) ? (row.reminders as string[]) : [],
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

export async function upsertAssistantPreferences(
  payload: Partial<Omit<AssistantPreferencesRow, "workspace_id" | "updated_at">> & {
    behavior_instructions?: string[];
    reminders?: string[];
  },
  workspaceId = getWorkspaceId()
) {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("assistant_preferences")
    .upsert(
      {
        workspace_id: workspaceId,
        ...payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id" }
    )
    .select("*")
    .single();

  if (error) {
    // Table not migrated yet — keep prefs working locally instead of failing the save.
    if (isMissingTableError(error)) return null;
    throw new Error(error.message);
  }
  return data as AssistantPreferencesRow;
}

/**
 * Rules live in their own table, `workspace_rules`, holding one JSONB document
 * per workspace.
 *
 * They used to exist ONLY in the browser. When that storage emptied, a rule and
 * every block logged under it were gone with nothing to restore from — the one
 * part of the app with a single copy. Like `assistant_preferences`, a missing
 * table is not an error: the app keeps working locally until the migration is
 * run.
 */
export interface WorkspaceRulesRow {
  workspace_id: string;
  /**
   * `deleted` maps a removed rule or entry id to when it went. Without it a
   * merge that unions two devices would resurrect everything either of them
   * ever deleted.
   */
  data: { rules: unknown[]; entries: unknown[]; deleted?: Record<string, string> };
  updated_at: string;
}

/**
 * `available` says whether the TABLE is there; `row` whether anything has been
 * saved yet. Collapsing both into null once made a brand-new empty table report
 * itself as "not synced", which reads like the migration never ran.
 */
export async function fetchWorkspaceRules(
  workspaceId = getWorkspaceId()
): Promise<{ available: boolean; row: WorkspaceRulesRow | null }> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("workspace_rules")
    .select("workspace_id, data, updated_at")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error) {
    if (isMissingTableError(error)) return { available: false, row: null };
    throw new Error(error.message);
  }
  if (!data) return { available: true, row: null };

  const row = data as Record<string, unknown>;
  const payload = (row.data ?? {}) as {
    rules?: unknown[];
    entries?: unknown[];
    deleted?: Record<string, string>;
  };
  return {
    available: true,
    row: {
      workspace_id: String(row.workspace_id),
      data: {
        rules: Array.isArray(payload.rules) ? payload.rules : [],
        entries: Array.isArray(payload.entries) ? payload.entries : [],
        deleted:
          payload.deleted && typeof payload.deleted === "object" ? payload.deleted : {},
      },
      updated_at: String(row.updated_at ?? new Date().toISOString()),
    },
  };
}

/** Just the row's timestamp, so a poll that finds nothing new costs a few bytes. */
export async function fetchWorkspaceRulesStamp(
  workspaceId = getWorkspaceId()
): Promise<{ available: boolean; updated_at: string | null }> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("workspace_rules")
    .select("updated_at")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) {
    if (isMissingTableError(error)) return { available: false, updated_at: null };
    throw new Error(error.message);
  }
  return { available: true, updated_at: data?.updated_at ? String(data.updated_at) : null };
}

export async function upsertWorkspaceRules(
  payload: { rules: unknown[]; entries: unknown[]; deleted?: Record<string, string> },
  workspaceId = getWorkspaceId()
): Promise<WorkspaceRulesRow | null> {
  // An empty local copy must never overwrite a good remote one. This is the
  // exact shape of the loss that prompted the table: storage cleared itself,
  // and without this guard the next sync would have erased the backup too.
  if (payload.rules.length === 0) {
    const existing = await fetchWorkspaceRules(workspaceId);
    const saved = existing.row?.data.rules.length ?? 0;
    if (saved > 0) {
      throw new Error(
        `Refusing to replace ${saved} saved rule(s) with an empty set. Delete rules individually if that is what you meant.`
      );
    }
  }

  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("workspace_rules")
    .upsert(
      {
        workspace_id: workspaceId,
        data: payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id" }
    )
    .select("updated_at")
    .single();

  if (error) {
    if (isMissingTableError(error)) return null;
    throw new Error(error.message);
  }
  return { workspace_id: workspaceId, data: payload, updated_at: String(data.updated_at) };
}

/* ------------------------------------------------------------------ */
/* Push subscriptions                                                   */
/* ------------------------------------------------------------------ */

/**
 * One row per device that asked to be notified. The endpoint is the key —
 * a browser re-subscribing lands on its own row rather than a duplicate.
 * Missing table is not an error: the app keeps working without push.
 */
export interface PushSubscriptionRow {
  endpoint: string;
  subscription: Record<string, unknown>;
  person: string | null;
}

export async function listPushSubscriptions(
  workspaceId = getWorkspaceId()
): Promise<PushSubscriptionRow[]> {
  const supabase = getServerSupabase();
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint, subscription, person")
    .eq("workspace_id", workspaceId);
  if (error) {
    if (isMissingTableError(error)) return [];
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => ({
    endpoint: String(row.endpoint),
    subscription: (row.subscription ?? {}) as Record<string, unknown>,
    person: row.person ? String(row.person) : null,
  }));
}

export async function upsertPushSubscription(
  subscription: { endpoint: string } & Record<string, unknown>,
  person: string | null,
  workspaceId = getWorkspaceId()
): Promise<boolean> {
  const supabase = getServerSupabase();
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      workspace_id: workspaceId,
      endpoint: subscription.endpoint,
      subscription,
      person,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" }
  );
  if (error) {
    if (isMissingTableError(error)) return false;
    throw new Error(error.message);
  }
  return true;
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  const supabase = getServerSupabase();
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error && !isMissingTableError(error)) throw new Error(error.message);
}
