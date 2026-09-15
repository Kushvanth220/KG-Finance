import { NextResponse } from "next/server";
import { fetchWorkspaceRules, fetchWorkspaceRulesStamp, upsertWorkspaceRules } from "@/lib/ai/chat-store";

export const dynamic = "force-dynamic";

interface RulesBody {
  rules?: unknown[];
  entries?: unknown[];
  /** Removed ids, so a delete on one device is not undone by another's merge. */
  deleted?: Record<string, string>;
}

export async function GET(request: Request) {
  try {
    // A poll that already holds the current stamp gets a tiny "unchanged"
    // instead of the whole document — the document is only sent when it moved.
    const known = new URL(request.url).searchParams.get("stamp");
    if (known) {
      const current = await fetchWorkspaceRulesStamp();
      if (current.available && current.updated_at === known) {
        return NextResponse.json({ ok: true, synced: true, unchanged: true, updated_at: known });
      }
    }

    const { available, row } = await fetchWorkspaceRules();
    return NextResponse.json({
      ok: true,
      // `synced: false` means the table has not been created yet, so the app
      // keeps working from local storage without reporting a failure. An empty
      // table that simply has no row yet is still synced.
      synced: available,
      rules: row?.data.rules ?? [],
      entries: row?.data.entries ?? [],
      deleted: row?.data.deleted ?? {},
      updated_at: row?.updated_at ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load rules.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RulesBody;
    const saved = await upsertWorkspaceRules({
      rules: Array.isArray(body.rules) ? body.rules : [],
      entries: Array.isArray(body.entries) ? body.entries : [],
      deleted:
        body.deleted && typeof body.deleted === "object" ? body.deleted : {},
    });
    return NextResponse.json({ ok: true, synced: saved !== null, updated_at: saved?.updated_at ?? null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to save rules.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
