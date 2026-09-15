import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const url =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const workspaceId =
    process.env.WORKSPACE_ID ??
    process.env.NEXT_PUBLIC_WORKSPACE_ID ??
    "default";

  if (!url || !key) {
    return NextResponse.json({
      ok: false,
      configured: false,
      error: "Missing Supabase URL or anon key in environment.",
    });
  }

  try {
    const supabase = createClient(url, key);
    const { data, error } = await supabase
      .from("workspace_finance")
      .select("workspace_id, updated_at, data");

    if (error) {
      return NextResponse.json({
        ok: false,
        configured: true,
        url,
        workspaceId,
        error: error.message,
      });
    }

    const rows = (data ?? []).map((row) => {
      const doc = (row.data ?? {}) as {
        transactions?: unknown[];
        incomeEntries?: unknown[];
        accounts?: unknown[];
        monthlyExpenses?: unknown[];
        flexDeposits?: unknown[];
      };
      return {
        workspace_id: row.workspace_id,
        updated_at: row.updated_at,
        transactions: doc.transactions?.length ?? 0,
        incomeEntries: doc.incomeEntries?.length ?? 0,
        accounts: doc.accounts?.length ?? 0,
        bills: doc.monthlyExpenses?.length ?? 0,
        flexDeposits: doc.flexDeposits?.length ?? 0,
      };
    });

    const matched = rows.find((row) => row.workspace_id === workspaceId);

    return NextResponse.json({
      ok: true,
      configured: true,
      url,
      workspaceId,
      rows,
      matched,
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      configured: true,
      url,
      workspaceId,
      error: error instanceof Error ? error.message : "Unknown connection error",
    });
  }
}
