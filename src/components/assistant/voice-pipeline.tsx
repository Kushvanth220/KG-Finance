"use client";

import { cn } from "@/lib/utils";
import type { AssistantLiveOrbState } from "@/components/assistant/assistant-live-orb";

/**
 * The live voice path, drawn from real state.
 *
 * This is NOT the 3-model council graph from text chat. A voice call runs on
 * Gemini Live only — ChatGPT and Claude answer on text — so showing three
 * layers here would be drawing something that never happens. What it shows is
 * the pipeline that genuinely runs: your mic, the live model, the app's own
 * tools when a money action fires, and Jarvis speaking back.
 *
 * Every segment lights from a real signal, never a timer.
 */

interface VoicePipelineProps {
  /** connecting | listening | speaking | thinking | idle */
  state: AssistantLiveOrbState;
  /** True while an app tool (record expense, adjust balance…) is executing. */
  toolBusy: boolean;
  /** False before the call starts — the whole strip sits dim. */
  active: boolean;
  className?: string;
}

const NODES = ["You", "Gemini", "Tools", "Jarvis"] as const;

export function VoicePipeline({ state, toolBusy, active, className }: VoicePipelineProps) {
  const connecting = state === "connecting";
  const listening = state === "listening";
  const thinking = state === "thinking" || toolBusy;
  const speaking = state === "speaking";

  // Which hop is carrying signal right now.
  const legLive = [
    active && listening,                 // You -> Gemini
    active && (thinking || speaking),    // Gemini -> Tools
    active && speaking,                  // Tools -> Jarvis
  ];

  const nodeLive = [
    active && listening,
    active && (listening || thinking || speaking),
    active && thinking,
    active && speaking,
  ];

  const caption = !active
    ? "Not connected"
    : connecting
      ? "Connecting to Gemini Live…"
      : thinking
        ? "Running an app tool…"
        : speaking
          ? "Jarvis is answering"
          : listening
            ? "Listening on your mic"
            : "Live";

  return (
    <div
      className={cn("vp", className)}
      role="status"
      aria-live="polite"
      aria-label={caption}
    >
      <div className="vp-row">
        {NODES.map((label, i) => (
          <div className="vp-seg" key={label}>
            <span className={cn("vp-node", nodeLive[i] && "vp-node-live", connecting && i <= 1 && "vp-node-wait")}>
              <i />
            </span>
            <span className={cn("vp-label", nodeLive[i] && "vp-label-live")}>{label}</span>
            {i < NODES.length - 1 ? (
              <span className={cn("vp-wire", legLive[i] && "vp-wire-live")} aria-hidden />
            ) : null}
          </div>
        ))}
      </div>
      <p className="vp-caption">{caption}</p>
    </div>
  );
}
