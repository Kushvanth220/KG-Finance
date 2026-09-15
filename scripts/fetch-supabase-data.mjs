import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function loadEnv() {
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) {
    throw new Error(".env.local not found");
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

const { url, key, workspaceId } = loadEnv();

if (!url || !key) {
  throw new Error("Missing Supabase URL or anon key in .env.local");
}

const supabase = createClient(url, key);

const { data, error } = await supabase
  .from("workspace_finance")
  .select("workspace_id, data, updated_at")
  .eq("workspace_id", workspaceId)
  .maybeSingle();

if (error) {
  console.error("Supabase error:", error.message);
  process.exit(1);
}

if (!data) {
  console.log("No row found for workspace:", workspaceId);
  process.exit(0);
}

const outDir = path.join(root, "backups");
fs.mkdirSync(outDir, { recursive: true });

const exportPath = path.join(outDir, "supabase-export.json");
const summaryPath = path.join(outDir, "supabase-export-summary.json");

const finance = data.data ?? {};
const summary = {
  workspace_id: data.workspace_id,
  updated_at: data.updated_at,
  counts: {
    incomeSources: finance.incomeSources?.length ?? 0,
    incomeEntries: finance.incomeEntries?.length ?? 0,
    monthlyExpenses: finance.monthlyExpenses?.length ?? 0,
    accounts: finance.accounts?.length ?? 0,
    debts: finance.debts?.length ?? 0,
    transactions: finance.transactions?.length ?? 0,
    settlementHistory: finance.settlementHistory?.length ?? 0,
    deletedHistory: finance.deletedHistory?.length ?? 0,
  },
  settlementBalance: finance.settlementBalance ?? 0,
};

fs.writeFileSync(
  exportPath,
  JSON.stringify(
    {
      workspace_id: data.workspace_id,
      updated_at: data.updated_at,
      data: finance,
    },
    null,
    2
  )
);

fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

console.log("Export saved:", exportPath);
console.log("Summary saved:", summaryPath);
console.log(JSON.stringify(summary, null, 2));
