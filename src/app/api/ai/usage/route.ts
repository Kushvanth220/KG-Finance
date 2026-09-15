import { NextResponse } from "next/server";
import { summariseAiUsage } from "@/lib/ai/usage";
import { zonedMonth } from "@/lib/zoned-date";

export const dynamic = "force-dynamic";

/** This month's AI spend, by model. Estimated from list prices. */
export async function GET(request: Request) {
  const month = new URL(request.url).searchParams.get("month") ?? zonedMonth();
  try {
    const summary = await summariseAiUsage(month);
    return NextResponse.json({ ok: true, ...summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read usage.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
