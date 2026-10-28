"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Mic, Radio } from "lucide-react";
import { AssistantWorkspace } from "@/components/assistant/workspace/assistant-workspace";
import { AssistantLiveOrb } from "@/components/assistant/assistant-live-orb";
import { AssistantWakeListener } from "@/components/assistant/assistant-wake-listener";
import { useAssistant } from "@/components/assistant/assistant-context";
import { ASSISTANT_MIC_READY_EVENT } from "@/lib/ai/assistant-wake";
import { ensureAudioUnlocked } from "@/lib/ai/audio-utils";
import { formatWakeHint } from "@/lib/ai/assistant-wake";
import {
  buildWakeNameEntries,
  DEFAULT_ASSISTANT_NAME,
  useAssistantPreferencesStore,
} from "@/store/assistant-preferences-store";
import { cn } from "@/lib/utils";

/**
 * Whether the button should step aside: true while the page is being scrolled
 * down (reading on), false the moment it is scrolled up a little, near the top,
 * or on a new page. It used to sit over the same spot on every page, on top of
 * amounts and buttons.
 */
function useTuckedWhileScrolling(): boolean {
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);
  // Remembered with the page it happened on, so a new page always starts with the button out.
  const [tuckedOn, setTuckedOn] = useState<string | null>(null);

  useEffect(() => {
    let last = window.scrollY;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY;
        // A few pixels of jitter is not a direction.
        if (Math.abs(y - last) < 8) return;
        const down = y > last;
        last = y;
        setTuckedOn(down && y > 80 ? pathRef.current : null);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, []);

  return tuckedOn === pathname;
}

export function AssistantFloatingButton() {
  const { open, openAssistant, autoStartVoice } = useAssistant();
  const tucked = useTuckedWhileScrolling();
  const namingCompleted = useAssistantPreferencesStore((state) => state.namingCompleted);
  const assistantName = useAssistantPreferencesStore((state) => state.assistantName);
  const wakeEnabled = useAssistantPreferencesStore((state) => state.wakeListeningEnabled);
  const [voiceLive, setVoiceLive] = useState(false);

  const displayName = assistantName.trim() || DEFAULT_ASSISTANT_NAME;
  const wakeEntries = useMemo(
    () => (namingCompleted ? buildWakeNameEntries() : []),
    [namingCompleted]
  );
  const canWakeByName = wakeEnabled && wakeEntries.length > 0;
  const wakePhrase = formatWakeHint(wakeEntries[0]?.name ?? displayName);

  // A closed panel cannot be live, whatever the last report said.
  const liveNow = open && voiceLive;

  return (
    <>
      <AssistantWakeListener paused={liveNow || autoStartVoice} />

      {!open ? (
      <div
        className="kg-fab fixed z-50 right-4 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] md:bottom-8 md:right-8 flex flex-col items-end gap-2.5 pointer-events-none"
        style={{ viewTransitionName: "kg-assistant" }}
        data-tucked={tucked && !liveNow}
      >
        {canWakeByName ? (
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new Event(ASSISTANT_MIC_READY_EVENT));
            }}
            className="pointer-events-auto hidden sm:inline-flex max-w-[min(calc(100vw-2rem),18rem)] items-center gap-1.5 rounded-full glass px-2.5 py-1 text-[10px] font-medium text-muted shadow-sm text-left"
          >
            <Radio className="h-3 w-3 shrink-0 text-positive" />
            <span className="leading-snug">Say &quot;{wakePhrase}&quot; to wake me</span>
          </button>
        ) : null}

        <div className="assistant-fab-wrap relative pointer-events-none">
          {liveNow ? (
            <div className="pointer-events-none absolute -top-14 left-1/2 -translate-x-1/2">
              <AssistantLiveOrb state="listening" size="sm" />
            </div>
          ) : null}
          <span className="assistant-fab-ring assistant-fab-ring-1" aria-hidden />
          <span className="assistant-fab-ring assistant-fab-ring-2" aria-hidden />

          <button
            type="button"
            onClick={() => {
              void ensureAudioUnlocked().finally(() => {
                window.dispatchEvent(new Event(ASSISTANT_MIC_READY_EVENT));
                openAssistant({ autoStartVoice: true });
              });
            }}
            className={cn(
              "assistant-fab-button pointer-events-auto relative flex items-center justify-center rounded-full",
              "bg-gradient-to-br from-accent to-indigo text-white",
              "shadow-xl shadow-accent/35 h-14 w-14 p-0",
              "sm:h-auto sm:w-auto sm:gap-2 sm:pl-4 sm:pr-5 sm:py-3.5",
              "hover:scale-[1.03] active:scale-[0.97] transition-transform"
            )}
            aria-label={`Open ${displayName}`}
          >
            <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/15">
              <Mic className="w-5 h-5" />
            </span>
            <span className="hidden sm:flex flex-col items-start leading-none">
              <span className="text-sm font-bold">{displayName}</span>
              <span className="text-[10px] font-medium text-white/80 mt-0.5">
                {canWakeByName ? `Say “${wakePhrase}”` : "Tap to talk"}
              </span>
            </span>
          </button>
        </div>
      </div>
      ) : null}

      {/* Keyed on open so every opening starts from a fresh workspace. */}
      <AssistantWorkspace key={open ? "open" : "closed"} open={open} onVoiceLiveChange={setVoiceLive} />
    </>
  );
}
