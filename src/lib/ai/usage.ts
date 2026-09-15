import { getWorkspaceId, getServerSupabase } from "@/lib/ai/chat-store";

/**
 * What the AI costs.
 *
 * Every provider call reports tokens; this writes them down (best effort,
 * never blocking a reply) and prices them from a small table so the month
 * can be summed. The prices are list prices per million tokens and will
 * drift — the figure is an ESTIMATE and is labelled as one everywhere.
 */

export type AiProvider = "gemini" | "chatgpt" | "claude";

export interface AiUsageEntry {
  provider: AiProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** What the call was for, e.g. "chat", "review", "live-token". */
  purpose?: string;
}

/** USD per 1M tokens: [input, output]. Matched by substring, first hit wins. */
const RATES: Array<[pattern: RegExp, input: number, output: number]> = [
  [/gemini-2\.5-pro/i, 1.25, 10],
  [/gemini-2\.5-flash-lite/i, 0.1, 0.4],
  [/gemini-2\.5-flash/i, 0.3, 2.5],
  [/gemini-2\.0-flash/i, 0.1, 0.4],
  [/gemini.*live/i, 0.5, 2],
  [/gemini/i, 0.3, 2.5],
  [/gpt-4o-mini/i, 0.15, 0.6],
  [/gpt-4\.1-mini/i, 0.4, 1.6],
  [/gpt-4\.1/i, 2, 8],
  [/gpt-4o/i, 2.5, 10],
  [/gpt-5-mini/i, 0.25, 2],
  [/gpt-5/i, 1.25, 10],
  [/gpt/i, 1, 4],
  [/claude.*opus/i, 15, 75],
  [/claude.*fable/i, 15, 75],
  [/claude.*sonnet/i, 3, 15],
  [/claude.*haiku-4/i, 1, 5],
  [/claude.*haiku/i, 0.8, 4],
  [/claude/i, 3, 15],
];

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const hit = RATES.find(([pattern]) => pattern.test(model));
  const [, inRate, outRate] = hit ?? [/./, 1, 5];
  return (inputTokens * inRate + outputTokens * outRate) / 1_000_000;
}

let warnedMissing = false;

/** Fire-and-forget. A missing table logs once and is then silent. */
export function recordAiUsage(entry: AiUsageEntry): void {
  if (!Number.isFinite(entry.inputTokens) && !Number.isFinite(entry.outputTokens)) return;
  void (async () => {
    try {
      const supabase = getServerSupabase();
      const { error } = await supabase.from("ai_usage").insert({
        workspace_id: getWorkspaceId(),
        provider: entry.provider,
        model: entry.model,
        input_tokens: Math.max(0, Math.round(entry.inputTokens || 0)),
        output_tokens: Math.max(0, Math.round(entry.outputTokens || 0)),
        purpose: entry.purpose ?? "chat",
        cost_usd: estimateCostUsd(entry.model, entry.inputTokens || 0, entry.outputTokens || 0),
      });
      if (error && !warnedMissing) {
        warnedMissing = true;
        console.warn("[ai-usage] not recorded:", error.message);
      }
    } catch {
      // Never let bookkeeping break a reply.
    }
  })();
}

export interface AiUsageLine {
  provider: AiProvider;
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface AiUsageSummary {
  month: string;
  available: boolean;
  totalCostUsd: number;
  calls: number;
  lines: AiUsageLine[];
}

/** This calendar month, grouped by model. */
export async function summariseAiUsage(month: string): Promise<AiUsageSummary> {
  const supabase = getServerSupabase();
  const [year, mm] = month.split("-").map(Number);
  const from = new Date(Date.UTC(year!, mm! - 1, 1)).toISOString();
  const to = new Date(Date.UTC(year!, mm!, 1)).toISOString();

  const { data, error } = await supabase
    .from("ai_usage")
    .select("provider, model, input_tokens, output_tokens, cost_usd")
    .eq("workspace_id", getWorkspaceId())
    .gte("created_at", from)
    .lt("created_at", to);

  if (error) return { month, available: false, totalCostUsd: 0, calls: 0, lines: [] };

  const byModel = new Map<string, AiUsageLine>();
  for (const row of data ?? []) {
    const key = `${row.provider}:${row.model}`;
    const line = byModel.get(key) ?? {
      provider: row.provider as AiProvider,
      model: String(row.model),
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };
    line.calls += 1;
    line.inputTokens += Number(row.input_tokens ?? 0);
    line.outputTokens += Number(row.output_tokens ?? 0);
    line.costUsd += Number(row.cost_usd ?? 0);
    byModel.set(key, line);
  }
  const lines = [...byModel.values()].sort((a, b) => b.costUsd - a.costUsd);
  return {
    month,
    available: true,
    totalCostUsd: lines.reduce((sum, l) => sum + l.costUsd, 0),
    calls: lines.reduce((sum, l) => sum + l.calls, 0),
    lines,
  };
}
