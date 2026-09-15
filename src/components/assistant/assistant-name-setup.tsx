"use client";

import { MEMBERS_LABEL } from "@/lib/branding";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import type { AssistantVoiceGender } from "@/lib/ai/assistant-voice";
import { getVoiceGenderLabel } from "@/lib/ai/assistant-voice";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassCard } from "@/components/ui/glass-card";
import { useAssistantPreferencesStore } from "@/store/assistant-preferences-store";
import { cn } from "@/lib/utils";

interface AssistantNameSetupProps {
  onComplete: () => void;
}

export function AssistantNameSetup({ onComplete }: AssistantNameSetupProps) {
  const setAssistantProfile = useAssistantPreferencesStore((state) => state.setAssistantProfile);
  const completeNamingWithDefault = useAssistantPreferencesStore(
    (state) => state.completeNamingWithDefault
  );
  const [name, setName] = useState("");
  const [voiceGender, setVoiceGender] = useState<AssistantVoiceGender>("female");
  const [step, setStep] = useState<"ask" | "name">("ask");

  function saveCustomName() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setAssistantProfile({ name: trimmed, voiceGender });
    onComplete();
  }

  function useDefaultName() {
    completeNamingWithDefault();
    onComplete();
  }

  return (
    <div className="flex flex-col items-center justify-center px-2 py-4 text-center">
      <GlassCard className="!p-4 w-full max-w-sm space-y-3">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#007aff]/10">
          <Sparkles className="h-6 w-6 text-[#007aff]" />
        </div>

        {step === "ask" ? (
          <>
            <div>
              <h3 className="text-lg font-bold tracking-tight">Meet your AI</h3>
              <p className="text-sm text-muted mt-2">
                One shared AI for {MEMBERS_LABEL} — talk naturally about spending, bills,
                reminders, and balances.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <GlassButton type="button" onClick={() => setStep("name")}>
                Pick a name
              </GlassButton>
              <GlassButton type="button" variant="ghost" onClick={useDefaultName}>
                Skip — use Jarvis
              </GlassButton>
            </div>
          </>
        ) : (
          <>
            <div>
              <h3 className="text-lg font-bold tracking-tight">Name &amp; voice</h3>
              <p className="text-sm text-muted mt-2">
                Wake with{" "}
                {name.trim()
                  ? `"Hey ${name.trim()}", "Hi ${name.trim()}", or "Hello ${name.trim()}"`
                  : '"Hey / Hi / Hello [name]"'}{" "}
                — both of
                you use the same AI.
              </p>
            </div>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  saveCustomName();
                }
              }}
              placeholder='e.g. "Jarvis", "GG", "Finny"'
              className="glass w-full rounded-2xl px-4 py-3 text-sm outline-none text-left"
              autoFocus
              maxLength={32}
            />
            <div className="grid grid-cols-2 gap-2">
              {(["male", "female"] as const).map((gender) => (
                <button
                  key={gender}
                  type="button"
                  onClick={() => setVoiceGender(gender)}
                  className={cn(
                    "rounded-2xl border px-3 py-2.5 text-xs font-semibold transition-colors",
                    voiceGender === gender
                      ? "border-[#007aff] bg-[#007aff]/10 text-[#007aff]"
                      : "border-black/10 dark:border-white/10 text-muted"
                  )}
                >
                  {getVoiceGenderLabel(gender)}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <GlassButton type="button" onClick={saveCustomName} disabled={!name.trim()}>
                Save
              </GlassButton>
              <GlassButton type="button" variant="ghost" onClick={() => setStep("ask")}>
                Back
              </GlassButton>
            </div>
          </>
        )}
      </GlassCard>
    </div>
  );
}
