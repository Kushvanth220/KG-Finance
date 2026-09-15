"use client";

import { cn } from "@/lib/utils";
import type { CouncilStage, LayerStatus } from "@/lib/ai/council";

const STAGE_ORDER: CouncilStage[] = ["input", "draft", "review", "merge", "output"];

/** The free layer drafts; the paid layers only review it when it is worth paying for. */
const FREE_LAYER = { id: "gemini", label: "Gemini", tint: "#4d9fff" } as const;
const PAID_LAYERS = [
  { id: "chatgpt", label: "ChatGPT", tint: "#00ffa3" },
  { id: "claude", label: "Claude", tint: "#ff9d5c" },
] as const;

const STAGE_LABEL: Record<CouncilStage, string> = {
  input: "Sending your question…",
  draft: "Free layer is drafting…",
  review: "Paid layers are checking it…",
  merge: "Settling on one answer…",
  output: "Writing the reply…",
};

/* Geometry: input -> free draft -> decision gate -> (paid review | bypass) -> output. */
const VIEW = { w: 320, h: 104 };
const X_IN = 14;
const X_FREE = 84;
const X_GATE = 158;
const X_PAID = 236;
const X_OUT = 306;
const Y_MID = 44;
const PAID_Y = [22, 66];
const Y_BYPASS = 88;

/** S-curve, so the hand-offs read as flowing wires. */
function curve(x1: number, y1: number, x2: number, y2: number) {
  const bend = (x2 - x1) * 0.55;
  return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
}

interface CouncilLayerAnimationProps {
  /** True while the request is in flight. */
  active: boolean;
  /** Real stage reported by the server. */
  stage: CouncilStage;
  /** Real per-provider status reported by the server as each one settles. */
  layers: Record<string, LayerStatus>;
  /** Whether the paid review ran this turn, and the server's reason for that call. */
  reviewed: boolean | null;
  reviewReason: string | null;
  className?: string;
}

