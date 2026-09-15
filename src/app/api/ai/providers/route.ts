import { NextResponse } from "next/server";
import { getAiProviderStatus } from "@/lib/ai/providers";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    providers: getAiProviderStatus(),
    note: "Gemini, ChatGPT, and Claude each answer as hidden layers. The best reply is the output.",
  });
}
