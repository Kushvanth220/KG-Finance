/**
 * Restore a whole workspace into a (fresh) Supabase project.
 *
 * Usage:
 *   node scripts/restore-workspace.mjs <folder> [--dry-run]
 *
 * <folder> holds JSON files named after the tables they fill:
 *   workspace_finance.json       { workspace_id, data }
 *   workspace_rules.json         { workspace_id, data }
 *   assistant_preferences.json   { workspace_id, ... }
 *   ai_chat_sessions.json        [ rows ]
 *   ai_chat_messages.json        [ rows ]
 * Any file that is missing is skipped. Rows are upserted, so running it twice
 * is safe. Reads NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY from
 * .env.local (setup.sql must have been run in the target project first).
 */

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = process.cwd();
const folder = process.argv[2];
const dryRun = process.argv.includes("--dry-run");

if (!folder) {
  console.error("Usage: node scripts/restore-workspace.mjs <folder> [--dry-run]");
  process.exit(1);
}

function loadEnv() {
  const envPath = path.join(root, ".env.local");
  const env = Object.fromEntries(
    fs
      .readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const i = line.indexOf("=");
        return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
      })
  );
  return { url: env.NEXT_PUBLIC_SUPABASE_URL, key: env.NEXT_PUBLIC_SUPABASE_ANON_KEY };
}

function readJson(name) {
  const file = path.join(folder, name);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const { url, key } = loadEnv();
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
  process.exit(1);
}
console.log("Target:", url, dryRun ? "(dry run — nothing will be written)" : "");

const supabase = createClient(url, key);

async function upsert(table, rows, onConflict) {
  if (!rows || rows.length === 0) return;
  console.log(`${table}: ${rows.length} row(s)`);
  if (dryRun) return;
  // Insert in slices so no single request is oversized.
  for (let i = 0; i < rows.length; i += 200) {
    const slice = rows.slice(i, i + 200);
    const { error } = await supabase.from(table).upsert(slice, { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

const finance = readJson("workspace_finance.json");
const rules = readJson("workspace_rules.json");
const prefs = readJson("assistant_preferences.json");
const sessions = readJson("ai_chat_sessions.json");
const messages = readJson("ai_chat_messages.json");

if (finance) {
  const d = finance.data ?? {};
  console.log(
    `finance summary: ${d.transactions?.length ?? 0} transactions, ${d.accounts?.length ?? 0} accounts, ` +
      `${d.incomeEntries?.length ?? 0} income entries, ${d.spendCategories?.length ?? 0} categories, ` +
      `${d.settlementHistory?.length ?? 0} settlement rows`
  );
}

try {
  await upsert("workspace_finance", finance ? [finance] : null, "workspace_id");
  await upsert("workspace_rules", rules ? [rules] : null, "workspace_id");
  await upsert("assistant_preferences", prefs ? [prefs] : null, "workspace_id");
  await upsert("ai_chat_sessions", sessions, "id");
  await upsert("ai_chat_messages", messages, "id");
  console.log(dryRun ? "Dry run complete." : "Restore complete.");
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
