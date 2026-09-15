import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnv() {
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error(".env.local not found — add your NEW Supabase URL and anon key first");
  }

  const env = Object.fromEntries(
    fs
      .readFileSync(envPath, "utf8")
      .split("\n")
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => {
        const i = line.indexOf("=");
        return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
      })
  );

  return {
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    key: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    workspaceId: env.NEXT_PUBLIC_WORKSPACE_ID ?? "default",
  };
}

function resolveBackupPath(argPath) {
  if (argPath) {
    return path.isAbsolute(argPath) ? argPath : path.join(root, argPath);
  }

  const latest = path.join(root, "docs", "supabase-export.json");
  if (fs.existsSync(latest)) return latest;

  const backupsDir = path.join(root, "backups");
  if (!fs.existsSync(backupsDir)) {
    throw new Error("No backup file found. Run: npm run backup:supabase");
  }

  const folders = fs
    .readdirSync(backupsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();

  for (const folder of folders) {
    const candidate = path.join(backupsDir, folder, "workspace-finance.json");
    if (fs.existsSync(candidate)) return candidate;
  }

  throw new Error("No backup file found. Run: npm run backup:supabase");
}

const backupArg = process.argv[2];
const backupPath = resolveBackupPath(backupArg);
const payload = JSON.parse(fs.readFileSync(backupPath, "utf8"));

if (!payload?.data || !payload?.workspace_id) {
  throw new Error(`Invalid backup file: ${backupPath}`);
}

const { url, key, workspaceId } = loadEnv();

if (!url || !key) {
  throw new Error("Missing Supabase URL or anon key in .env.local");
}

console.log("Restore source:", backupPath);
console.log("Target Supabase:", url);
console.log("Workspace id:", payload.workspace_id);
console.log("Env workspace key:", workspaceId);

if (payload.workspace_id !== workspaceId) {
  console.warn(
    `Warning: backup workspace_id (${payload.workspace_id}) differs from NEXT_PUBLIC_WORKSPACE_ID (${workspaceId}). Using backup id.`
  );
}

const supabase = createClient(url, key);

const row = {
  workspace_id: payload.workspace_id,
  data: payload.data,
};

if (payload.updated_at) {
  row.updated_at = payload.updated_at;
}

const { data, error } = await supabase
  .from("workspace_finance")
  .upsert(row, { onConflict: "workspace_id" })
  .select("workspace_id, updated_at")
  .single();

if (error) {
  console.error("Restore failed:", error.message);
  if (error.message.includes("workspace_finance")) {
    console.error("\nRun supabase/setup.sql in your NEW project's SQL Editor first.");
  }
  process.exit(1);
}

const finance = payload.data;
console.log("\nRestore complete.");
console.log(
  JSON.stringify(
    {
      workspace_id: data.workspace_id,
      updated_at: data.updated_at,
      transactions: finance.transactions?.length ?? 0,
      accounts: finance.accounts?.length ?? 0,
      incomeEntries: finance.incomeEntries?.length ?? 0,
    },
    null,
    2
  )
);
