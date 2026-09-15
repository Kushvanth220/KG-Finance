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

  return NextResponse.json({
    configured: Boolean(url && key),
    supabaseUrl: url ?? null,
    supabaseAnonKey: key ?? null,
    workspaceId,
  });
}
