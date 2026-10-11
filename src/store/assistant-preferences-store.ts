"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";
import type { AssistantVoiceGender } from "@/lib/ai/assistant-voice";
import {
  DEFAULT_LEAD_DAYS,
  DEFAULT_SNOOZE_MINUTES,
  doneForThisCycle,
  dueLabel,
  newerReminder,
  nextDueDate,
  reminderFromLegacyLine,
  renderReminderLine,
  toIsoDate,
  toStamp,
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
  /** An alarm or pop-up handled: done for this ring, or snoozed for its snooze length. */
  handleRing: (id: string, outcome: "done" | "snooze", now?: Date) => void;
  setBehaviorInstructions: (instructions: string[]) => void;
  setReminders: (reminders: string[]) => void;
  setReminderData: (reminders: Reminder[]) => void;
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
        const next = [
          ...get().structuredReminders,
          { ...reminder, id: uuidv4(), updatedAt: new Date().toISOString() },
        ];
        set({ structuredReminders: next, reminders: next.map(renderReminderLine) });
        void get().syncToServer();
      },

      updateStructuredReminder: (id, updates) => {
        const next = get().structuredReminders.map((item) =>
          item.id === id ? { ...item, ...updates, updatedAt: new Date().toISOString() } : item
        );
        set({ structuredReminders: next, reminders: next.map(renderReminderLine) });
        void get().syncToServer();
      },

      handleRing: (id, outcome, now = new Date()) => {
        const target = get().structuredReminders.find((item) => item.id === id);
        if (!target) return;
        if (outcome === "snooze") {
          const minutes = target.snoozeMinutes ?? DEFAULT_SNOOZE_MINUTES;
          get().updateStructuredReminder(id, {
            snoozedUntil: toStamp(new Date(now.getTime() + minutes * 60_000)),
          });
          return;
        }
        // Done covers this ring and anything before it. A one-off is finished;
        // a repeating one waits for its next ring — later today, if it has one.
        if (target.repeat === "once") {
          get().updateStructuredReminder(id, { done: true, snoozedUntil: undefined });
          return;
        }
        get().updateStructuredReminder(id, { doneThrough: toStamp(now), snoozedUntil: undefined });
      },

      /**
       * Adopt the server's reminders as data. Each one this device also holds
       * is settled by `newerReminder`, so a Done tapped on a notification (made
       * on the server) lands here, and an edit made here is not undone by an
       * older copy. Ones it doesn't hold came from the other phone.
       */
      setReminderData: (incoming) => {
        const local = get().structuredReminders;
        const byId = new Map(local.map((item) => [item.id, item]));
        let changed = false;
        const next = local.map((mine) => {
          const theirs = incoming.find((item) => item.id === mine.id);
          if (!theirs) return mine;
          const merged = newerReminder(mine, theirs);
          if (merged !== mine) changed = true;
          return merged;
        });
        for (const theirs of incoming) {
          if (byId.has(theirs.id)) continue;
          next.push(theirs);
          changed = true;
        }
        if (changed) set({ structuredReminders: next, reminders: next.map(renderReminderLine) });
      },

      deleteStructuredReminder: (id) => {
        const next = get().structuredReminders.filter((item) => item.id !== id);
        set({ structuredReminders: next, reminders: next.map(renderReminderLine) });
        void get().syncToServer();
      },

      toggleReminderDone: (id) => {
        const target = get().structuredReminders.find((item) => item.id === id);
        if (!target) return;
        // As in markReminderDone: a recurring reminder is done for this cycle
        // only, and the tap again undoes that. Closing it outright (an old
        // `done` from before) is still reopened by the same tap.
        if (target.repeat !== "once" && !target.done) {
          if (doneForThisCycle(target)) {
            get().updateStructuredReminder(id, { doneThrough: undefined });
            return;
          }
          const due = nextDueDate(target);
          get().updateStructuredReminder(id, { doneThrough: toIsoDate(due ?? new Date()) });
          return;
        }
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

        // A snooze, and a cycle marked done, are the fields that may travel
        // onto a reminder this device already holds: small, dated,
        // self-expiring facts. "Not now" or "rent's paid" decided on one phone
        // should hold on the other. Done only ever moves forward.
        const incomingByText = new Map<string, { snoozedUntil?: string; doneThrough?: string }>();
        for (const line of reminders) {
          const parsed = reminderFromLegacyLine(line, "probe");
          incomingByText.set(core(parsed.text), parsed);
        }
        const withSnooze = existing.map((item) => {
          const incoming = incomingByText.get(core(item.text));
          if (!incoming) return item;
          const snoozedUntil = incoming.snoozedUntil ?? item.snoozedUntil;
          const doneThrough =
            incoming.doneThrough && (!item.doneThrough || incoming.doneThrough > item.doneThrough)
              ? incoming.doneThrough
              : item.doneThrough;
          if (snoozedUntil === item.snoozedUntil && doneThrough === item.doneThrough) return item;
          return { ...item, snoozedUntil, doneThrough };
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
            reminder_data?: Reminder[];
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

          // A server that already keeps reminders as data hands them over by
          // id. One still holding only sentences (ids it made up while
          // reading them, "legacy-…") goes through setReminders, which
          // matches on text so the schedules set here are not overwritten.
          const data = Array.isArray(prefs.reminder_data) ? prefs.reminder_data : [];
          const remoteIsLegacy = data.some((item) => item.id.startsWith("legacy-"));
          if (data.length > 0 && !remoteIsLegacy) {
            get().setReminderData(data);
          } else if (Array.isArray(prefs.reminders)) {
            get().setReminders(prefs.reminders);
          }

          // Push back when the server is behind: still on sentences, missing
          // one of ours, holding an older copy, or reading differently.
          // Derive fresh from the structured source rather than trusting the
          // persisted `reminders` array. A stale copy here is what pushed a
          // re-rendered (and therefore longer) line back to the server on every
          // load, growing "— remind 5 days before" one suffix at a time.
          const local = get().structuredReminders;
          const derived = local.map(renderReminderLine);
          const remote = prefs.reminders ?? [];
          const remoteById = new Map(data.map((item) => [item.id, item]));
          const drifted =
            remoteIsLegacy ||
            derived.length !== remote.length ||
            derived.some((line, index) => line !== remote[index]) ||
            local.some((item) => {
              const theirs = remoteById.get(item.id);
              return !theirs || (item.updatedAt ?? "") > (theirs.updatedAt ?? "");
            });
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
              reminder_data: state.structuredReminders,
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
