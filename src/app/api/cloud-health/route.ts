import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * How many records the cloud holds — without downloading the cloud.
 *
 * This used to answer by selecting `data`: the entire workspace document,
 * roughly 290 KB, for every row, on every call — and then taking six array
 * lengths from it. The sync page calls this on open and again after every
 * completed sync, so sitting on that screen while edits flowed pulled
 * megabytes out of Supabase to display six integers. Supabase meters egress,
 * and that is what ran the quota to 160%.
 *
 * So the stamp is read first — `workspace_id, updated_at`, a few bytes — and
 * the documents are only pulled when one of them has actually moved since the
 * last count. Repeat checks on an unchanged workspace cost a stamp and
 * nothing else.
 */

interface RowCounts {
  workspace_id: string;
  updated_at: string | null;
  transactions: number;
  incomeEntries: number;
  accounts: number;
  bills: number;
  flexDeposits: number;
  remittances: number;
  /** Own money moved between own accounts (transactions of type "transfer"). */
  selfTransfers: number;
  /** When Home's card layout was last changed, or null when none is saved. */
  homeLayoutAt: string | null;
}

/** Last counts, and the stamps they were counted from. */
let counted: { key: string; rows: RowCounts[] } | null = null;

function stampKey(rows: { workspace_id: string; updated_at: string | null }[]): string {
  return rows
    .map((row) => `${row.workspace_id}@${row.updated_at ?? ""}`)
    .sort()
    .join("|");
}

export async function GET() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const workspaceId =
    process.env.WORKSPACE_ID ?? process.env.NEXT_PUBLIC_WORKSPACE_ID ?? "default";

  if (!url || !key) {
    return NextResponse.json({
      ok: false,
      configured: false,
      error: "Missing Supabase URL or anon key in environment.",
    });
  }

  const failed = (message: string) =>
    NextResponse.json({ ok: false, configured: true, url, workspaceId, error: message });

  try {
    const supabase = createClient(url, key);

    // Cheap: identities and stamps only, never the documents.
    const { data: stamps, error: stampError } = await supabase
      .from("workspace_finance")
      .select("workspace_id, updated_at");

    if (stampError) return failed(stampError.message);

    const seen = (stamps ?? []) as { workspace_id: string; updated_at: string | null }[];
    const currentKey = stampKey(seen);

    let rows: RowCounts[];
    if (counted && counted.key === currentKey) {
      rows = counted.rows;
    } else {
      const { data, error } = await supabase
        .from("workspace_finance")
        .select("workspace_id, updated_at, data");

      if (error) return failed(error.message);

      rows = (data ?? []).map((row) => {
        const doc = (row.data ?? {}) as {
          transactions?: Array<{ type?: string }>;
          incomeEntries?: unknown[];
          accounts?: unknown[];
          monthlyExpenses?: unknown[];
          flexDeposits?: unknown[];
          remittances?: unknown[];
          homeLayout?: { updatedAt?: string };
        };
        return {
          workspace_id: row.workspace_id,
          updated_at: row.updated_at,
          transactions: doc.transactions?.length ?? 0,
          incomeEntries: doc.incomeEntries?.length ?? 0,
          accounts: doc.accounts?.length ?? 0,
          bills: doc.monthlyExpenses?.length ?? 0,
          flexDeposits: doc.flexDeposits?.length ?? 0,
          remittances: doc.remittances?.length ?? 0,
          selfTransfers: doc.transactions?.filter((t) => t?.type === "transfer").length ?? 0,
          homeLayoutAt: typeof doc.homeLayout?.updatedAt === "string" ? doc.homeLayout.updatedAt : null,
        };
      });
      counted = { key: currentKey, rows };
    }

    return NextResponse.json({
      ok: true,
      configured: true,
      url,
      workspaceId,
      rows,
      matched: rows.find((row) => row.workspace_id === workspaceId),
    });
  } catch (error) {
    return failed(error instanceof Error ? error.message : "Unknown connection error");
  }
}
