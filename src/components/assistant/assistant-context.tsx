"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Person } from "@/types";

interface OpenAssistantOptions {
  autoStartVoice?: boolean;
}

interface AssistantContextValue {
  open: boolean;
  autoStartVoice: boolean;
  pendingAutoStart: boolean;
  voiceStartSignal: number;
  clearAutoStart: () => void;
  registerVoiceStarter: (starter: (() => Promise<void>) | null) => void;
  requestVoiceStart: () => void;
  openAssistant: (options?: OpenAssistantOptions) => void;
  closeAssistant: () => void;
}

const AssistantContext = createContext<AssistantContextValue | null>(null);

/** @deprecated Workspace assistant — kept for any legacy imports */
export type { Person };

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [autoStartVoice, setAutoStartVoice] = useState(false);
  const [voiceStartSignal, setVoiceStartSignal] = useState(0);
  const voiceStarterRef = useRef<(() => Promise<void>) | null>(null);

  const registerVoiceStarter = useCallback((starter: (() => Promise<void>) | null) => {
    voiceStarterRef.current = starter;
  }, []);

  const triggerVoiceStart = useCallback(() => {
    setAutoStartVoice(true);
    setVoiceStartSignal((current) => current + 1);
  }, []);

  const requestVoiceStart = useCallback(() => {
    setOpen(true);
    triggerVoiceStart();
  }, [triggerVoiceStart]);

  const openAssistant = useCallback(
    (options?: OpenAssistantOptions) => {
      const wantVoice = Boolean(options?.autoStartVoice);
      setOpen(true);
      if (wantVoice) {
        triggerVoiceStart();
      }
    },
    [triggerVoiceStart]
  );

  const closeAssistant = useCallback(() => {
    setOpen(false);
    setAutoStartVoice(false);
  }, []);

  const clearAutoStart = useCallback(() => {
    setAutoStartVoice(false);
  }, []);

  const value = useMemo(
    () => ({
      open,
      autoStartVoice,
      pendingAutoStart: autoStartVoice,
      voiceStartSignal,
      clearAutoStart,
      registerVoiceStarter,
      requestVoiceStart,
      openAssistant,
      closeAssistant,
    }),
    [
      open,
      autoStartVoice,
      voiceStartSignal,
      clearAutoStart,
      registerVoiceStarter,
      requestVoiceStart,
      openAssistant,
      closeAssistant,
    ]
  );

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useAssistant() {
  const context = useContext(AssistantContext);
  if (!context) {
    throw new Error("useAssistant must be used within AssistantProvider.");
  }
  return context;
}
