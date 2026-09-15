"use client";

import { useEffect, useMemo, useState } from "react";
import { Mic, Radio } from "lucide-react";
import { AssistantPanel } from "@/components/assistant/assistant-panel";
import { AssistantLiveOrb } from "@/components/assistant/assistant-live-orb";
import { AssistantWakeListener } from "@/components/assistant/assistant-wake-listener";
import { useAssistant } from "@/components/assistant/assistant-context";
import { ASSISTANT_MIC_READY_EVENT } from "@/lib/ai/assistant-wake";
import { ensureAudioUnlocked } from "@/lib/ai/audio-utils";
import { formatWakeHint } from "@/lib/ai/assistant-wake";
import {
  buildWakeNameEntries,
  useAssistantPreferencesStore,
} from "@/store/assistant-preferences-store";
import { cn } from "@/lib/utils";

export function AssistantFloatingButton() {
  const { open, openAssistant, autoStartVoice } = useAssistant();
  const namingCompleted = useAssistantPreferencesStore((state) => state.namingCompleted);
  const assistantName = useAssistantPreferencesStore((state) => state.assistantName);
  const wakeEnabled = useAssistantPreferencesStore((state) => state.wakeListeningEnabled);
  const [voiceLive, setVoiceLive] = useState(false);

  const displayName = assistantName.trim() || "Jarvis";
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
      <div className="fixed z-50 right-4 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] md:bottom-8 md:right-8 flex flex-col items-end gap-2.5 pointer-events-none">
        {canWakeByName ? (
          <button
            type="button"
            onClick={() => {
              window.dispatchEvent(new Event(ASSISTANT_MIC_READY_EVENT));
            }}
            className="pointer-events-auto hidden sm:inline-flex max-w-[min(calc(100vw-2rem),18rem)] items-center gap-1.5 rounded-full glass px-2.5 py-1 text-[10px] font-medium text-muted shadow-sm text-left"
          >
            <Radio className="h-3 w-3 shrink-0 text-[#34c759]" />
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
              "bg-gradient-to-br from-[#007aff] to-[#5856d6] text-white",
              "shadow-xl shadow-[#007aff]/35 h-14 w-14 p-0",
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

      {/* Keyed on open so every opening starts from a fresh panel state. */}
      <AssistantPanel key={open ? "open" : "closed"} open={open} onVoiceLiveChange={setVoiceLive} />
    </>
  );
}
