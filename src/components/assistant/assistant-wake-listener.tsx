"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ASSISTANT_MIC_READY_EVENT,
  buildRecognitionTranscript,
  resolveWakePerson,
} from "@/lib/ai/assistant-wake";
import { ensureAudioUnlocked } from "@/lib/ai/audio-utils";
import { useAssistant } from "@/components/assistant/assistant-context";
import {
  buildWakeNameEntries,
  useAssistantPreferencesStore,
} from "@/store/assistant-preferences-store";

interface SpeechRecognitionAlternative {
  transcript: string;
}

interface SpeechRecognitionResult {
  0: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const scope = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

function collectTranscriptCandidates(results: SpeechRecognitionResultList): string[] {
  const candidates: string[] = [];

  for (let index = 0; index < results.length; index += 1) {
    const line = results[index]?.[0]?.transcript?.trim();
    if (line) candidates.push(line);
  }

  const full = buildRecognitionTranscript(results);
  if (full) candidates.push(full);

  const tailStart = Math.max(0, results.length - 4);
  for (let start = tailStart; start < results.length; start += 1) {
    const parts: string[] = [];
    for (let index = start; index < results.length; index += 1) {
      const line = results[index]?.[0]?.transcript?.trim();
      if (line) parts.push(line);
    }
    if (parts.length > 0) {
      candidates.push(parts.join(" "));
    }
  }

  return [...new Set(candidates)];
}

async function requestMicPermission(): Promise<boolean> {
  if (!navigator.mediaDevices?.getUserMedia) return false;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    stream.getTracks().forEach((track) => track.stop());
    return true;
  } catch {
    return false;
  }
}

interface AssistantWakeListenerProps {
  paused: boolean;
}

export function AssistantWakeListener({ paused }: AssistantWakeListenerProps) {
  const { open, openAssistant } = useAssistant();
  const wakeEnabled = useAssistantPreferencesStore((state) => state.wakeListeningEnabled);
  const namingCompleted = useAssistantPreferencesStore((state) => state.namingCompleted);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const wakeHandlingRef = useRef(false);
  const lastWakeAtRef = useRef(0);
  const lastWakePhraseRef = useRef("");
  const [micReady, setMicReady] = useState(false);

  const wakeEntries = useMemo(
    () => (namingCompleted ? buildWakeNameEntries() : []),
    [namingCompleted]
  );

  const primeMic = useCallback(async () => {
    await ensureAudioUnlocked();
    const granted = await requestMicPermission();
    if (granted) {
      setMicReady(true);
    }
    return granted;
  }, []);

  useEffect(() => {
    if (!open) {
      wakeHandlingRef.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (paused) {
      wakeHandlingRef.current = false;
    }
  }, [paused]);

  useEffect(() => {
    if (!wakeEnabled || paused || wakeEntries.length === 0) return;

    let cancelled = false;

    // primeMic can set state on its failure path, so it is kicked off from a
    // task of its own rather than synchronously inside this effect.
    const kick = window.setTimeout(() => {
      void primeMic().then((granted) => {
        if (!cancelled && granted) {
          setMicReady(true);
        }
      });
    }, 0);

    const onMicReady = () => {
      void primeMic();
    };

    window.addEventListener(ASSISTANT_MIC_READY_EVENT, onMicReady);
    return () => {
      cancelled = true;
      window.clearTimeout(kick);
      window.removeEventListener(ASSISTANT_MIC_READY_EVENT, onMicReady);
    };
  }, [wakeEnabled, paused, wakeEntries.length, primeMic]);

  useEffect(() => {
    const SpeechRecognition = getSpeechRecognition();
    // A primed mic only counts while listening is allowed at all.
    if (
      !SpeechRecognition ||
      !wakeEnabled ||
      !micReady ||
      paused ||
      wakeEntries.length === 0
    ) {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      return;
    }

    let disposed = false;
    let restartTimer: ReturnType<typeof setTimeout> | null = null;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognitionRef.current = recognition;

    const scheduleRestart = (delayMs = 400) => {
      if (disposed || wakeHandlingRef.current || paused) return;
      if (restartTimer) clearTimeout(restartTimer);
      restartTimer = setTimeout(() => {
        restartTimer = null;
        if (disposed || recognitionRef.current !== recognition || wakeHandlingRef.current || paused) {
          return;
        }
        try {
          recognition.start();
        } catch {
          // Mic busy — retry shortly.
          scheduleRestart(900);
        }
      }, delayMs);
    };

    const tryWake = (transcript: string) => {
      if (wakeHandlingRef.current || paused || !transcript.trim()) return false;

      const person = resolveWakePerson(transcript, wakeEntries);
      if (!person) return false;

      const now = Date.now();
      const phraseKey = `${person}:${transcript.toLowerCase().trim()}`;
      if (now - lastWakeAtRef.current < 2500 && lastWakePhraseRef.current === phraseKey) {
        return false;
      }

      lastWakeAtRef.current = now;
      lastWakePhraseRef.current = phraseKey;
      wakeHandlingRef.current = true;

      try {
        recognition.stop();
      } catch {
        recognition.abort();
      }

      window.setTimeout(() => {
        void ensureAudioUnlocked().finally(() => {
          openAssistant({ autoStartVoice: true });
          window.setTimeout(() => {
            wakeHandlingRef.current = false;
          }, 12000);
        });
      }, 80);

      return true;
    };

    recognition.onresult = (event) => {
      const candidates = collectTranscriptCandidates(event.results);
      for (const transcript of candidates) {
        if (tryWake(transcript)) return;
      }
    };

    recognition.onend = () => {
      if (!disposed && !wakeHandlingRef.current && !paused) {
        scheduleRestart();
      }
    };

    recognition.onerror = (event) => {
      if (event.error === "aborted") return;

      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setMicReady(false);
        return;
      }

      if (event.error === "audio-capture") {
        setMicReady(false);
        void primeMic();
        return;
      }

      scheduleRestart(event.error === "network" ? 1200 : 500);
    };

    try {
      recognition.start();
    } catch {
      scheduleRestart(900);
    }

    return () => {
      disposed = true;
      if (restartTimer) clearTimeout(restartTimer);
      recognition.onresult = null;
      recognition.onend = null;
      recognition.onerror = null;
      try {
        recognition.abort();
      } catch {
        // ignore
      }
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }
    };
  }, [wakeEnabled, micReady, paused, openAssistant, wakeEntries, primeMic]);

  return null;
}
