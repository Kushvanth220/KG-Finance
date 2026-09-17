"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";
import type { AssistantVoiceGender } from "@/lib/ai/assistant-voice";
import {
  DEFAULT_LEAD_DAYS,
  dueLabel,
  nextDueDate,
  reminderFromLegacyLine,
  renderReminderLine,
  toIsoDate,
  type Reminder,
} from "@/lib/ai/reminders";
import { ASSISTANT_LANGUAGE } from "@/lib/ai/live-config";
import type { Person } from "@/types";

const STORAGE_KEY = "kg-finance-assistant-prefs-v1";
import { DEFAULT_ASSISTANT_NAME } from "@/lib/ai/assistant-name";

export { DEFAULT_ASSISTANT_NAME };
const DEFAULT_NAME = DEFAULT_ASSISTANT_NAME;

interface AssistantPreferencesState {
  assistantName: string;
  voiceGender: AssistantVoiceGender;
  namingCompleted: boolean;
  wakeListeningEnabled: boolean;
  language: typeof ASSISTANT_LANGUAGE;
  behaviorInstructions: string[];
  /**
   * Source of truth for reminders. `reminders` below is DERIVED from this —
   * the assistant reads sentences, the app edits structure.
   */
  structuredReminders: Reminder[];
  /** Derived sentences the assistant reads. Never edit directly. */
  reminders: string[];
  setAssistantProfile: (profile: { name: string; voiceGender: AssistantVoiceGender }) => void;
  setAssistantName: (name: string) => void;
  setVoiceGender: (voiceGender: AssistantVoiceGender) => void;
  completeNamingWithDefault: () => void;
  setWakeListeningEnabled: (enabled: boolean) => void;
  addBehaviorInstruction: (instruction: string) => void;
  addReminder: (reminder: string) => void;
  markReminderDone: (match: string) => string | null;
  addStructuredReminder: (reminder: Omit<Reminder, "id">) => void;
  updateStructuredReminder: (id: string, updates: Partial<Reminder>) => void;
  deleteStructuredReminder: (id: string) => void;
  toggleReminderDone: (id: string) => void;
  setBehaviorInstructions: (instructions: string[]) => void;
  setReminders: (reminders: string[]) => void;
  hydrateFromServer: () => Promise<void>;
  syncToServer: () => Promise<void>;
  getAssistantName: () => string;
  getVoiceGender: () => AssistantVoiceGender;
  hasCompletedNaming: () => boolean;
}

type LegacyState = {
  names?: Partial<Record<Person, string>>;
  voiceGenders?: Partial<Record<Person, AssistantVoiceGender>>;
  namingCompleted?: Partial<Record<Person, boolean>>;
  wakeListeningEnabled?: boolean;
  assistantName?: string;
  behaviorInstructions?: string[];
  reminders?: string[];
  structuredReminders?: Reminder[];
};

function migrateLegacy(state: LegacyState): Partial<AssistantPreferencesState> {
  if (state.assistantName && state.behaviorInstructions) {
    return {
      behaviorInstructions: state.behaviorInstructions,
      language: ASSISTANT_LANGUAGE,
    };
  }

  const pickName = (person: Person) => state.names?.[person]?.trim();
  const name = pickName("kushvanth") ?? pickName("g") ?? DEFAULT_NAME;
  return {
    assistantName: name,
    voiceGender: state.voiceGenders?.kushvanth ?? state.voiceGenders?.g ?? "female",
    namingCompleted: Boolean(
      state.namingCompleted?.kushvanth || state.namingCompleted?.g
    ),
    wakeListeningEnabled: state.wakeListeningEnabled ?? true,
    behaviorInstructions: state.behaviorInstructions ?? [],
    language: ASSISTANT_LANGUAGE,
  };
}

