import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_WORKSPACE_ID = "default";

export interface SyncConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  workspaceId: string;
}

let cachedConfig: SyncConfig | null = null;
let configPromise: Promise<SyncConfig | null> | null = null;
let cachedClient: SupabaseClient | null = null;

function configFromEnv(): SyncConfig | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return {
    supabaseUrl,
    supabaseAnonKey,
    workspaceId:
      process.env.NEXT_PUBLIC_WORKSPACE_ID ?? DEFAULT_WORKSPACE_ID,
  };
}

async function fetchConfigFromApi(): Promise<SyncConfig | null> {
  try {
    const response = await fetch("/api/sync-config", { cache: "no-store" });
    if (!response.ok) return null;

    const data = (await response.json()) as {
      configured?: boolean;
      supabaseUrl?: string | null;
      supabaseAnonKey?: string | null;
      workspaceId?: string;
    };

    if (!data.configured || !data.supabaseUrl || !data.supabaseAnonKey) {
      return null;
    }

    return {
      supabaseUrl: data.supabaseUrl,
      supabaseAnonKey: data.supabaseAnonKey,
      workspaceId: data.workspaceId ?? DEFAULT_WORKSPACE_ID,
    };
  } catch {
    return null;
  }
}

function cacheSyncConfig(config: SyncConfig) {
  if (
    cachedConfig &&
    (cachedConfig.supabaseUrl !== config.supabaseUrl ||
      cachedConfig.supabaseAnonKey !== config.supabaseAnonKey)
  ) {
    cachedClient = null;
  }

  cachedConfig = config;
  return config;
}

export async function loadSyncConfig(): Promise<SyncConfig | null> {
  if (cachedConfig) return cachedConfig;
  if (configPromise) return configPromise;

  configPromise = (async () => {
    try {
      // In the browser, always load from the server route so production
      // picks up the current Vercel env instead of a stale client bundle.
      if (typeof window !== "undefined") {
        const apiConfig = await fetchConfigFromApi();
        if (apiConfig) return cacheSyncConfig(apiConfig);
      }

      const envConfig = configFromEnv();
      if (envConfig) return cacheSyncConfig(envConfig);

      if (typeof window === "undefined") {
        return null;
      }

      return null;
    } finally {
      configPromise = null;
    }
  })();

  return configPromise;
}

export function getCachedSyncConfig() {
  return cachedConfig ?? configFromEnv();
}

export function createClient(config?: SyncConfig | null) {
  const resolved = config ?? getCachedSyncConfig();
  if (!resolved) return null;

  if (
    cachedClient &&
    cachedConfig?.supabaseUrl === resolved.supabaseUrl &&
    cachedConfig?.supabaseAnonKey === resolved.supabaseAnonKey
  ) {
    return cachedClient;
  }

  cachedClient = createSupabaseClient(
    resolved.supabaseUrl,
    resolved.supabaseAnonKey
  );
  cachedConfig = resolved;
  return cachedClient;
}

export function getSyncWorkspaceId(config?: SyncConfig | null) {
  return (config ?? getCachedSyncConfig())?.workspaceId ?? DEFAULT_WORKSPACE_ID;
}

export function isSupabaseConfigured() {
  return Boolean(getCachedSyncConfig());
}

export async function isSupabaseConfiguredAsync() {
  const config = await loadSyncConfig();
  return Boolean(config);
}

export function resetSyncClientCache() {
  cachedConfig = null;
  cachedClient = null;
  configPromise = null;
}
