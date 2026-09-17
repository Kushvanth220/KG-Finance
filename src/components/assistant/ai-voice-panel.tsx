"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Mic, MicOff, Trash2 } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import {
  AssistantLiveOrb,
  type AssistantLiveOrbState,
} from "@/components/assistant/assistant-live-orb";
import { VoicePipeline } from "@/components/assistant/voice-pipeline";
import type { LiveVoiceConnection } from "@/lib/ai/gemini-live-client";
import {
  connectLiveVoiceWithRetry,
  executeLiveToolCallsSafely,
  fetchLiveTokenPayload,
} from "@/lib/ai/live-voice-session";
import {
  ensureAudioUnlocked,
  getCaptureAudioContext,
  getPlaybackAudioContext,
  LiveAudioPlayer,
  requestLiveMicStream,
  startMicStreamer,
  type MicStreamer,
} from "@/lib/ai/audio-utils";
import { executeAssistantTools } from "@/lib/ai/execute-assistant-tool";
import { asProposedWrite, buildToolConfirmationPreview, isWriteTool, writeNeedsSpeaker, spokenSaveConfirmation, EXPENSE_PERSON_CHIPS, EXPENSE_PAID_BY_CHIPS, withExpensePerson, withPaidBy, accountChoicePrompt, withPickedAccount, writeToolNeedsAccount, expenseWriteNeedsPayer, sortAccountChips } from "@/lib/ai/assistant-confirmation";
import {
  asksIfMoneyWasSaved,
  inferWriteFromRecentTalk,
  isShortAffirmation,
  looksLikeExpenseCorrection,
  mergePendingWrite,
  withInferredAccount,
  applySpeakerToWrite,
} from "@/lib/ai/infer-write-intent";
import type { AssistantToolCall } from "@/lib/ai/tools";
import { getClientFinancePayload } from "@/lib/ai/client-finance-context";
import { getBehaviorInstructionsForAssistant, getRemindersForAssistant } from "@/store/assistant-preferences-store";
import { getRulesForAssistant } from "@/store/rules-store";
import { describeRule } from "@/lib/rules/engine";
import type { AssistantVoiceGender } from "@/lib/ai/assistant-voice";
import type { Person } from "@/types";
import { PERSON_LABELS } from "@/types";
import {
  askWhoIsSpeakingPrompt,
  inferSpeakerFromUtterance,
  speakingWithConfirmedPrompt,
  SPEAKER_CHIPS,
} from "@/lib/ai/person";
import {
  createLiveTranscriptSession,
  ENGLISH_ONLY_REPLY,
  type LiveTranscriptSession,
  type VoiceTranscriptLine,
} from "@/lib/ai/live-transcript";
import { formatChatWhen } from "@/lib/ai/chat-time";
import { useAssistant } from "@/components/assistant/assistant-context";
import { useFinanceStore } from "@/store/finance-store";
import { DEFAULT_ASSISTANT_NAME } from "@/lib/ai/assistant-name";

const DEFAULT_CHAT_USER: Person = "kushvanth";
const BARGE_IN_LEVEL = 0.38;
const BARGE_IN_CHUNKS = 3;
const ECHO_HOLD_MS = 320;

type AccountChip = { id: string; name: string };

function allAccountChips(): AccountChip[] {
  const seen = new Set<string>();
  const chips: AccountChip[] = [];
  for (const account of useFinanceStore.getState().accounts) {
    const key = account.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    chips.push({ id: account.id, name: account.name });
  }
  return sortAccountChips(chips).slice(0, 8);
}

function allDebitChips(): AccountChip[] {
  const seen = new Set<string>();
  const chips: AccountChip[] = [];
  for (const account of useFinanceStore.getState().accounts) {
    if (account.type !== "debit") continue;
    const key = account.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    chips.push({ id: account.id, name: account.name });
  }
  return sortAccountChips(chips).slice(0, 8);
}

function chipsFromToolAccounts(accounts: unknown, debitOnly = false): AccountChip[] {
  if (!Array.isArray(accounts)) return debitOnly ? allDebitChips() : allAccountChips();
  const listed = accounts
    .filter((item): item is { id?: string; name?: string; type?: string } => !!item && typeof item === "object")
    .filter((item) => item.id && item.name && (!debitOnly || item.type === "debit"))
    .map((item) => ({ id: String(item.id), name: String(item.name) }));
  return sortAccountChips(listed.length > 0 ? listed : debitOnly ? allDebitChips() : allAccountChips()).slice(0, 8);
}

function allCategoryChips(): AccountChip[] {
  return useFinanceStore
    .getState()
    .spendCategories.filter((category) => category.name.trim())
    .slice(0, 8)
    .map((category) => ({ id: category.id, name: category.name }));
}

const VOICE_STEPS = [
  `First say who you are — or tap ${PERSON_LABELS.kushvanth} / ${PERSON_LABELS.g}.`,
  "Talk like a person — it asks one thing at a time.",
  "Say the amount, then the account (Green Dot, cash, Chime).",
  "Say yes — or tap Yes, save. It will tell you the expenses are recorded.",
] as const;

type VoiceLine = VoiceTranscriptLine;

interface AiVoicePanelProps {
  assistantName?: string;
  voiceGender?: AssistantVoiceGender;
  autoStart?: boolean;
  onAutoStartHandled?: () => void;
  onLiveChange?: (busy: boolean) => void;
}

function resolveOrbState(options: {
  status: "idle" | "connecting" | "live" | "error";
  awaitingConfirmation: boolean;
  outputLevel: number;
  toolBusy: boolean;
}): AssistantLiveOrbState {
  if (options.status === "connecting") return "connecting";
  if (options.status !== "live") return "idle";
  if (options.awaitingConfirmation || options.toolBusy) return "thinking";
  if (options.outputLevel > 0.04) return "speaking";
  return "listening";
}