export const useAssistantPreferencesStore = create<AssistantPreferencesState>()(
  persist(
    (set, get) => ({
      assistantName: DEFAULT_NAME,
      voiceGender: "female",
      namingCompleted: false,
      wakeListeningEnabled: true,
      language: ASSISTANT_LANGUAGE,
      behaviorInstructions: [],
      structuredReminders: [],
      reminders: [],

      setAssistantProfile: (profile) => {
        const trimmed = profile.name.trim().slice(0, 32);
        if (!trimmed) return;
        set({
          assistantName: trimmed,
          voiceGender: profile.voiceGender,
          namingCompleted: true,
        });
        void get().syncToServer();
      },

      setAssistantName: (name) => {
        const trimmed = name.trim().slice(0, 32);
        if (!trimmed) return;
        set({ assistantName: trimmed, namingCompleted: true });
        void get().syncToServer();
      },

      setVoiceGender: (voiceGender) => {
        set({ voiceGender });
        void get().syncToServer();
      },

      completeNamingWithDefault: () => {
        set({ assistantName: DEFAULT_NAME, namingCompleted: true });
        void get().syncToServer();
      },

      setWakeListeningEnabled: (enabled) => {
        set({ wakeListeningEnabled: enabled });
        void get().syncToServer();
      },

      addBehaviorInstruction: (instruction) => {
        const line = instruction.trim().slice(0, 500);
        if (!line) return;
        const current = get().behaviorInstructions;
        if (current.includes(line)) return;
        set({ behaviorInstructions: [...current, line] });
        void get().syncToServer();
      },

      /**
       * The assistant's save_reminder still hands us a sentence. Keep the words
       * exactly as spoken — inferring a schedule out of prose would invent data
       * the user never gave — and let them add the dates on the Memory page.
       */
      addReminder: (reminder) => {
        const line = reminder.trim().slice(0, 500);
        if (!line) return;
        const current = get().structuredReminders;
        if (current.some((item) => item.text.toLowerCase() === line.toLowerCase())) return;
        get().addStructuredReminder({
          text: line,
          done: false,
          repeat: "once",
          leadDays: DEFAULT_LEAD_DAYS,
        });
      },

      markReminderDone: (match) => {
        const needle = match.trim().toLowerCase();
        if (!needle) return null;
        const current = get().structuredReminders;
        const target = current.find(
          (item) => !item.done && item.text.toLowerCase().includes(needle)
        );
        if (!target) return null;
        // A one-off is finished. A recurring one is only finished for this
        // cycle — closing it for good would silence the rent reminder forever
        // the first time the rent got paid.
        if (target.repeat === "once") {
          get().updateStructuredReminder(target.id, { done: true });
          return renderReminderLine({ ...target, done: true });
        }
        const due = nextDueDate(target);
        const doneThrough = due ? toIsoDate(due) : toIsoDate(new Date());
        get().updateStructuredReminder(target.id, { doneThrough });
        const next = { ...target, doneThrough };
        return `${renderReminderLine(next)} — done for this cycle, next ${dueLabel(
          next
        ).toLowerCase()}`;
      },

      addStructuredReminder: (reminder) => {
        const next = [...get().structuredReminders, { ...reminder, id: uuidv4() }];
        set({ structuredReminders: next, reminders: next.map(renderReminderLine) });
        void get().syncToServer();
      },

      updateStructuredReminder: (id, updates) => {
        const next = get().structuredReminders.map((item) =>
          item.id === id ? { ...item, ...updates } : item
        );
        set({ structuredReminders: next, reminders: next.map(renderReminderLine) });
        void get().syncToServer();
      },

      deleteStructuredReminder: (id) => {
        const next = get().structuredReminders.filter((item) => item.id !== id);
        set({ structuredReminders: next, reminders: next.map(renderReminderLine) });
        void get().syncToServer();
      },

      toggleReminderDone: (id) => {
        const target = get().structuredReminders.find((item) => item.id === id);
        if (!target) return;
        get().updateStructuredReminder(id, { done: !target.done });
      },

      setBehaviorInstructions: (instructions) => {
        set({ behaviorInstructions: instructions });
      },

      /**
       * Adopt a raw list (server hydration); anything genuinely new becomes
       * structured. Matching is on the reminder TEXT, not the rendered line —
       * rendering appends "due …" and "remind N days before", so comparing
       * whole lines matched nothing and re-adopted every reminder on each
       * hydration, multiplying the list on every page load.
       */
      setReminders: (reminders) => {
        const existing = get().structuredReminders;
        const core = (value: string) =>
          value.replace(/^\[DONE\]\s*/i, "").trim().toLowerCase();
        const known = existing.map((item) => core(item.text));

        // A snooze is the one field that may travel onto a reminder this
        // device already holds: it is a small, dated, self-expiring fact, and
        // "not now" decided on one phone should hold on the other.
        const snoozeByText = new Map<string, string | undefined>();
        for (const line of reminders) {
          const parsed = reminderFromLegacyLine(line, "probe");
          snoozeByText.set(core(parsed.text), parsed.snoozedUntil);
        }
        const withSnooze = existing.map((item) => {
          const incoming = snoozeByText.get(core(item.text));
          if (incoming === undefined || incoming === item.snoozedUntil) return item;
          return { ...item, snoozedUntil: incoming };
        });
        if (withSnooze.some((item, i) => item !== existing[i])) {
          set({ structuredReminders: withSnooze, reminders: withSnooze.map(renderReminderLine) });
        }

        const adopted = reminders
          .filter((line) => {
            const candidate = core(line);
            if (!candidate) return false;
            // A rendered line begins with its text, so accept a prefix match
            // in either direction rather than demanding an exact string.
            return !known.some(
              (text) =>
                text === candidate ||
                candidate.startsWith(text) ||
                text.startsWith(candidate)
            );
          })
          .map((line) => reminderFromLegacyLine(line, uuidv4()));

        if (adopted.length === 0) return;
        // Build on the snooze-refreshed list, or that refresh is lost here.
        const next = [...withSnooze, ...adopted];
        set({ structuredReminders: next, reminders: next.map(renderReminderLine) });
      },

      hydrateFromServer: async () => {
        try {
          const response = await fetch("/api/ai/preferences", { cache: "no-store" });
          const payload = await response.json();
          if (!payload.ok || !payload.preferences) return;

          const prefs = payload.preferences as {
            assistant_name?: string | null;
            voice_gender?: string | null;
            wake_listening_enabled?: boolean;
            behavior_instructions?: string[];
            reminders?: string[];
          };

          set((state) => ({
            assistantName: prefs.assistant_name?.trim() || state.assistantName,
            voiceGender:
              prefs.voice_gender === "male" || prefs.voice_gender === "female"
                ? prefs.voice_gender
                : state.voiceGender,
            wakeListeningEnabled: prefs.wake_listening_enabled ?? state.wakeListeningEnabled,
            behaviorInstructions: Array.isArray(prefs.behavior_instructions)
              ? prefs.behavior_instructions
              : state.behaviorInstructions,
            namingCompleted: state.namingCompleted || Boolean(prefs.assistant_name),
          }));

          // Reminders go through setReminders so anything the assistant saved
          // on another device is adopted as structured rather than overwriting
          // the schedules already set here.
          if (Array.isArray(prefs.reminders)) {
            get().setReminders(prefs.reminders);
          }

          // Push back when our derived lines differ from the server's. Without
          // this a device that migrated but never edited left the server on the
          // old strings, so the other phone kept reading stale reminders.
          // Derive fresh from the structured source rather than trusting the
          // persisted `reminders` array. A stale copy here is what pushed a
          // re-rendered (and therefore longer) line back to the server on every
          // load, growing "— remind 5 days before" one suffix at a time.
          const derived = get().structuredReminders.map(renderReminderLine);
          const remote = prefs.reminders ?? [];
          const drifted =
            derived.length !== remote.length ||
            derived.some((line, index) => line !== remote[index]);
          if (drifted) void get().syncToServer();
        } catch {
          // Supabase table may not exist yet — local prefs still work.
        }
      },

      syncToServer: async () => {
        const state = get();
        try {
          await fetch("/api/ai/preferences", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              assistant_name: state.assistantName,
              voice_gender: state.voiceGender,
              wake_listening_enabled: state.wakeListeningEnabled,
              language: state.language,
              behavior_instructions: state.behaviorInstructions,
              reminders: state.reminders,
            }),
          });
        } catch {
          // Offline or table not migrated — ignore.
        }
      },

      getAssistantName: () => get().assistantName.trim() || DEFAULT_NAME,
      getVoiceGender: () => get().voiceGender,
      hasCompletedNaming: () => get().namingCompleted,
    }),
    {
      name: STORAGE_KEY,
      version: 5,
      migrate: (persisted, version) => {
        const state = persisted as LegacyState & Partial<AssistantPreferencesState>;
        if (version < 4) {
          return { ...state, ...migrateLegacy(state), reminders: state.reminders ?? [] };
        }
        if (version < 5) {
          return { ...state, reminders: state.reminders ?? [] };
        }
        if (version < 6) {
          // Reminders became structured. Keep every existing sentence verbatim
          // as the text; schedules start empty because the old format never
          // recorded one, and guessing would fabricate due dates.
          const legacy = Array.isArray(state.reminders) ? state.reminders : [];
          const structured = legacy.map((line, index) =>
            reminderFromLegacyLine(line, `legacy-${index}-${line.slice(0, 12)}`)
          );
          return {
            ...state,
            structuredReminders: structured,
            reminders: structured.map(renderReminderLine),
          } as AssistantPreferencesState;
        }
        return state as AssistantPreferencesState;
      },
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // `reminders` is a projection of `structuredReminders`, but both were
        // written to storage. Recompute on load so an old or hand-edited copy
        // can never be mistaken for the truth.
        state.reminders = state.structuredReminders.map(renderReminderLine);
      },
    }
  )
);

export function getWakeAssistantName(): string | null {
  const state = useAssistantPreferencesStore.getState();
  if (!state.namingCompleted) return null;
  const name = state.assistantName.trim();
  if (!name || name.toLowerCase() === "assistant") return null;
  return name;
}

export function buildWakeNameEntries(): Array<{ person: Person; name: string }> {
  const name = getWakeAssistantName();
  if (!name) return [];
  return [{ person: "kushvanth", name }];
}

export function getBehaviorInstructionsForAssistant(): string[] {
  return useAssistantPreferencesStore.getState().behaviorInstructions;
}

export function getRemindersForAssistant(): string[] {
  return useAssistantPreferencesStore.getState().reminders;
}

/** Structured reminders, for anything that needs real dates (briefing, UI). */
export function getStructuredReminders(): Reminder[] {
  return useAssistantPreferencesStore.getState().structuredReminders;
}

/** The assistant's display name — the chosen one, or the default while unnamed. */
export function useAssistantName(): string {
  const name = useAssistantPreferencesStore((state) => state.assistantName);
  return name.trim() || DEFAULT_ASSISTANT_NAME;
}