export function CouncilLayerAnimation({
  active,
  stage,
  layers,
  reviewed,
  reviewReason,
  className,
}: CouncilLayerAnimationProps) {
  const step = STAGE_ORDER.indexOf(stage);
  const stateOf = (id: string): LayerStatus | "idle" => layers[id] ?? "idle";

  const freeState = stateOf(FREE_LAYER.id);
  const freeDone = freeState === "answered";
  const paidAnswered = PAID_LAYERS.filter((l) => stateOf(l.id) === "answered").length;
  const paidSkipped = PAID_LAYERS.every((l) => stateOf(l.id) === "skipped");

  // A wire only carries signal once its source has really produced something.
  const inLive = step >= 1;
  const gateLive = freeDone;
  const reviewLive = reviewed === true && gateLive;
  const bypassLive = (reviewed === false || paidSkipped) && gateLive;
  const outLive = bypassLive || paidAnswered > 0 || step >= 3;

  const inPath = curve(X_IN, Y_MID, X_FREE, Y_MID);
  const gatePath = curve(X_FREE, Y_MID, X_GATE, Y_MID);
  const paidPaths = PAID_Y.map((y) => curve(X_GATE, Y_MID, X_PAID, y));
  const paidOutPaths = PAID_Y.map((y) => curve(X_PAID, y, X_OUT, Y_MID));
  const bypassPath = `M ${X_GATE} ${Y_MID} C ${X_GATE + 44} ${Y_BYPASS}, ${X_OUT - 44} ${Y_BYPASS}, ${X_OUT} ${Y_MID}`;

  const caption = (() => {
    if (reviewed === false) {
      return `Free layer only — no credits used (${reviewReason ?? "simple answer"})`;
    }
    if (reviewed === true && paidAnswered > 0) {
      return `Checked by ${paidAnswered} paid layer${paidAnswered > 1 ? "s" : ""}`;
    }
    if (reviewed === true) {
      return `Paid review — ${reviewReason ?? "worth a second opinion"}`;
    }
    return STAGE_LABEL[stage];
  })();

  return (
    <div
      className={cn("nn", className)}
      role="status"
      aria-live="polite"
      aria-label={STAGE_LABEL[stage]}
    >
      <svg
        className="nn-svg"
        viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        <defs>
          <linearGradient id="nnWire" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#00e5ff" />
            <stop offset="50%" stopColor="#5b8cff" />
            <stop offset="100%" stopColor="#c084fc" />
          </linearGradient>
          <filter id="nnGlow" x="-120%" y="-120%" width="340%" height="340%">
            <feGaussianBlur stdDeviation="2.4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="nnGlowSoft" x="-120%" y="-120%" width="340%" height="340%">
            <feGaussianBlur stdDeviation="1.3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <path id="nnPIn" d={inPath} className={cn("nn-edge", inLive && "nn-edge-live")} />
        <path id="nnPGate" d={gatePath} className={cn("nn-edge", gateLive && "nn-edge-live")} />

        {paidPaths.map((d, i) => (
          <path
            key={`paid-${i}`}
            id={`nnPPaid${i}`}
            d={d}
            className={cn(
              "nn-edge",
              reviewLive && "nn-edge-live",
              bypassLive && "nn-edge-idle"
            )}
            style={{ animationDelay: `${i * 90}ms` }}
          />
        ))}

        {paidOutPaths.map((d, i) => (
          <path
            key={`paidout-${i}`}
            d={d}
            className={cn(
              "nn-edge",
              reviewLive && stateOf(PAID_LAYERS[i]!.id) === "answered" && "nn-edge-live",
              stateOf(PAID_LAYERS[i]!.id) === "failed" && "nn-edge-dead",
              bypassLive && "nn-edge-idle"
            )}
            style={{ animationDelay: `${i * 90}ms` }}
          />
        ))}

        {/* The money-saving shortcut: gate straight to output, paid layers untouched. */}
        <path
          id="nnPBypass"
          d={bypassPath}
          className={cn("nn-edge nn-edge-bypass", bypassLive && "nn-edge-live-free")}
        />

        {active && inLive && !freeDone && (
          <circle r="2" className="nn-particle">
            <animateMotion dur="1.05s" repeatCount="indefinite">
              <mpath href="#nnPIn" />
            </animateMotion>
          </circle>
        )}

        {active &&
          reviewLive &&
          paidPaths.map((_, i) => (
            <circle key={`ppaid-${i}`} r="2" className="nn-particle">
              <animateMotion dur="1.15s" repeatCount="indefinite" begin={`${i * 0.18}s`}>
                <mpath href={`#nnPPaid${i}`} />
              </animateMotion>
            </circle>
          ))}

        {active && bypassLive && (
          <circle r="2.2" className="nn-particle nn-particle-free">
            <animateMotion dur="1.2s" repeatCount="indefinite">
              <mpath href="#nnPBypass" />
            </animateMotion>
          </circle>
        )}

        {/* input */}
        {active && step <= 1 && (
          <circle cx={X_IN} cy={Y_MID} r="6.5" className="nn-halo nn-halo-in" />
        )}
        <circle cx={X_IN} cy={Y_MID} r="6" className="nn-node nn-node-live" />

        {/* free draft layer */}
        <g style={{ ["--tint" as string]: FREE_LAYER.tint }}>
          {freeState === "pending" && active && (
            <circle cx={X_FREE} cy={Y_MID} r="7" className="nn-halo nn-halo-tint" />
          )}
          <circle
            cx={X_FREE}
            cy={Y_MID}
            r="7"
            className={cn("nn-node", `nn-node-${freeState}`)}
          />
        </g>

        {/* decision gate */}
        <g>
          {gateLive && active && (
            <circle cx={X_GATE} cy={Y_MID} r="6" className="nn-halo nn-halo-gate" />
          )}
          <rect
            x={X_GATE - 4.5}
            y={Y_MID - 4.5}
            width="9"
            height="9"
            rx="1.5"
            transform={`rotate(45 ${X_GATE} ${Y_MID})`}
            className={cn("nn-gate", gateLive && "nn-gate-live")}
          />
        </g>

        {/* paid review layers */}
        {PAID_LAYERS.map((layer, i) => {
          const state = stateOf(layer.id);
          return (
            <g key={layer.id} style={{ ["--tint" as string]: layer.tint }}>
              {state === "pending" && active && (
                <circle
                  cx={X_PAID}
                  cy={PAID_Y[i]}
                  r="6"
                  className="nn-halo nn-halo-tint"
                  style={{ animationDelay: `${i * 220}ms` }}
                />
              )}
              <circle
                cx={X_PAID}
                cy={PAID_Y[i]}
                r="6"
                className={cn("nn-node", `nn-node-${state}`)}
              />
            </g>
          );
        })}

        {/* output */}
        {outLive && active && (
          <circle cx={X_OUT} cy={Y_MID} r="6.5" className="nn-halo nn-halo-out" />
        )}
        <circle cx={X_OUT} cy={Y_MID} r="6" className={cn("nn-node", outLive && "nn-node-out")} />

        <text x={X_IN} y={VIEW.h - 3} className="nn-axis" textAnchor="start">
          INPUT
        </text>
        <text x={X_FREE} y={VIEW.h - 3} className="nn-axis" textAnchor="middle">
          FREE
        </text>
        <text x={X_PAID} y={VIEW.h - 3} className="nn-axis" textAnchor="middle">
          PAID
        </text>
        <text x={X_OUT} y={VIEW.h - 3} className="nn-axis" textAnchor="end">
          OUTPUT
        </text>
      </svg>

      <div className="nn-footer">
        <div className="nn-legend">
          {[FREE_LAYER, ...PAID_LAYERS].map((layer) => {
            const state = stateOf(layer.id);
            const paid = layer.id !== FREE_LAYER.id;
            return (
              <span
                key={layer.id}
                className={cn("nn-chip", `nn-chip-${state}`)}
                style={{ ["--tint" as string]: layer.tint }}
                title={
                  state === "skipped"
                    ? `${layer.label} was not called — no credits spent`
                    : state === "answered"
                      ? `${layer.label} answered`
                      : state === "failed"
                        ? `${layer.label} did not answer`
                        : `${layer.label} is working`
                }
              >
                <span className="nn-chip-dot" aria-hidden />
                {layer.label}
                <span className={cn("nn-tag", paid ? "nn-tag-paid" : "nn-tag-free")}>
                  {paid ? "paid" : "free"}
                </span>
              </span>
            );
          })}
        </div>
        <p className={cn("nn-caption", reviewed === false && "nn-caption-saved")}>{caption}</p>
      </div>
    </div>
  );
}