function orbCaption(
  state: AssistantLiveOrbState,
  assistantName: string,
  liveHint: string
): string {
  if (state === "connecting") return "Connecting…";
  if (state === "thinking") return "Working on that…";
  if (state === "speaking") return `${assistantName} is speaking`;
  if (state === "listening") return "Listening…";
  if (liveHint && liveHint !== "Tap Start voice to talk with your AI.") {
    return liveHint;
  }
  return `Tap Start voice to talk with ${assistantName}`;
}

export function AiVoicePanel({
  assistantName = DEFAULT_ASSISTANT_NAME,
  voiceGender = "female",
  autoStart = false,
  onAutoStartHandled,
  onLiveChange,
}: AiVoicePanelProps) {
  const { voiceStartSignal, registerVoiceStarter, clearAutoStart } = useAssistant();
  const [status, setStatus] = useState<"idle" | "connecting" | "live" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<VoiceLine[]>([]);
  const [liveHint, setLiveHint] = useState("Tap Start voice to talk with your AI.");
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [lastSavedBanner, setLastSavedBanner] = useState<string | null>(null);
  const [accountChoices, setAccountChoices] = useState<AccountChip[]>([]);
  const [accountChoiceKind, setAccountChoiceKind] = useState<"pay-from" | "cash-source">("pay-from");
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);
  const [toolBusy, setToolBusy] = useState(false);
  const [hasUsedVoice, setHasUsedVoice] = useState(false);
  const [speaker, setSpeaker] = useState<Person | null>(null);

  const connectionRef = useRef<LiveVoiceConnection | null>(null);
  const micRef = useRef<MicStreamer | null>(null);
  const playerRef = useRef<LiveAudioPlayer | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const startVoiceRef = useRef<(() => Promise<void>) | null>(null);
  const sessionLockRef = useRef(false);
  const startGenerationRef = useRef(0);
  const greetedRef = useRef(false);
  const handledVoiceSignalRef = useRef("");
  const pendingWriteRef = useRef<AssistantToolCall | null>(null);
  // Render reads the mirror; handlers keep using the ref. Both move together.
  const [pendingWriteState, setPendingWriteState] = useState<AssistantToolCall | null>(null);
  const setPendingWrite = useCallback((next: AssistantToolCall | null) => {
    pendingWriteRef.current = next;
    setPendingWriteState(next);
  }, []);
  const chatSessionIdRef = useRef<string | null>(null);
  const persistLineRef = useRef<(line: VoiceLine) => void>(() => {});
  const confirmVoiceWriteRef = useRef<(text: string, options?: { immediate?: boolean }) => void>(
    () => {}
  );
  const saveTimerRef = useRef<number | null>(null);
  const recentlyAffirmedRef = useRef(false);
  /**
   * Mirrors `pendingPreview` into a ref. The transcript handler runs on a stale
   * closure, so it cannot read the state — but it MUST know whether the user has
   * actually been shown the write they are about to confirm. A spoken "yes" is
   * only consent for something that was on screen when they said it.
   */
  const previewShownRef = useRef<string | null>(null);

  /**
   * Identity of the write the user actually said yes to. The pending write keeps
   * being re-inferred from later speech, so a "yes" for $40 must not silently
   * complete a save that has since become $4,000.
   */
  const affirmedWriteRef = useRef<string | null>(null);
  const lastSavedRef = useRef<{ key: string; at: number } | null>(null);
  const lastPersistedRef = useRef("");
  const speakerRef = useRef<Person | null>(null);

  const showWritePreview = useCallback((value: string | null) => {
    previewShownRef.current = value;
    setPendingPreview(value);
  }, []);
  // Built once on mount rather than during render: its callbacks read other
  // refs, and render is the one place a ref must not be read.
  const transcriptSessionRef = useRef<LiveTranscriptSession | null>(null);
  useEffect(() => {
    transcriptSessionRef.current = createLiveTranscriptSession(setLines, (line) => {
      persistLineRef.current(line);
      if (line.role === "user") confirmVoiceWriteRef.current(line.text);
    });
  }, []);

  function writeKey(call: AssistantToolCall) {
    return `${call.name}:${String(call.args.amount ?? call.args.new_balance ?? "")}:${String(call.args.account_name ?? "")}:${String(call.args.expense_for ?? "")}:${String(call.args.paid_by ?? "")}`;
  }

  useEffect(() => {
    persistLineRef.current = (line) => {
      if (!line.text.trim()) return;
      if (line.text === ENGLISH_ONLY_REPLY) return;
      const persistKey = `${line.role}:${line.text}`;
      if (lastPersistedRef.current === persistKey) return;
      lastPersistedRef.current = persistKey;
      const title = `Voice · ${new Date().toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
      })}`;
      void (async () => {
        try {
          const response = await fetch("/api/ai/history", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user_id: DEFAULT_CHAT_USER,
              session_id: chatSessionIdRef.current,
              title,
              role: line.role,
              content: line.text,
            }),
          });
          const payload = await response.json();
          if (payload.ok && payload.session_id) {
            chatSessionIdRef.current = payload.session_id as string;
          }
        } catch {
          // Keep the live call going even if history save fails.
        }
      })();
    };

    confirmVoiceWriteRef.current = (text, options) => {
      const identified = inferSpeakerFromUtterance(text, {
        awaitingIdentity: !speakerRef.current,
      });
      if (identified) {
        speakerRef.current = identified;
        setSpeaker(identified);
        if (pendingWriteRef.current) {
          setPendingWrite(applySpeakerToWrite(
            pendingWriteRef.current,
            identified
          ));
        }
        playerRef.current?.interrupt();
        connectionRef.current?.sendGreeting(speakingWithConfirmedPrompt(identified));
        setLiveHint(`Talking to ${PERSON_LABELS[identified]}`);
      }

      const speaker = speakerRef.current;
      const transcript = transcriptSessionRef.current?.getLines() ?? [];
      const recentUser = transcript
        .filter((line) => line.role === "user")
        .slice(-8)
        .map((line) => line.text);
      const recentModel = transcript
        .filter((line) => line.role === "model")
        .slice(-3)
        .map((line) => line.text);
      const inferred = inferWriteFromRecentTalk(recentUser, recentModel, speaker);
      if (inferred && isWriteTool(inferred.name)) {
        setPendingWrite(mergePendingWrite(pendingWriteRef.current, inferred));
      }
      const withAccount = withInferredAccount(pendingWriteRef.current, text);
      if (withAccount) {
        setPendingWrite(withAccount);
      }
      const merged = pendingWriteRef.current
        ? applySpeakerToWrite(pendingWriteRef.current, speaker)
        : pendingWriteRef.current;
      if (merged) setPendingWrite(merged);
      if (merged && isWriteTool(merged.name)) {
        if (expenseWriteNeedsPayer(merged)) {
          showWritePreview(buildToolConfirmationPreview(merged));
          setAwaitingConfirmation(true);
          setLiveHint(`Who paid — ${PERSON_LABELS.kushvanth}, ${PERSON_LABELS.g}, or both?`);
        } else if (writeToolNeedsAccount(merged)) {
          setAccountChoiceKind("pay-from");
          setAccountChoices(allAccountChips());
          showWritePreview(buildToolConfirmationPreview(merged));
          setAwaitingConfirmation(false);
          setLiveHint("Which account should I use?");
        } else {
          showWritePreview(buildToolConfirmationPreview(merged));
          setAwaitingConfirmation(true);
        }
      }

      if (looksLikeExpenseCorrection(text) && !identified) {
        if (saveTimerRef.current) {
          window.clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }
        recentlyAffirmedRef.current = false;
        affirmedWriteRef.current = null;
        const pending = pendingWriteRef.current;
        if (pending?.name === "record_expense") {
          showWritePreview(buildToolConfirmationPreview(pending));
          setAwaitingConfirmation(true);
          setLiveHint(
            expenseWriteNeedsPayer(pending)
              ? `Who paid — ${PERSON_LABELS.kushvanth}, ${PERSON_LABELS.g}, or both?`
              : buildToolConfirmationPreview(pending)
          );
        }
        return;
      }

      // Asking "did you save it?" must never CAUSE a save — it only reports.
      if (asksIfMoneyWasSaved(text) && !isShortAffirmation(text)) {
        const settled = lastSavedRef.current;
        const recentlySaved = Boolean(settled && Date.now() - settled.at < 45000);
        playerRef.current?.interrupt();
        connectionRef.current?.sendGreeting(
          `App result (do not call tools): ${JSON.stringify({
            ok: recentlySaved,
            saved: recentlySaved,
          })}. ${
            recentlySaved
              ? "Say that it was recorded, in one short English sentence."
              : 'Say: "It was not recorded." Then ask them to confirm the amount, who paid, and the account.'
          } Do not save anything.`
        );
        return;
      }

      // Consent requires that the exact write was on screen when they agreed.
      // Without this a bare "yes" — or, previously, merely saying your own name —
      // committed a write the user had never been shown.
      const previewShown = Boolean(previewShownRef.current);
      const writeIdentity = merged ? `${merged.name}:${String(merged.args.amount ?? "")}` : null;
      const shouldSave = isShortAffirmation(text) && previewShown;
      if (shouldSave) {
        recentlyAffirmedRef.current = true;
        affirmedWriteRef.current = writeIdentity;
      }
      const accountAnswerCompletesSave =
        Boolean(withAccount && merged && !writeToolNeedsAccount(merged) && !expenseWriteNeedsPayer(merged)) &&
        recentlyAffirmedRef.current &&
        previewShown &&
        // Same tool, same amount as the one they agreed to — nothing else.
        affirmedWriteRef.current === writeIdentity &&
        !shouldSave;
      if (!shouldSave && !accountAnswerCompletesSave) return;

      const runSave = () => {
        const actor = speakerRef.current;
        if (!actor) {
          setLiveHint(`Who am I talking to — ${PERSON_LABELS.kushvanth} or ${PERSON_LABELS.g}?`);
          playerRef.current?.interrupt();
          connectionRef.current?.sendGreeting(
            `App result (do not call tools): ${JSON.stringify({
              ok: false,
              needs_speaker: true,
              saved: false,
            })}. Ask who you are talking to — ${PERSON_LABELS.kushvanth} or ${PERSON_LABELS.g} — in one short English sentence. Do not say it was recorded.`
          );
          return;
        }
        // Only the write that was previewed and agreed to — never `inferred`,
        // which may have been re-derived from speech since the preview.
        const pending = pendingWriteRef.current;
        const prepared = pending ? applySpeakerToWrite(pending, actor) : null;
        const call = prepared
          ? { ...prepared, args: { ...prepared.args, user_confirmed: true } }
          : null;
        if (!call || !isWriteTool(call.name)) {
          if (asksIfMoneyWasSaved(text)) {
            setLiveHint("Not saved yet — tell me the expense again.");
            playerRef.current?.interrupt();
            connectionRef.current?.sendGreeting(
              `App result (do not call tools): ${JSON.stringify({
                ok: false,
                saved: false,
              })}. Say: "It was not recorded." Then ask them to confirm the amount, who paid, and the account. Do not say it was recorded.`
            );
          }
          return;
        }
        if (expenseWriteNeedsPayer(call)) {
          showWritePreview(buildToolConfirmationPreview(call));
          setAwaitingConfirmation(true);
          setLiveHint(`Who paid — ${PERSON_LABELS.kushvanth}, ${PERSON_LABELS.g}, or both?`);
          playerRef.current?.interrupt();
          connectionRef.current?.sendGreeting(
            `App result (do not call tools): ${JSON.stringify({
              ok: false,
              needs_payer: true,
              saved: false,
            })}. Ask who paid — ${PERSON_LABELS.kushvanth}, ${PERSON_LABELS.g}, or both — in one short English sentence. Do not say it was recorded.`
          );
          return;
        }
        if (writeToolNeedsAccount(call)) {
          setLiveHint("Which account should I use?");
          setAccountChoiceKind("pay-from");
          setAccountChoices(allAccountChips());
          playerRef.current?.interrupt();
          connectionRef.current?.sendGreeting(
            `App result (do not call tools): ${JSON.stringify({
              ok: false,
              needs_account: true,
              saved: false,
            })}. Ask which account in one short English sentence. Do not say it was recorded.`
          );
          return;
        }

        const key = writeKey(call);
        const last = lastSavedRef.current;
        if (last && last.key === key && Date.now() - last.at < 45000) {
          if (asksIfMoneyWasSaved(text)) {
            playerRef.current?.interrupt();
            connectionRef.current?.sendGreeting(
              `App result (do not call tools): ${JSON.stringify({
                ok: true,
                saved: true,
                already: true,
              })}. Say exactly: "${spokenSaveConfirmation(call)}" Then stop.`
            );
          }
          return;
        }

        setPendingWrite(call);
        setToolBusy(true);
        const [result] = executeAssistantTools(actor, [call]);
        setToolBusy(false);

        const saved = result?.result?.saved === true;
        if (saved) {
          setPendingWrite(null);
          recentlyAffirmedRef.current = false;
        affirmedWriteRef.current = null;
          setAwaitingConfirmation(false);
          showWritePreview(null);
          setAccountChoices([]);
          lastSavedRef.current = { key, at: Date.now() };
          const spoken = spokenSaveConfirmation(call);
          setLastSavedBanner(spoken);
          setLiveHint(spoken);
          window.setTimeout(() => setLastSavedBanner(null), 8000);
        } else if (result?.result?.needs_payer === true) {
          if (pendingWriteRef.current) {
            showWritePreview(buildToolConfirmationPreview(pendingWriteRef.current));
          }
          setAwaitingConfirmation(true);
          setLiveHint(`Who paid — ${PERSON_LABELS.kushvanth}, ${PERSON_LABELS.g}, or both?`);
        } else if (result?.result?.needs_cash_source === true) {
          setAccountChoiceKind("cash-source");
          setAccountChoices(chipsFromToolAccounts(result.result.accounts, true));
          setAwaitingConfirmation(false);
          setLiveHint("Cash wallet is low — which account did the cash come from?");
        } else if (result?.result?.needs_account === true) {
          setAccountChoiceKind("pay-from");
          setAccountChoices(chipsFromToolAccounts(result.result.accounts));
          setAwaitingConfirmation(false);
          setLiveHint("Which account should I use?");
        } else {
          setLiveHint(String(result?.result?.error ?? "Need one more detail."));
        }

        playerRef.current?.interrupt();
        const summary = JSON.stringify(result?.result ?? { ok: false, saved: false });
        const spoken = saved ? spokenSaveConfirmation(call) : null;
        connectionRef.current?.sendGreeting(
          saved
            ? `App result (do not call tools): ${summary}. Say exactly: "${spoken}" Then stop. Do not ask a follow-up.`
            : `App result (do not call tools): ${summary}. Ask for the missing detail in one short English sentence. Do not say it was recorded.`
        );
      };

      if (options?.immediate) {
        runSave();
        return;
      }
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        runSave();
      }, 850);
    };
  }, [showWritePreview]);

  const orbState = useMemo(
    () =>
      resolveOrbState({
        status,
        awaitingConfirmation,
        outputLevel,
        toolBusy,
      }),
    [status, awaitingConfirmation, outputLevel, toolBusy]
  );

  const orbLabel = useMemo(
    () => orbCaption(orbState, assistantName, liveHint),
    [orbState, assistantName, liveHint]
  );

  const resetTranscripts = useCallback(() => {
    transcriptSessionRef.current?.reset();
  }, []);

  const cleanupVoiceSession = useCallback(() => {
    micRef.current?.stop();
    micRef.current = null;
    connectionRef.current?.close();
    connectionRef.current = null;
    playerRef.current?.stop();
    playerRef.current = null;
    resetTranscripts();
  }, [resetTranscripts]);

  const stopVoice = useCallback(async () => {
    startGenerationRef.current += 1;
    sessionLockRef.current = false;
    greetedRef.current = false;
    setPendingWrite(null);
    speakerRef.current = null;
    setSpeaker(null);
    cleanupVoiceSession();
    setAwaitingConfirmation(false);
    showWritePreview(null);
    setLastSavedBanner(null);
    setAccountChoices([]);
    setToolBusy(false);
    setInputLevel(0);
    setOutputLevel(0);
    setStatus("idle");
    setLiveHint("Voice session ended.");
  }, [cleanupVoiceSession, showWritePreview]);

  const startVoice = useCallback(async () => {
    const startId = ++startGenerationRef.current;
    sessionLockRef.current = true;
    greetedRef.current = false;
    speakerRef.current = null;
    setSpeaker(null);

    cleanupVoiceSession();

    setError(null);
    setAwaitingConfirmation(false);
    setToolBusy(false);
    setInputLevel(0);
    setOutputLevel(0);
    setStatus("connecting");
    setLiveHint("Connecting…");
    setLines([]);

    let micOwned = false;
    const micStreamPromise = requestLiveMicStream();
    const dropUnusedMic = () => {
      if (micOwned) return;
      void micStreamPromise.then(
        (stream) => stream.getTracks().forEach((track) => track.stop()),
        () => undefined
      );
    };

    try {
      const playbackContext = getPlaybackAudioContext();
      const captureContext = getCaptureAudioContext();
      void playbackContext.resume();
      void captureContext.resume();

      setLiveHint("Loading your accounts…");
      const financePromise = getClientFinancePayload(DEFAULT_CHAT_USER);
      const audioPromise = ensureAudioUnlocked();
      const financeState = await financePromise;
      const behaviorInstructions = getBehaviorInstructionsForAssistant();
      const reminders = getRemindersForAssistant();
      // Voice needs the rule book too. Without it a live session answered
      // "I don't see any rules linked to Flex" about a rule that plainly
      // exists, then tried to create a duplicate of it.
      const rules = getRulesForAssistant().map(
        (rule) => `${rule.name} (${rule.scope}): ${describeRule(rule)}`
      );
      if (startId !== startGenerationRef.current) {
        dropUnusedMic();
        return;
      }

      setLiveHint("Starting live voice…");
      const tokenPromise = fetchLiveTokenPayload({
        assistant_name: assistantName,
        voice_gender: voiceGender,
        finance_state: financeState,
        behavior_instructions: behaviorInstructions,
        reminders,
        rules,
      });

      setLiveHint("Unlocking microphone…");
      await audioPromise;
      if (startId !== startGenerationRef.current) {
        dropUnusedMic();
        return;
      }

      const player = new LiveAudioPlayer({
        audioContext: playbackContext,
        onLevel: setOutputLevel,
      });
      playerRef.current = player;
      let heardModelAudio = false;
      const tokenPayload = await tokenPromise;
      if (startId !== startGenerationRef.current) {
        dropUnusedMic();
        return;
      }

      const connection = await connectLiveVoiceWithRetry({
        ephemeralToken: tokenPayload.token,
        model: tokenPayload.model,
        assistantName,
        voiceGender,
        callbacks: {
          onOpen: () => {
            if (startId !== startGenerationRef.current) return;
            setStatus("live");
            setHasUsedVoice(true);
            setLiveHint(`${assistantName} is listening — speak naturally.`);
          },
          onClose: (reason) => {
            if (startId !== startGenerationRef.current) return;
            sessionLockRef.current = false;
            setAwaitingConfirmation(false);
            setToolBusy(false);
            if (connectionRef.current) {
              setStatus("idle");
              setLiveHint(reason ? `Session ended: ${reason}` : "Session ended.");
            }
          },
          onError: (message, fatal) => {
            if (startId !== startGenerationRef.current) return;
            if (fatal) {
              setError(message);
              setStatus("error");
              void stopVoice();
              return;
            }
            setLiveHint("Brief connection hiccup — still listening.");
          },
          onInputTranscription: (event) => {
            transcriptSessionRef.current?.addUserFragment(event.text, {
              finished: event.finished,
              interim: event.interim,
            });
          },
          onOutputTranscription: (event) => {
            transcriptSessionRef.current?.addModelFragment(event.text, event.finished);
          },
          onTurnComplete: () => {
            transcriptSessionRef.current?.onTurnComplete();
          },
          onInterrupted: () => {
            // Do not dump the speaker queue here. Echo / leftover mic often
            // marks the model as interrupted before any speech is audible.
            transcriptSessionRef.current?.onInterrupted();
          },
          onModelAudio: (base64Pcm) => {
            if (startId !== startGenerationRef.current) return;
            heardModelAudio = true;
            player.enqueueBase64Pcm(base64Pcm);
          },
          onToolCall: async (toolCall) => {
            if (startId !== startGenerationRef.current) return;
            setToolBusy(true);
            // asProposedWrite: the model may hand back user_confirmed on its
            // own. Consent has to come from the person, so strip it and let the
            // preview + spoken yes below be the only way a write is committed.
            const calls = (toolCall.functionCalls ?? []).map((call, index) =>
              asProposedWrite({
                id: call.id ?? `${call.name ?? "tool"}-${index}`,
                name: call.name ?? "unknown",
                args: call.args ?? {},
              })
            );
            if (calls.length === 0) {
              setToolBusy(false);
              return;
            }

            const actor = speakerRef.current;
            const writeCalls = calls.filter((item) => writeNeedsSpeaker(item.name));
            if (writeCalls.length > 0 && !actor) {
              const writeCall = writeCalls[0]!;
              const mergedWrite = mergePendingWrite(pendingWriteRef.current, writeCall);
              setPendingWrite(mergedWrite);
              showWritePreview(buildToolConfirmationPreview(mergedWrite));
              setAwaitingConfirmation(true);
              setLiveHint(`Who am I talking to — ${PERSON_LABELS.kushvanth} or ${PERSON_LABELS.g}?`);
              setToolBusy(false);
              connectionRef.current?.sendToolResponse(
                calls.map((call) => ({
                  id: call.id,
                  name: call.name,
                  response: isWriteTool(call.name)
                    ? {
                        ok: false,
                        needs_speaker: true,
                        saved: false,
                        error: `Who am I talking to — ${PERSON_LABELS.kushvanth} or ${PERSON_LABELS.g}?`,
                      }
                    : { ok: true },
                }))
              );
              return;
            }
            const prepared = calls.map((call) =>
              isWriteTool(call.name) && actor ? applySpeakerToWrite(call, actor) : call
            );

            const results = await executeLiveToolCallsSafely(() =>
              executeAssistantTools(actor ?? DEFAULT_CHAT_USER, prepared)
            );

            const writeCall = prepared.find((item) => isWriteTool(item.name));
            const pending = results.some(
              (result) =>
                result.response?.status === "needs_confirmation" ||
                result.response?.needs_account === true ||
                result.response?.needs_cash_source === true ||
                result.response?.needs_payer === true
            );
            if (writeCall && !results.some((result) => result.response?.saved === true)) {
              const fromTalk = pendingWriteRef.current;
              const merged = applySpeakerToWrite(
                fromTalk ? mergePendingWrite(writeCall, fromTalk) : writeCall,
                actor
              );
              setPendingWrite(merged);
              showWritePreview(buildToolConfirmationPreview(merged));
            }
            const accountNeed = results.find((result) => result.response?.needs_account === true);
            const cashSourceNeed = results.find(
              (result) => result.response?.needs_cash_source === true
            );
            const payerNeed = results.find((result) => result.response?.needs_payer === true);
            if (cashSourceNeed) {
              setAccountChoiceKind("cash-source");
              setAccountChoices(chipsFromToolAccounts(cashSourceNeed.response?.accounts, true));
              setAwaitingConfirmation(false);
            } else if (accountNeed) {
              setAccountChoiceKind("pay-from");
              setAccountChoices(chipsFromToolAccounts(accountNeed.response?.accounts));
              setAwaitingConfirmation(false);
            }
            const failed = results.some((result) => result.response?.ok === false);
            const savedMoney = results.some(
              (result) => isWriteTool(result.name) && result.response?.saved === true
            );
            const savedNote = results.some(
              (result) =>
                result.response?.saved === true &&
                (result.name === "save_reminder" ||
                  result.name === "save_behavior_preference" ||
                  result.name === "mark_reminder_done")
            );
            if (savedMoney && writeCall) {
              lastSavedRef.current = { key: writeKey(writeCall), at: Date.now() };
              setPendingWrite(null);
              showWritePreview(null);
              setAccountChoices([]);
              setAwaitingConfirmation(false);
              const spoken = spokenSaveConfirmation(writeCall);
              setLastSavedBanner(spoken);
              setLiveHint(spoken);
              window.setTimeout(() => setLastSavedBanner(null), 8000);
            }

            if (pending && !savedMoney && !accountNeed && !cashSourceNeed) {
              if (pendingWriteRef.current) {
                showWritePreview(buildToolConfirmationPreview(pendingWriteRef.current));
              }
              setAwaitingConfirmation(true);
              setLiveHint(
                payerNeed ||
                  (pendingWriteRef.current
                    ? expenseWriteNeedsPayer(pendingWriteRef.current)
                    : false)
                  ? `Who paid — ${PERSON_LABELS.kushvanth}, ${PERSON_LABELS.g}, or both?`
                  : 'Say "yes" to save, or "no" to change it.'
              );
            } else if (cashSourceNeed && !savedMoney) {
              setLiveHint("Cash wallet is low — tap where the cash came from, then say yes.");
            } else if (accountNeed && !savedMoney) {
              setLiveHint("Tap an account, then say yes.");
            } else if (failed && !savedMoney) {
              setAwaitingConfirmation(false);
              setLiveHint("Need one more detail — check what I asked.");
            } else if (savedNote) {
              setAwaitingConfirmation(false);
              setLiveHint("Saved — still listening.");
              window.setTimeout(() => {
                setLiveHint(`${assistantName} is listening — speak naturally.`);
              }, 2000);
            } else if (savedMoney) {
              setLiveHint(spokenSaveConfirmation(writeCall!));
            } else {
              setAwaitingConfirmation(false);
              setLiveHint("Done — still listening.");
              window.setTimeout(() => {
                setLiveHint(`${assistantName} is listening — speak naturally.`);
              }, 2000);
            }

            setToolBusy(false);
            if (startId === startGenerationRef.current) {
              connectionRef.current?.sendToolResponse(results);
            }
          },
        },
      });

      if (startId !== startGenerationRef.current) {
        dropUnusedMic();
        connection.close();
        player.stop();
        return;
      }

      connectionRef.current = connection;

      let micStream: MediaStream | null = null;
      try {
        micStream = await micStreamPromise;
      } catch (micError) {
        if (startId !== startGenerationRef.current) {
          connection.close();
          player.stop();
          return;
        }
        throw micError;
      }

      if (startId !== startGenerationRef.current) {
        micStream.getTracks().forEach((track) => track.stop());
        connection.close();
        player.stop();
        return;
      }

      let bargeChunks = 0;
      let echoUntil = 0;
      let micHandle: MicStreamer | null = null;

      const mic = await startMicStreamer(
        (chunk) => {
          if (startId !== startGenerationRef.current) return;
          connection.sendAudioChunk(chunk);
        },
        (level) => {
          setInputLevel(level);
          const now = performance.now();
          if (!heardModelAudio) {
            micHandle?.setSending(false);
            return;
          }
          if (player.isSpeaking) {
            echoUntil = now + ECHO_HOLD_MS;
            if (level >= BARGE_IN_LEVEL) {
              bargeChunks += 1;
              if (bargeChunks >= BARGE_IN_CHUNKS) {
                player.interrupt();
                micHandle?.setSending(true);
                bargeChunks = 0;
              } else {
                micHandle?.setSending(false);
              }
            } else {
              bargeChunks = 0;
              micHandle?.setSending(false);
            }
            return;
          }

          bargeChunks = 0;
          micHandle?.setSending(now >= echoUntil);
        },
        { audioContext: captureContext, stream: micStream, sending: false }
      );
      micHandle = mic;
      micOwned = true;

      if (startId !== startGenerationRef.current) {
        mic.stop();
        connection.close();
        player.stop();
        return;
      }

      micRef.current = mic;

      window.setTimeout(() => {
        if (startId !== startGenerationRef.current) return;
        if (!heardModelAudio) {
          heardModelAudio = true;
          mic.setSending(true);
        }
      }, 3000);

      if (!greetedRef.current) {
        greetedRef.current = true;
        echoUntil = performance.now() + 2500;
        mic.setSending(false);
        player.interrupt();
        connection.sendGreeting(askWhoIsSpeakingPrompt());
        setLiveHint(`Who am I talking to — ${PERSON_LABELS.kushvanth} or ${PERSON_LABELS.g}?`);
      }
    } catch (err) {
      dropUnusedMic();
      if (startId !== startGenerationRef.current) return;
      sessionLockRef.current = false;
      cleanupVoiceSession();
      setStatus("error");
      const raw = err instanceof Error ? err.message : "Failed to start live voice.";
      const blocked = /notallowed|permission|denied|could not start audio/i.test(raw);
      setError(
        blocked
          ? "Allow the microphone in the browser bar, then tap Start voice."
          : raw
      );
      setLiveHint(blocked ? "Microphone is blocked." : "Could not start voice session.");
    }
  }, [assistantName, autoStart, cleanupVoiceSession, showWritePreview, stopVoice, voiceGender]);

  useEffect(() => {
    startVoiceRef.current = startVoice;
  });

  useEffect(() => {
    registerVoiceStarter(startVoice);
    return () => registerVoiceStarter(null);
  }, [registerVoiceStarter, startVoice]);

  useEffect(() => {
    if (voiceStartSignal <= 0 && !autoStart) return;
    const key = voiceStartSignal > 0 ? `s:${voiceStartSignal}` : "auto";
    if (handledVoiceSignalRef.current === key) return;
    setLiveHint("Starting to listen…");

    const timer = window.setTimeout(() => {
      handledVoiceSignalRef.current = key;
      void startVoiceRef.current?.().finally(() => {
        onAutoStartHandled?.();
        clearAutoStart();
      });
    }, 0);

    return () => window.clearTimeout(timer);
  }, [voiceStartSignal, autoStart, onAutoStartHandled, clearAutoStart]);

  useEffect(() => {
    onLiveChange?.(status === "live" || status === "connecting");
  }, [status, onLiveChange]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines, liveHint, awaitingConfirmation]);

  useEffect(() => {
    if (!awaitingConfirmation) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        confirmVoiceWriteRef.current("Yes");
      } else if (event.key === "Escape") {
        event.preventDefault();
        setPendingWrite(null);
        setAwaitingConfirmation(false);
        showWritePreview(null);
        setLiveHint("Not saved — tell me what to change.");
        playerRef.current?.interrupt();
        connectionRef.current?.sendGreeting(
          "App result (do not call tools): {\"ok\":false,\"saved\":false}. The user said no. Do not save. Ask what to change in one short English sentence."
        );
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [awaitingConfirmation, showWritePreview]);

  useEffect(() => {
    return () => {
      startGenerationRef.current += 1;
      sessionLockRef.current = false;
      greetedRef.current = false;
      cleanupVoiceSession();
    };
  }, [cleanupVoiceSession]);

  const sessionActive = status === "live" || status === "connecting";
  const needsSpeaker = sessionActive && !speaker;
  const compactOrb =
    awaitingConfirmation ||
    accountChoices.length > 0 ||
    Boolean(lastSavedBanner) ||
    needsSpeaker;
  const pendingWrite = pendingWriteState;
  const categoryChips =
    awaitingConfirmation &&
    pendingWrite?.name === "record_expense" &&
    !String(pendingWrite.args.category ?? "").trim()
      ? allCategoryChips()
      : [];

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      {error ? (
        <div
          role="alert"
          className="sticky top-0 z-20 rounded-xl bg-[#ff3b30]/12 border border-[#ff3b30]/30 px-3 py-2 text-[12px] text-[#ff3b30] text-center font-semibold backdrop-blur-md"
        >
          {error}
        </div>
      ) : needsSpeaker ? (
        <div className="sticky top-0 z-20 flex justify-center">
          <div className="w-full max-w-sm rounded-xl bg-[#007aff]/10 border border-[#007aff]/25 px-3 py-2.5 space-y-2 backdrop-blur-md">
            <p className="text-[11px] text-[#007aff] text-center font-medium">
              Who am I talking to?
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {SPEAKER_CHIPS.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => {
                    speakerRef.current = chip.id;
                    setSpeaker(chip.id);
                    if (pendingWriteRef.current) {
                      const next = applySpeakerToWrite(pendingWriteRef.current, chip.id);
                      setPendingWrite(next);
                      showWritePreview(buildToolConfirmationPreview(next));
                    }
                    playerRef.current?.interrupt();
                    connectionRef.current?.sendGreeting(speakingWithConfirmedPrompt(chip.id));
                    setLiveHint(`Talking to ${chip.label}`);
                    if (recentlyAffirmedRef.current) {
                      confirmVoiceWriteRef.current("Yes", { immediate: true });
                    }
                  }}
                  className="min-h-11 rounded-full border border-[#007aff]/40 bg-[#007aff]/15 px-4 py-2 text-[13px] font-semibold text-[#007aff]"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : lastSavedBanner ? (
        <div className="sticky top-0 z-20 flex justify-center">
          <div
            role="status"
            aria-live="polite"
            className="w-full max-w-sm rounded-xl bg-[#34c759]/15 border border-[#34c759]/30 px-3 py-2 text-[12px] text-[#34c759] text-center font-semibold backdrop-blur-md"
          >
            {lastSavedBanner}
          </div>
        </div>
      ) : accountChoices.length > 0 ? (
        <div className="sticky top-0 z-20 flex justify-center">
          <div className="w-full max-w-sm rounded-xl bg-[#007aff]/10 border border-[#007aff]/25 px-3 py-2.5 space-y-2 backdrop-blur-md">
            <p className="text-[11px] text-[#007aff] text-center font-medium">
              {accountChoicePrompt(pendingWrite?.name ?? "", accountChoiceKind)}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {accountChoices.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  onClick={() => {
                    const pending = pendingWriteRef.current;
                    if (!pending) return;
                    const next = withPickedAccount(pending, account, accountChoiceKind);
                    setPendingWrite(next);
                    showWritePreview(buildToolConfirmationPreview(next));
                    setAccountChoices([]);
                    setAwaitingConfirmation(true);
                    setLiveHint('Say "yes" or tap Yes, save.');
                  }}
                  className="min-h-11 rounded-full border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/10 px-3.5 py-2 text-[12px] font-semibold"
                >
                  {account.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : awaitingConfirmation ? (
        <div className="sticky top-0 z-20 flex justify-center">
          <div
            role="region"
            aria-label="Confirm this money change"
            className="w-full max-w-sm rounded-xl bg-[#ff9500]/10 border border-[#ff9500]/25 px-3 py-2.5 text-[11px] text-[#ff9500] text-center space-y-2 backdrop-blur-md"
          >
            {pendingPreview ? <p className="font-medium text-[#ffb340]">{pendingPreview}</p> : null}
            {pendingWrite?.name === "record_expense" ? (
              <>
                <div className="flex flex-wrap justify-center gap-2">
                  {EXPENSE_PERSON_CHIPS.map((chip) => {
                    const selected = String(pendingWrite.args.expense_for ?? "") === chip.id;
                    return (
                      <button
                        key={chip.id}
                        type="button"
                        onClick={() => {
                          const pending = pendingWriteRef.current;
                          if (!pending) return;
                          const next = {
                            ...pending,
                            args: withExpensePerson(pending.args, chip.id),
                          };
                          setPendingWrite(next);
                          showWritePreview(buildToolConfirmationPreview(next));
                        }}
                        className={`min-h-9 rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
                          selected
                            ? "border-[#007aff] bg-[#007aff]/15 text-[#007aff]"
                            : "border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/10 text-foreground"
                        }`}
                      >
                        {chip.label}
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {EXPENSE_PAID_BY_CHIPS.map((chip) => {
                    const selected = String(pendingWrite.args.paid_by ?? "") === chip.id;
                    return (
                      <button
                        key={chip.id}
                        type="button"
                        onClick={() => {
                          const pending = pendingWriteRef.current;
                          if (!pending) return;
                          const next = {
                            ...pending,
                            args: withPaidBy(pending.args, chip.id),
                          };
                          setPendingWrite(next);
                          showWritePreview(buildToolConfirmationPreview(next));
                        }}
                        className={`min-h-9 rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
                          selected
                            ? "border-[#007aff] bg-[#007aff]/15 text-[#007aff]"
                            : "border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/10 text-foreground"
                        }`}
                      >
                        {chip.label}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}
            {categoryChips.length > 0 ? (
              <div className="flex flex-wrap justify-center gap-2">
                {categoryChips.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => {
                      const pending = pendingWriteRef.current;
                      if (!pending) return;
                      const next = {
                        ...pending,
                        args: { ...pending.args, category: category.name },
                      };
                      setPendingWrite(next);
                      showWritePreview(buildToolConfirmationPreview(next));
                    }}
                    className="min-h-11 rounded-full border border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/10 px-3.5 py-2 text-[12px] font-semibold text-foreground"
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="flex gap-2">
              <button
                type="button"
                autoFocus
                disabled={toolBusy}
                onClick={() => confirmVoiceWriteRef.current("Yes", { immediate: true })}
                className="flex-1 min-h-11 rounded-lg bg-[#34c759] text-white py-2 text-[13px] font-semibold disabled:opacity-50"
              >
                Yes, save
              </button>
              <button
                type="button"
                disabled={toolBusy}
                onClick={() => {
                  setPendingWrite(null);
                  recentlyAffirmedRef.current = false;
        affirmedWriteRef.current = null;
                  setAwaitingConfirmation(false);
                  showWritePreview(null);
                  setLiveHint("Not saved — tell me what to change.");
                  playerRef.current?.interrupt();
                  connectionRef.current?.sendGreeting(
                    "App result (do not call tools): {\"ok\":false,\"saved\":false}. The user said no. Do not save. Ask what to change in one short English sentence."
                  );
                }}
                className="flex-1 min-h-11 rounded-lg bg-black/5 dark:bg-white/10 text-foreground py-2 text-[13px] font-semibold disabled:opacity-50"
              >
                No
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Compact orb + the real voice pipeline. The orb is deliberately small:
          at full size it swallowed the panel and left no room for the chat. */}
      <div className="shrink-0 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 space-y-2">
        <div className="flex items-center gap-2.5">
          <AssistantLiveOrb
            state={orbState}
            inputLevel={inputLevel}
            outputLevel={outputLevel}
            size="sm"
            className="assistant-gemini-orb-inline shrink-0"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11.5px] font-semibold text-white/85">{orbLabel}</p>
            <p className="truncate text-[9.5px] text-white/45">
              {status}
              {speaker ? ` · ${PERSON_LABELS[speaker]}` : ""}
              {sessionActive ? " · Gemini voice" : ""}
            </p>
          </div>
          {sessionActive ? (
            <button
              type="button"
              onClick={() => void stopVoice()}
              className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#ff3b30] px-3 py-1.5 text-[11px] font-semibold text-white"
            >
              <MicOff className="h-3.5 w-3.5" />
              {status === "connecting" ? "Cancel" : "Stop"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void startVoice()}
              className="shrink-0 inline-flex items-center gap-1 rounded-full bg-[#007aff] px-3 py-1.5 text-[11px] font-semibold text-white"
            >
              <Mic className="h-3.5 w-3.5" />
              {status === "error" ? "Retry" : "Start"}
            </button>
          )}
        </div>

        <VoicePipeline state={orbState} toolBusy={toolBusy} active={sessionActive} />
      </div>

      {!sessionActive && !hasUsedVoice ? (
        <GlassCard className="!p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted mb-2">
            How voice works
          </p>
          <ol className="space-y-1.5">
            {VOICE_STEPS.map((step, index) => (
              <li key={step} className="flex gap-2 text-[11px] text-muted">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-[#007aff] mt-0.5" />
                <span>
                  <strong className="text-foreground/80">{index + 1}.</strong> {step}
                </span>
              </li>
            ))}
          </ol>
        </GlassCard>
      ) : null}

      <div
        className="assistant-voice-transcript flex-1 min-h-[7rem] rounded-xl overflow-y-auto p-3 space-y-2.5"
      >
        {lines.length > 0 ? (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                transcriptSessionRef.current?.reset();
                setLines([]);
                connectionRef.current?.sendGreeting(
                  "The user cleared this conversation. Forget prior chat. Stay silent until they speak. Do not greet."
                );
              }}
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-white/50 hover:text-[#ff3b30]"
            >
              <Trash2 className="w-3 h-3" />
              Clear history
            </button>
          </div>
        ) : null}
        {lines.length === 0 ? (
          <div className={`text-center px-4 ${compactOrb ? "py-3" : "py-8"}`}>
            <p className="text-sm font-medium text-white/85">
              {sessionActive ? "Speak naturally" : `Talk to ${assistantName}`}
            </p>
            <p className="text-xs text-white/45 mt-1">
              {sessionActive
                ? "Your words appear here and save with date and time."
                : "Voice can start automatically. Chats save with date and time, then delete after 30 days."}
            </p>
          </div>
        ) : (
          lines.map((line, index) => (
            <div
              key={line.id}
              className={`flex ${line.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`assistant-voice-bubble max-w-[88%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed break-words ${
                  line.role === "user"
                    ? "assistant-voice-bubble-user"
                    : "assistant-voice-bubble-model"
                } ${line.draft ? "assistant-voice-bubble-draft" : ""} ${
                  index === lines.length - 1 ? "assistant-voice-bubble-latest" : ""
                }`}
              >
                {line.text}
                {line.created_at && !line.draft ? (
                  <p
                    className={`mt-1 text-[10px] ${
                      line.role === "user" ? "text-white/55" : "text-white/40"
                    }`}
                  >
                    {formatChatWhen(line.created_at)}
                  </p>
                ) : null}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
