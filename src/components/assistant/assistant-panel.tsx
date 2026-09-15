"use client";


import { useEffect, useRef, useState } from "react";
import { MessageSquareText, Mic, Pencil, X } from "lucide-react";
import { AiChatPanel } from "@/components/assistant/ai-chat-panel";
import { AiVoicePanel } from "@/components/assistant/ai-voice-panel";
import { AssistantLiveOrb } from "@/components/assistant/assistant-live-orb";
import { AssistantNameSetup } from "@/components/assistant/assistant-name-setup";
import { useAssistant } from "@/components/assistant/assistant-context";
import { formatWakeHint } from "@/lib/ai/assistant-wake";
import { getVoiceGenderLabel } from "@/lib/ai/assistant-voice";
import { useAssistantPreferencesStore } from "@/store/assistant-preferences-store";
import { AiProviderTeam } from "@/components/assistant/ai-provider-team";
import { cn } from "@/lib/utils";

type AssistantMode = "voice" | "text";

interface AssistantPanelProps {
  open: boolean;
  onVoiceLiveChange?: (live: boolean) => void;
}

export function AssistantPanel({ open, onVoiceLiveChange }: AssistantPanelProps) {
  const { closeAssistant, autoStartVoice, clearAutoStart } = useAssistant();
  const [mode, setMode] = useState<AssistantMode>("voice");
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [voiceBusy, setVoiceBusy] = useState(false);
  const assistantName = useAssistantPreferencesStore((state) => state.assistantName);
  const voiceGender = useAssistantPreferencesStore((state) => state.voiceGender);
  const namingCompleted = useAssistantPreferencesStore((state) => state.namingCompleted);
  const setAssistantName = useAssistantPreferencesStore((state) => state.setAssistantName);
  const setVoiceGender = useAssistantPreferencesStore((state) => state.setVoiceGender);
  const dialogRef = useRef<HTMLDivElement>(null);
  const wakeEnabled = useAssistantPreferencesStore((state) => state.wakeListeningEnabled);
  const setWakeListeningEnabled = useAssistantPreferencesStore(
    (state) => state.setWakeListeningEnabled
  );

  const displayName = assistantName.trim() || "Jarvis";
  const needsNaming = !namingCompleted;
  const wakePhrase = formatWakeHint(displayName);

  useEffect(() => {
    // The parent remounts this panel on every open, so state is fresh here
    // and "voice" is already the mode; nothing to reset.
    if (!open) return;
    void useAssistantPreferencesStore.getState().hydrateFromServer();
    window.setTimeout(() => dialogRef.current?.focus(), 0);

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (event.defaultPrevented) return;
      event.preventDefault();
      closeAssistant();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, autoStartVoice, closeAssistant]);

  if (!open) return null;

  const liveDock = !needsNaming && mode === "voice" && voiceBusy;

  function handleNamingComplete() {
    if (autoStartVoice) {
      setMode("voice");
    }
  }

  function saveRename() {
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    setAssistantName(trimmed);
    setRenaming(false);
  }

  return (
    <div
      className={cn(
        "fixed z-[80] flex justify-center",
        liveDock
          // pointer-events-none so a live call does not swallow every click on
          // the site behind it — the dock itself re-enables them. It also docks
          // to a corner instead of covering the screen, so the page stays usable
          // while you talk.
          ? "inset-x-0 bottom-0 pointer-events-none items-end justify-center p-3 sm:inset-y-0 sm:left-auto sm:right-0 sm:items-center sm:justify-end sm:p-5"
          : "inset-0 items-end sm:items-center p-3 sm:p-4"
      )}
    >
      {liveDock ? null : (
        <div
          className="absolute inset-0 bg-black/45 backdrop-blur-sm animate-fade-in-up"
          onClick={closeAssistant}
          aria-hidden
        />
      )}

      <div
        className={cn(
          "relative w-full max-w-lg overflow-hidden outline-none pointer-events-auto flex flex-col shadow-2xl shadow-[#007aff]/10",
          liveDock
            ? "assistant-call w-full max-w-md rounded-3xl max-h-[min(62dvh,460px)] sm:w-[23rem] sm:max-w-none sm:max-h-[min(78dvh,560px)]"
            : "glass-strong rounded-3xl max-h-[min(92dvh,820px)] animate-scale-in"
        )}
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal={!liveDock}
        aria-label={`${displayName} AI`}
      >
        <div className="px-4 pt-4 pb-3 border-b border-black/5 dark:border-white/10 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {voiceBusy && mode === "voice" ? (
                  <AssistantLiveOrb state="listening" size="xs" className="!w-auto shrink-0" />
                ) : (
                  <span className="assistant-live-dot" aria-hidden />
                )}
                <h2 className="text-lg font-bold tracking-tight truncate">{displayName}</h2>
                {!needsNaming ? (
                  <button
                    type="button"
                    onClick={() => {
                      setRenameValue(displayName);
                      setRenaming((current) => !current);
                    }}
                    className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-muted"
                    aria-label="Rename AI"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                ) : null}
              </div>
              <p className="text-[11px] text-muted mt-0.5">
                {liveDock
                  ? "Website stays open — keep talking"
                  : "One AI for both of you"}
              </p>
              {liveDock ? null : (
                <div className="mt-2">
                  <AiProviderTeam voiceLive={mode === "voice" && voiceBusy} />
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {!needsNaming ? (
                mode === "voice" ? (
                  <button
                    type="button"
                    onClick={() => setMode("text")}
                    className="inline-flex items-center gap-1 rounded-full border border-black/10 dark:border-white/10 px-2.5 py-1.5 text-[10px] font-semibold text-muted hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
                  >
                    <MessageSquareText className="w-3 h-3" />
                    Text
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setMode("voice")}
                    className="inline-flex items-center gap-1 rounded-full bg-[#007aff] text-white px-2.5 py-1.5 text-[10px] font-semibold shadow-md shadow-[#007aff]/25"
                  >
                    <Mic className="w-3 h-3" />
                    Voice
                  </button>
                )
              ) : null}
              <button
                type="button"
                onClick={closeAssistant}
                className="p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                aria-label="Close AI"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {renaming ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  className="glass flex-1 rounded-xl px-3 py-2 text-sm outline-none"
                  maxLength={32}
                />
                <button
                  type="button"
                  onClick={saveRename}
                  className="rounded-xl bg-[#007aff] text-white px-3 py-2 text-xs font-semibold"
                >
                  Save
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(["male", "female"] as const).map((gender) => (
                  <button
                    key={gender}
                    type="button"
                    onClick={() => setVoiceGender(gender)}
                    className={cn(
                      "rounded-xl border px-2 py-1.5 text-[10px] font-semibold",
                      voiceGender === gender
                        ? "border-[#007aff] bg-[#007aff]/10 text-[#007aff]"
                        : "border-black/10 dark:border-white/10 text-muted"
                    )}
                  >
                    {getVoiceGenderLabel(gender)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div
          className={cn(
            "flex-1 min-h-0 px-4 py-3",
            // Voice fills the panel and scrolls inside the transcript;
            // text chat keeps scrolling as a single block.
            !needsNaming && mode === "voice"
              ? "flex flex-col"
              : "overflow-y-auto"
          )}
        >
          {needsNaming ? (
            <AssistantNameSetup onComplete={handleNamingComplete} />
          ) : mode === "voice" ? (
            <AiVoicePanel
              assistantName={displayName}
              voiceGender={voiceGender}
              autoStart={autoStartVoice}
              onAutoStartHandled={clearAutoStart}
              onLiveChange={(busy) => {
                setVoiceBusy(busy);
                onVoiceLiveChange?.(busy);
              }}
            />
          ) : (
            <AiChatPanel assistantName={displayName} embedded />
          )}
        </div>

        {!needsNaming && !(mode === "voice" && voiceBusy) ? (
          <div className="px-4 pb-3 pt-1 border-t border-black/5 dark:border-white/10 space-y-2">
            <p className="text-[10px] text-muted">
              {mode === "voice"
                ? "Say yes or tap Yes, save. It will say the expenses are recorded."
                : `${displayName} answers in text. Money changes still wait for a yes.`}
            </p>
            <label className="flex items-center gap-2 text-[10px] text-muted cursor-pointer">
              <input
                type="checkbox"
                checked={wakeEnabled}
                onChange={(event) => setWakeListeningEnabled(event.target.checked)}
                className="rounded border-black/20"
              />
              Listen for &quot;{wakePhrase}&quot; in the background
            </label>
          </div>
        ) : null}
      </div>
    </div>
  );
}
