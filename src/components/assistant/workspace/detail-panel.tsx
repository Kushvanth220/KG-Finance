"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ArrowDownRight, ArrowUpRight, ChevronRight, Sparkles } from "lucide-react";
import { AssistantMessageBody } from "@/components/assistant/assistant-message-body";
import { formatPercent } from "@/lib/formatters";
import type { GraphHub, GraphLeaf, Tone } from "@/lib/assistant-graph";
import { HUB_ICON, STAGE_TEXT, TONE_COLOR, type WorkspaceActivity } from "@/components/assistant/workspace/workspace-state";
import { cn } from "@/lib/utils";

/**
 * The right-hand panel: what the chosen hub or node is, in numbers and in
 * the assistant's words.
 *
 * Kicker and title, a status line with the way to its page, the headline
 * figure against last month with a dot-matrix chart under it, four tiles,
 * and the AI analysis — the assistant's latest answer when it was about
 * this, otherwise a button that asks for one.
 */

const TONE_TEXT: Record<Tone, string> = {
  good: "On track",
  warn: "Worth a look",
  bad: "Needs attention",
  neutral: "Steady",
};

/**
 * Columns of dots, one column per point in the series, filled from the
 * bottom by its share of the largest. The newest column and the largest are
 * lit gold, the rest stay quiet — the reference's sentiment strip.
 */
export function DotMatrix({ series, label }: { series: number[]; label: string }) {
  const columns = series.length > 40 ? series.filter((_, index) => index % Math.ceil(series.length / 40) === 0) : series;
  const rows = 9;
  const max = Math.max(...columns, 0);
  const peak = columns.indexOf(max);
  const lastWithValue = columns.reduce((found, value, index) => (value > 0 ? index : found), -1);
  const gap = 6;
  const width = Math.max(columns.length * gap, gap);
  return (
    <figure className="min-w-0">
      <svg
        viewBox={`0 0 ${width} ${rows * gap}`}
        className="h-12 w-full"
        preserveAspectRatio="xMaxYMid meet"
        role="img"
        aria-label={`${label}: highest ${max.toLocaleString("en-US")}`}
      >
        {columns.map((value, col) => {
          const filled = max > 0 && value > 0 ? Math.max(1, Math.round((value / max) * rows)) : 0;
          const hot = col === peak || col === lastWithValue;
          return Array.from({ length: rows }, (_, row) => {
            const on = rows - row <= filled;
            return (
              <circle
                key={`${col}-${row}`}
                cx={col * gap + gap / 2}
                cy={row * gap + gap / 2}
                r={on ? 1.45 : 0.9}
                fill={on ? (hot ? "#f3d9a4" : "#9ca3a3") : "rgba(156,163,163,0.22)"}
              />
            );
          });
        })}
      </svg>
      <figcaption className="mt-1 text-right text-[9px] uppercase tracking-wide text-[#e3e8eb]/40">{label}</figcaption>
    </figure>
  );
}

function Badge({ text, tone }: { text: string; tone: Tone }) {
  return (
    <span
      className="inline-flex items-center rounded-md border px-1.5 py-[1px] text-[10px] font-semibold"
      style={{ color: TONE_COLOR[tone], borderColor: `color-mix(in srgb, ${TONE_COLOR[tone]} 45%, transparent)` }}
    >
      {text}
    </span>
  );
}

