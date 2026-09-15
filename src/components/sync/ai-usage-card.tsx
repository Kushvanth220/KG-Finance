"use client";

import { useEffect, useState } from "react";
import { Cpu } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { formatCurrency } from "@/lib/formatters";
import type { AiUsageSummary } from "@/lib/ai/usage";

/**
 * What Jarvis cost this month, by model.
 *
 * Priced from list rates, so it is an estimate — close enough to notice a
 * bad week, not a substitute for the provider's own bill.
 */

const PROVIDER_TINT: Record<string, string> = {
  gemini: "#34c759",
  chatgpt: "#5ac8fa",
  claude: "#af52de",
};

function tokens(n: number): string {
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export function AiUsageCard() {
  const [summary, setSummary] = useState<AiUsageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/ai/usage", { cache: "no-store" })
      .then((r) => r.json())
      .then((payload) => {
        if (cancelled) return;
        if (!payload.ok) setError(payload.error ?? "Could not read usage.");
        else setSummary(payload as AiUsageSummary);
      })
      .catch(() => !cancelled && setError("Could not read usage."));
    return () => {
      cancelled = true;
    };
  }, []);

  const monthLabel = summary
    ? new Date(`${summary.month}-01T00:00:00`).toLocaleDateString("en-US", { month: "long" })
    : "";

  return (
    <GlassCard className="!p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold">
          <Cpu className="h-3.5 w-3.5 text-[#af52de]" /> AI usage{monthLabel ? ` · ${monthLabel}` : ""}
        </p>
        {summary?.available ? (
          <p className="text-[11px] text-muted">
            {summary.calls} {summary.calls === 1 ? "call" : "calls"} · est.{" "}
            <span className="font-semibold text-foreground tabular-nums">{formatCurrency(summary.totalCostUsd)}</span>
          </p>
        ) : null}
      </div>

      {error ? (
        <p className="text-[11px] text-[#ff3b30]">{error}</p>
      ) : !summary ? (
        <p className="text-[11px] text-muted">Adding it up…</p>
      ) : !summary.available ? (
        <p className="text-[11px] text-muted">
          Not tracked yet — the <span className="font-mono">ai_usage</span>{" "}table isn&apos;t created. Every call is counted once it is.
        </p>
      ) : summary.lines.length === 0 ? (
        <p className="text-[11px] text-muted">No AI calls recorded this month.</p>
      ) : (
        <div className="space-y-1">
          {summary.lines.map((line) => (
            <div key={`${line.provider}:${line.model}`} className="flex items-center gap-2 text-[11px]">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: PROVIDER_TINT[line.provider] ?? "#8e8e93" }} />
              <span className="min-w-0 flex-1 truncate font-mono">{line.model}</span>
              <span className="shrink-0 text-muted tabular-nums">
                {line.calls}× · {tokens(line.inputTokens)} in / {tokens(line.outputTokens)} out
              </span>
              <span className="w-14 shrink-0 text-right font-semibold tabular-nums">{formatCurrency(line.costUsd)}</span>
            </div>
          ))}
          <p className="pt-1 text-[10px] text-muted">Estimated from list prices per token; the provider&apos;s bill is the real figure.</p>
        </div>
      )}
    </GlassCard>
  );
}
