"use client";

import { Fragment, useMemo } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw, X } from "lucide-react";
import { AssistantMessageBody } from "@/components/assistant/assistant-message-body";
import type { TourStop } from "@/lib/answer-tour";
import { cn } from "@/lib/utils";

/**
 * The answer, played as a tour of the map — the story card.
 *
 * One sentence per stop, the words that name something on the map (and the
 * amounts) in gold, a bar per stop filling as it is read. Back, pause, next
 * and close. At the end: the whole answer, and a way to play it again.
 * While a question is being worked on, it says so in the same place, so the
 * eye never has to leave the map.
 */

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Splits a sentence into plain and gold parts: names on the map, and amounts. */
function useHighlighter(labels: string[]) {
  return useMemo(() => {
    const names = [...new Set(labels.map((label) => label.trim()).filter((label) => label.length >= 3))]
      .sort((a, b) => b.length - a.length)
      .map(escapeRegExp);
    const parts = [String.raw`\$[\d,]+(?:\.\d{2})?`, ...names.map((name) => `(?<![\\p{L}\\p{N}])${name}(?![\\p{L}\\p{N}])`)];
    const pattern = new RegExp(`(${parts.join("|")})`, "giu");
    return (text: string) =>
      text.split(pattern).map((piece, index) =>
        index % 2 === 1 ? (
          <mark key={index} className="bg-transparent font-semibold text-[#f3d9a4] [text-shadow:0_0_12px_rgba(217,178,111,0.5)]">
            {piece}
          </mark>
        ) : (
          <Fragment key={index}>{piece}</Fragment>
        )
      );
  }, [labels]);
}

const control =
  "flex h-7 w-7 items-center justify-center rounded-full text-[#e3e8eb]/70 hover:bg-[#e3e8eb]/10 hover:text-[#e3e8eb] disabled:opacity-30";

export function AnswerTourCard({
  stops,
  index,
  playing,
  run,
  reply,
  labels,
  thinking,
  className,
  onPrev,
  onNext,
  onTogglePlay,
  onReplay,
  onClose,
}: {
  stops: TourStop[];
  /** The stop on screen; stops.length means the tour has finished. */
  index: number;
  playing: boolean;
  /** Bumps whenever a stop starts (or restarts), so its bar fills from empty. */
  run: number;
  /** The whole answer, shown when the tour finishes. */
  reply: string;
  /** Names on the map, to light in the text. */
  labels: string[];
  /** A question in flight: what the assistant is doing, or null. */
  thinking: string | null;
  className?: string;
  onPrev: () => void;
  onNext: () => void;
  onTogglePlay: () => void;
  onReplay: () => void;
  onClose: () => void;
}) {
  const highlight = useHighlighter(labels);
  const done = index >= stops.length;
  const stop = done ? null : stops[index];

  return (
    <section
      aria-label="The answer, played on the map"
      className={cn("ws-panel pointer-events-auto rounded-2xl px-3.5 pb-3 pt-2.5 shadow-[0_18px_50px_rgba(0,0,0,0.55)]", className)}
      style={{ borderColor: "rgba(217, 178, 111, 0.35)" }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#e3e8eb]/55">
          {thinking ? "Getting the answer ready" : done ? "Whole answer" : `${index + 1} of ${stops.length}`}
        </p>
        {thinking ? null : (
          <div className="flex items-center gap-0.5">
            {done ? (
              <button type="button" className={control} onClick={onReplay} aria-label="Play the answer again">
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            ) : (
              <>
                <button type="button" className={control} onClick={onPrev} disabled={index === 0} aria-label="Previous stop">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button type="button" className={control} onClick={onTogglePlay} aria-label={playing ? "Pause" : "Play"}>
                  {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                </button>
                <button type="button" className={control} onClick={onNext} aria-label="Next stop">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </>
            )}
            <button type="button" className={control} onClick={onClose} aria-label="Close the answer">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      <div aria-live="polite" className="mt-1.5">
        {thinking ? (
          <div className="space-y-2 py-1">
            <p className="text-[13px] text-[#f3d9a4]">{thinking}…</p>
            <div className="ws-shimmer h-2 w-full rounded-full" />
            <div className="ws-shimmer h-2 w-2/3 rounded-full" />
          </div>
        ) : stop ? (
          <p key={`${index}`} className="ws-tour-line min-h-[2.8em] text-[14.5px] font-medium leading-snug text-[#e3e8eb] lg:text-[15.5px]">
            {highlight(stop.text)}
          </p>
        ) : (
          <div className="max-h-[34dvh] overflow-y-auto text-[13px] leading-relaxed text-[#e3e8eb]/88" data-lenis-prevent>
            <AssistantMessageBody content={reply} />
          </div>
        )}
      </div>

      {!thinking && stops.length > 1 ? (
        <div className="mt-2.5 flex gap-1" aria-hidden>
          {stops.map((item, i) => (
            <span key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-[#e3e8eb]/15">
              {i < index || done ? (
                <span className="block h-full w-full bg-[var(--ws-gold)]" />
              ) : i === index ? (
                <span
                  key={run}
                  className="ws-tour-fill block h-full bg-[var(--ws-gold)]"
                  style={{ animationDuration: `${item.ms}ms`, animationPlayState: playing ? "running" : "paused" }}
                />
              ) : null}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  );
}