export function DetailPanel({
  hub,
  leaf,
  activity,
  assistantName,
  onAsk,
  onLeave,
}: {
  hub: GraphHub;
  leaf: GraphLeaf | null;
  activity: WorkspaceActivity;
  assistantName: string;
  onAsk: (prompt: string) => void;
  /** Called when a link takes the person to a page. */
  onLeave: () => void;
}) {
  const Icon = HUB_ICON[hub.key];
  const share = leaf && hub.headline > 0 ? (leaf.value / hub.headline) * 100 : null;
  const about = leaf ? activity.litLeaves.includes(leaf.id) : activity.activeHubs.includes(hub.key);
  const thinking = activity.phase === "thinking";
  const analysisRef = useRef<HTMLDivElement>(null);

  // When an answer about this lands, bring it into view — on a phone the
  // analysis sits below the fold of a short panel.
  useEffect(() => {
    if (about && activity.lastReply) analysisRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [about, activity.lastReply]);
  const badge = leaf ? { text: TONE_TEXT[leaf.tone], tone: leaf.tone } : hub.badge;
  const href = leaf?.href ?? hub.href;
  const tiles = leaf
    ? [
        { label: "Amount", value: leaf.valueText },
        { label: `Share of ${hub.label.toLowerCase()}`, value: share !== null ? formatPercent(share) : "—" },
        { label: "Status", value: leaf.meterText ?? TONE_TEXT[leaf.tone] },
        { label: "Detail", value: leaf.note ?? hub.caption },
      ]
    : hub.stats;

  return (
    <div className="space-y-3">
      <div>
        <p className="flex items-center gap-2 text-[13px] font-medium text-[var(--ws-gold)]">
          <Icon className="h-4 w-4" /> {hub.label}
        </p>
        <h2 className="mt-2 text-[22px] font-medium leading-tight tracking-[-0.01em] text-[#e3e8eb] sm:text-[26px]">
          {leaf ? leaf.label : hub.label}
        </h2>
        <p className="mt-0.5 text-[12px] text-[#e3e8eb]/55">{leaf ? leaf.note ?? hub.caption : hub.caption}</p>
      </div>

      <div className="ws-tile flex items-center justify-between gap-3 rounded-xl px-3 py-2.5">
        <div className="min-w-0 space-y-1">
          {badge ? <Badge text={badge.text} tone={badge.tone} /> : null}
          <p className="text-[12px] leading-snug text-[#e3e8eb]/65">{leaf ? leaf.meterText ?? leaf.note ?? hub.caption : hub.caption}</p>
        </div>
        <Link
          href={href}
          onClick={onLeave}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#e3e8eb]/8 px-3 py-2 text-[12px] font-medium text-[#e3e8eb] hover:bg-[#e3e8eb]/14"
        >
          Explore details <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div
        className="relative overflow-hidden rounded-xl border border-[var(--ws-edge)] px-3.5 py-3"
        style={{ background: "radial-gradient(120% 140% at 0% 100%, rgba(217,120,80,0.16), transparent 60%), rgba(8,14,13,0.7)" }}
      >
        <div className="flex items-start justify-between gap-2">
          <p className="text-[13px] text-[#e3e8eb]/85">{leaf ? `${hub.label} · ${leaf.note ?? ""}` : hub.caption}</p>
          {leaf?.meterText ? <Badge text={leaf.meterText} tone={leaf.tone} /> : hub.badge ? <Badge text={hub.badge.text} tone={hub.badge.tone} /> : null}
        </div>
        <div className="mt-1 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[34px] font-light leading-none tabular-nums tracking-[-0.02em] sm:text-[40px]">
              {leaf ? leaf.valueText : hub.headlineText}
            </p>
            {!leaf && hub.delta ? (
              <p className="mt-1 inline-flex items-center gap-1 text-[11px]" style={{ color: TONE_COLOR[hub.delta.tone] }}>
                {hub.delta.text.startsWith("-") ? <ArrowDownRight className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                {hub.delta.text}
              </p>
            ) : share !== null ? (
              <p className="mt-1 text-[11px] text-[#e3e8eb]/55">{formatPercent(share)} of {hub.label.toLowerCase()}</p>
            ) : null}
          </div>
          <div className="w-[52%] max-w-[220px]">
            <DotMatrix series={hub.series} label={hub.seriesLabel} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {tiles.map((tile) => (
          <div key={tile.label} className="ws-tile rounded-xl px-3 py-2.5">
            <p className="truncate text-[20px] font-light tabular-nums leading-tight text-[#e3e8eb]">{tile.value}</p>
            <p className="mt-0.5 text-[11px] text-[#e3e8eb]/55">{tile.label}</p>
          </div>
        ))}
      </div>

      <div ref={analysisRef}>
        <p className="flex items-center gap-2 text-[13px] font-medium text-[#e3e8eb]">
          <Sparkles className="h-4 w-4 text-[var(--ws-gold)]" /> AI analysis
        </p>
        <div className="ws-tile mt-2 rounded-xl px-3 py-2.5">
          {thinking && (about || activity.activeHubs.length === 0) ? (
            <div className="space-y-2" aria-live="polite">
              <p className="text-[12px] font-medium text-[#f3d9a4]">
                {activity.stage ? STAGE_TEXT[activity.stage] : "Thinking"}…
              </p>
              <div className="ws-shimmer h-2 w-full rounded-full" />
              <div className="ws-shimmer h-2 w-3/4 rounded-full" />
            </div>
          ) : about && activity.lastReply ? (
            <div className="max-h-56 overflow-y-auto text-[13px] leading-relaxed text-[#e3e8eb]/85" data-lenis-prevent>
              <AssistantMessageBody content={activity.lastReply} />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onAsk(leaf?.prompt ?? hub.prompt)}
              disabled={thinking}
              className={cn(
                "flex w-full items-center justify-between gap-2 text-left text-[12px] text-[#e3e8eb]/75 hover:text-[#e3e8eb] disabled:opacity-50"
              )}
            >
              <span>
                Ask {assistantName} to look at {leaf ? leaf.label : hub.label.toLowerCase()} — what stands out and what to do.
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-[var(--ws-gold)]" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
