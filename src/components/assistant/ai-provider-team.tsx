"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface ProviderStatus {
  id: string;
  label: string;
  configured: boolean;
}

const FALLBACK: ProviderStatus[] = [
  { id: "gemini", label: "Gemini", configured: true },
  { id: "chatgpt", label: "ChatGPT", configured: false },
  { id: "claude", label: "Claude", configured: false },
];

let cachedProviders: ProviderStatus[] | null = null;
let inflightProviders: Promise<ProviderStatus[]> | null = null;

function loadProviders(): Promise<ProviderStatus[]> {
  if (cachedProviders) return Promise.resolve(cachedProviders);
  if (inflightProviders) return inflightProviders;
  inflightProviders = fetch("/api/ai/providers", { cache: "no-store" })
    .then((response) => response.json())
    .then((payload) => {
      const providers =
        payload.ok && Array.isArray(payload.providers) ? payload.providers : FALLBACK;
      cachedProviders = providers;
      return providers;
    })
    .catch(() => FALLBACK)
    .finally(() => {
      inflightProviders = null;
    });
  return inflightProviders;
}

/**
 * These chips answer one question only: which layers are wired up (API key
 * present). They deliberately do NOT track per-turn results — a configured
 * layer that lost one race is still live, and showing it as "Off" reads as
 * "Claude is broken". Per-turn answered/failed belongs to the council graph,
 * which already renders it per layer.
 */
export function AiProviderTeam({ voiceLive = false }: { voiceLive?: boolean }) {
  const [providers, setProviders] = useState<ProviderStatus[]>(cachedProviders ?? FALLBACK);

  useEffect(() => {
    let cancelled = false;
    void loadProviders().then((next) => {
      if (!cancelled) setProviders(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Live AI providers">
      {providers.map((provider) => {
        const live = provider.configured;
        const speaking = voiceLive && provider.id === "gemini" && live;
        const status = !live ? "Off" : speaking ? "Voice" : "Live";
        return (
          <span
            key={provider.id}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold leading-none",
              live
                ? "border-[#34c759]/35 bg-[#34c759]/12 text-[#1f7a3a] dark:text-[#7dff9a]"
                : "border-black/10 dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.06] text-muted"
            )}
            title={
              live
                ? `${provider.label} is connected and answering as a hidden layer`
                : `${provider.label} has no API key configured`
            }
          >
            <span
              className={cn(
                "rounded-full",
                live ? "assistant-live-dot" : "h-2 w-2 bg-white/25"
              )}
              aria-hidden
            />
            {provider.label}
            <span className={live ? "opacity-80" : "opacity-60"}>{status}</span>
          </span>
        );
      })}
    </div>
  );
}
