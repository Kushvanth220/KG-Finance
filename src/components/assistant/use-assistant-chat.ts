"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Part } from "@google/generative-ai";
import { getClientFinancePayload } from "@/lib/ai/client-finance-context";
import { getBehaviorInstructionsForAssistant, getRemindersForAssistant } from "@/store/assistant-preferences-store";
import { getRulesForAssistant } from "@/store/rules-store";
import { describeRule } from "@/lib/rules/engine";
import { executeAssistantTools } from "@/lib/ai/execute-assistant-tool";
import {
  asProposedWrite,
  buildToolConfirmationPreview,
  isWriteTool,
  spokenSaveConfirmation,
  writeToolNeedsAccount,
  expenseWriteNeedsPayer,
  sortAccountChips,
  writeNeedsSpeaker,
} from "@/lib/ai/assistant-confirmation";
import type { AssistantToolCall } from "@/lib/ai/tools";
import type { CouncilStage, LayerStatus } from "@/lib/ai/council";
import type { Person } from "@/types";
import { PERSON_LABELS } from "@/types";
import { inferSpeakerFromUtterance } from "@/lib/ai/person";
import { applySpeakerToWrite } from "@/lib/ai/infer-write-intent";
import { useFinanceStore } from "@/store/finance-store";

/**
 * The text assistant's engine: sessions, a turn, the tool round-trips, and
 * the confirm-before-saving rules — without any of its looks.
 *
 * Lifted as-is out of AiChatPanel so the same engine can drive more than one
 * face (the chat panel, and the assistant workspace with its money map). The
 * consent rules live here and only here: every money write the model asks for
 * is turned into a proposal, and only `confirmPending` — a person's tap or
 * typed yes — ever marks one confirmed.
 *
 * `onActivity` reports what the assistant is doing as it does it — asked,
 * thinking, which tools it reached for, what it answered — so a view can show
 * the work. It observes; nothing it returns changes the turn.
 */

export interface ChatMessage {
  id: string;
  role: "user" | "model";
  content: string;
  created_at?: string;
}

export interface ChatSession {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export type AssistantActivity =
  | { type: "ask"; text: string }
  | { type: "stage"; stage: CouncilStage }
  | { type: "tools"; calls: { name: string; args: Record<string, unknown> }[] }
  | { type: "reply"; text: string }
  | { type: "confirm"; preview: string }
  | { type: "saved"; text: string }
  | { type: "error"; message: string }
  | { type: "idle" };

export type AccountChip = { id: string; name: string };

function allAccountChips() {
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

function allDebitChips() {
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

function chipsFromToolAccounts(accounts: unknown, debitOnly = false) {
  if (!Array.isArray(accounts)) return debitOnly ? allDebitChips() : allAccountChips();
  const listed = accounts
    .filter((item): item is { id?: string; name?: string; type?: string } => !!item && typeof item === "object")
    .filter((item) => item.id && item.name && (!debitOnly || item.type === "debit"))
    .map((item) => ({ id: String(item.id), name: String(item.name) }));
  return sortAccountChips(listed.length > 0 ? listed : debitOnly ? allDebitChips() : allAccountChips()).slice(0, 8);
}

export function allCategoryChips() {
  return useFinanceStore
    .getState()
    .spendCategories.filter((category) => category.name.trim())
    .slice(0, 8)
    .map((category) => ({ id: category.id, name: category.name }));
}

export function useAssistantChat({
  assistantName,
  onActivity,
}: {
  assistantName: string;
  onActivity?: (activity: AssistantActivity) => void;
}) {
  const person: Person = "kushvanth";
  const [speaker, setSpeaker] = useState<Person | null>(null);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingChatDelete, setPendingChatDelete] = useState<"all" | string | null>(null);
  const [councilStage, setCouncilStage] = useState<CouncilStage>("input");
  const [layerStates, setLayerStates] = useState<Record<string, LayerStatus>>({});
  const [reviewed, setReviewed] = useState<boolean | null>(null);
  const [reviewReason, setReviewReason] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<AssistantToolCall | null>(null);
  /**
   * Further writes from the SAME turn, waiting their turn for a card.
   *
   * "Three blocks today: $33, $31.50 and $42" is three log_rule_entry calls in
   * one reply. Only the first used to get a confirmation card and the rest were
   * dropped on the spot, so two of the three blocks silently never existed.
   * Each one now gets its own card, approved or refused on its own.
   */
  const [pendingRest, setPendingRest] = useState<AssistantToolCall[]>([]);
  const [savedBanner, setSavedBanner] = useState<string | null>(null);
  const [accountChoices, setAccountChoices] = useState<AccountChip[]>([]);
  const [accountChoiceKind, setAccountChoiceKind] = useState<"pay-from" | "cash-source">("pay-from");

  // The latest listener, read when an event fires rather than captured by it.
  const activityRef = useRef(onActivity);
  useEffect(() => {
    activityRef.current = onActivity;
  });
  const emit = (activity: AssistantActivity) => activityRef.current?.(activity);

  const loadSessions = useCallback(async (userId: Person) => {
    const response = await fetch(`/api/ai/sessions?user_id=${userId}`, { cache: "no-store" });
    const payload = await response.json();
    if (!payload.ok) throw new Error(payload.error ?? "Failed to load sessions.");
    setSessions(payload.sessions ?? []);
    return payload.sessions as ChatSession[];
  }, []);

  const loadMessages = useCallback(async (userId: Person, activeSessionId: string) => {
    const response = await fetch(
      `/api/ai/history?user_id=${userId}&session_id=${activeSessionId}`,
      { cache: "no-store" }
    );
    const payload = await response.json();
    if (!payload.ok) throw new Error(payload.error ?? "Failed to load chat history.");
    setMessages(payload.messages ?? []);
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setBooting(true);
      setError(null);
      try {
        const userSessions = await loadSessions(person);
        if (cancelled) return;

        if (userSessions.length > 0) {
          const latest = userSessions[0]!.id;
          setSessionId(latest);
          await loadMessages(person, latest);
        } else {
          setSessionId(null);
          setMessages([]);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to initialize AI.");
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [person, loadSessions, loadMessages]);

  async function handleNewChat() {
    setSessionId(null);
    setMessages([]);
    setError(null);
    setPendingConfirm(null);
    setSavedBanner(null);
    setAccountChoices([]);
    setSpeaker(null);
  }

  async function confirmPending() {
    if (!pendingConfirm || loading) return;
    if (!speaker && writeNeedsSpeaker(pendingConfirm.name)) {
      setError(`Who am I talking to — ${PERSON_LABELS.kushvanth} or ${PERSON_LABELS.g}?`);
      return;
    }
    if (expenseWriteNeedsPayer(pendingConfirm)) {
      setError(`Who paid — ${PERSON_LABELS.kushvanth}, ${PERSON_LABELS.g}, or both?`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const prepared = applySpeakerToWrite(pendingConfirm, speaker);
      // Workspace memory has no person on it, so it saves without one.
      const call = {
        ...prepared,
        args: { ...prepared.args, user_confirmed: true },
      };
      const [result] = executeAssistantTools(speaker ?? person, [call]);
      const saved = result?.result?.saved === true;
      if (saved) {
        const spoken = spokenSaveConfirmation(call);
        // Move to the next write from the same turn, if there is one.
        const [next, ...remaining] = pendingRest;
        setPendingConfirm(next ?? null);
        setPendingRest(remaining);
        setAccountChoices([]);
        setSavedBanner(spoken);
        emit({ type: "saved", text: spoken });
        const line: ChatMessage = {
          id: `local-save-${Date.now()}`,
          role: "model",
          content: spoken,
          created_at: new Date().toISOString(),
        };
        setMessages((current) => [...current, line]);
        if (sessionId) {
          await fetch("/api/ai/history", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              user_id: person,
              session_id: sessionId,
              role: "model",
              content: spoken,
            }),
          });
        }
        window.setTimeout(() => setSavedBanner(null), 8000);
      } else if (result?.result?.needs_payer === true) {
        setError(String(result.result.error ?? `Who paid — ${PERSON_LABELS.kushvanth}, ${PERSON_LABELS.g}, or both?`));
      } else if (result?.result?.needs_cash_source === true) {
        setAccountChoiceKind("cash-source");
        setAccountChoices(chipsFromToolAccounts(result.result.accounts, true));
      } else if (result?.result?.needs_account === true) {
        setAccountChoiceKind("pay-from");
        setAccountChoices(chipsFromToolAccounts(result.result.accounts));
      } else {
        setError(String(result?.result?.error ?? "Need one more detail."));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!pendingConfirm) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setPendingConfirm(null);
      setPendingRest([]);
      setAccountChoices([]);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [pendingConfirm]);

  async function handleDeleteSession(sessionToDelete: string) {
    try {
      const response = await fetch(
        `/api/ai/sessions?user_id=${person}&session_id=${sessionToDelete}`,
        { method: "DELETE" }
      );
      const payload = await response.json();
      if (!payload.ok) throw new Error(payload.error ?? "Could not delete chat.");

      const remaining = await loadSessions(person);
      if (sessionId === sessionToDelete) {
        if (remaining.length > 0) {
          setSessionId(remaining[0]!.id);
          await loadMessages(person, remaining[0]!.id);
        } else {
          setSessionId(null);
          setMessages([]);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete chat.");
    }
  }

  async function handleClearHistory() {
    setPendingChatDelete(null);
    try {
      const response = await fetch(`/api/ai/sessions?user_id=${person}&all=1`, {
        method: "DELETE",
      });
      const payload = await response.json();
      if (!payload.ok) throw new Error(payload.error ?? "Could not delete chat history.");

      setSessionId(null);
      setMessages([]);
      setSessions([]);
      setError(null);
      setSpeaker(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete chat history.");
    }
  }

  /**
   * Streams NDJSON progress events so the council graph reflects what the
   * server is actually doing, then resolves with the final payload.
   */
  async function runChatRequest(body: Record<string, unknown>) {
    const response = await fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!response.body) {
      throw new Error("Assistant request failed — no response stream.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let final: Record<string, unknown> | null = null;

    const handleLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(trimmed);
      } catch {
        return;
      }

      if (event.type === "stage") {
        setCouncilStage(event.stage as CouncilStage);
        emit({ type: "stage", stage: event.stage as CouncilStage });
      } else if (event.type === "layer") {
        setLayerStates((current) => ({
          ...current,
          [String(event.id)]: event.status as LayerStatus,
        }));
      } else if (event.type === "cascade") {
        setReviewed(event.reviewed === true);
        setReviewReason(typeof event.reason === "string" ? event.reason : null);
      } else if (event.type === "done") {
        final = event.payload as Record<string, unknown>;
      }
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      lines.forEach(handleLine);
    }
    handleLine(buffer);

    const payload = final as Record<string, unknown> | null;
    if (!payload) throw new Error("Assistant stream ended without a reply.");
    if (!payload.ok) throw new Error((payload.error as string) ?? "Assistant request failed.");
    return payload as {
      ok: true;
      session_id: string;
      reply?: string;
      needs_tools?: boolean;
      tool_calls?: Array<{ id: string; name: string; args: Record<string, unknown> }>;
      model_parts?: Part[];
      user_message?: string;
      message?: { id: string };
      providers?: string[];
    };
  }

  async function handleSend(preset?: string) {
    const trimmed = (preset ?? input).trim();
    if (!trimmed || loading) return;

    const identified = inferSpeakerFromUtterance(trimmed, {
      awaitingIdentity: !speaker,
    });
    const activeSpeaker = identified ?? speaker;
    if (identified) setSpeaker(identified);

    setLoading(true);
    setError(null);
    setInput("");
    setSavedBanner(null);
    setCouncilStage("input");
    setLayerStates({});
    setReviewed(null);
    setReviewReason(null);
    emit({ type: "ask", text: trimmed });

    const optimistic: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: trimmed,
      created_at: new Date().toISOString(),
    };
    setMessages((current) => [...current, optimistic]);

    try {
      const financeState = await getClientFinancePayload(person);
      const behaviorInstructions = getBehaviorInstructionsForAssistant();
      const reminders = getRemindersForAssistant();
      // Rules go up as plain sentences, so the model follows them the way it
      // follows a behaviour preference — without a tool call just to learn
      // that a rule exists at all.
      const rules = getRulesForAssistant().map(
        (rule) => `${rule.name} (${rule.scope}): ${describeRule(rule)}`
      );

      let payload = await runChatRequest({
        user_id: person,
        assistant_name: assistantName,
        message: trimmed,
        session_id: sessionId ?? undefined,
        finance_state: financeState,
        behavior_instructions: behaviorInstructions,
        reminders,
        rules,
        speaking_with: activeSpeaker ?? undefined,
      });

      if (!sessionId) {
        setSessionId(payload.session_id);
      }

      let waitingOnUser = false;
      while (payload.needs_tools && payload.tool_calls?.length) {
        // Two different questions, so two different lookups. Every write needs a
        // confirm card; only writes that carry a person need to know who is
        // speaking. Folding them together made workspace memory ask for a name
        // it never stores — and dropped the card when it stopped asking.
        const writeCall = payload.tool_calls.find((call) => isWriteTool(call.name));
        const speakerCall = payload.tool_calls.find((call) => writeNeedsSpeaker(call.name));
        emit({ type: "tools", calls: payload.tool_calls.map((call) => ({ name: call.name, args: call.args ?? {} })) });
        if (speakerCall && !activeSpeaker) {
          setPendingConfirm(speakerCall);
          waitingOnUser = true;
          setError(`Who am I talking to — ${PERSON_LABELS.kushvanth} or ${PERSON_LABELS.g}?`);
          break;
        }
        // asProposedWrite: a tool call from the model can arrive already claiming
        // user_confirmed. Strip it so every money write goes through the confirm
        // card below and the person agrees to the amount they can actually see.
        const preparedCalls = payload.tool_calls.map((raw) => {
          const call = asProposedWrite(raw);
          return isWriteTool(call.name) && activeSpeaker
            ? applySpeakerToWrite(call, activeSpeaker)
            : call;
        });
        const toolResults = executeAssistantTools(activeSpeaker ?? person, preparedCalls);
        const needsConfirm = toolResults.some(
          (result) => result.result?.status === "needs_confirmation"
        );
        const savedWrite = toolResults.find((result) => result.result?.saved === true);

        const accountNeed = toolResults.find((result) => result.result?.needs_account === true);
        const cashSourceNeed = toolResults.find(
          (result) => result.result?.needs_cash_source === true
        );
        const payerNeed = toolResults.find((result) => result.result?.needs_payer === true);

        if (savedWrite && writeCall) {
          setPendingConfirm(null);
          setAccountChoices([]);
          setSavedBanner(spokenSaveConfirmation(applySpeakerToWrite(writeCall, activeSpeaker)));
          window.setTimeout(() => setSavedBanner(null), 8000);
        } else if (writeCall && (needsConfirm || accountNeed || cashSourceNeed || payerNeed || expenseWriteNeedsPayer(writeCall))) {
          const proposal = activeSpeaker ? applySpeakerToWrite(writeCall, activeSpeaker) : writeCall;
          setPendingConfirm(proposal);
          emit({ type: "confirm", preview: buildToolConfirmationPreview(proposal) });
          // Everything else this turn wanted to write, in order.
          const rest = payload.tool_calls
            .filter((call) => isWriteTool(call.name) && call !== writeCall)
            .map((call) => {
              const proposed = asProposedWrite(call);
              return activeSpeaker ? applySpeakerToWrite(proposed, activeSpeaker) : proposed;
            });
          setPendingRest(rest);
          waitingOnUser = true;
          if (cashSourceNeed) {
            setAccountChoiceKind("cash-source");
            setAccountChoices(chipsFromToolAccounts(cashSourceNeed.result?.accounts, true));
          } else if (accountNeed || writeToolNeedsAccount(writeCall)) {
            setAccountChoiceKind("pay-from");
            setAccountChoices(chipsFromToolAccounts(accountNeed?.result?.accounts));
          } else {
            setAccountChoices([]);
          }
          break;
        }

        payload = await runChatRequest({
          user_id: person,
          assistant_name: assistantName,
          session_id: payload.session_id,
          finance_state: financeState,
          behavior_instructions: behaviorInstructions,
          reminders,
          rules,
          speaking_with: activeSpeaker ?? undefined,
          tool_continuation: {
            user_message: payload.user_message ?? trimmed,
            model_parts: payload.model_parts ?? [],
            tool_responses: toolResults.map((result) => ({
              id: result.id,
              name: result.name,
              result: result.result,
            })),
          },
        });
      }

      if (typeof payload.reply === "string" && payload.reply.trim()) {
        emit({ type: "reply", text: payload.reply });
      }

      if (
        typeof payload.reply === "string" &&
        /the expenses are recorded|the income is recorded|the balance is updated/i.test(
          payload.reply
        )
      ) {
        setPendingConfirm(null);
        setSavedBanner(payload.reply.trim());
        window.setTimeout(() => setSavedBanner(null), 8000);
      }

      if (!waitingOnUser) {
        await loadMessages(person, payload.session_id);
        await loadSessions(person);
      } else {
        void loadSessions(person);
      }
    } catch (err) {
      setMessages((current) => current.filter((item) => item.id !== optimistic.id));
      setInput(trimmed);
      const message = err instanceof Error ? err.message : "Assistant request failed.";
      setError(message);
      emit({ type: "error", message });
    } finally {
      setLoading(false);
      emit({ type: "idle" });
    }
  }

  /** The "No" on a confirm card: drop this write and the rest of the turn's, and say so. */
  function declinePending() {
    setPendingConfirm(null);
    setPendingRest([]);
    void handleSend("No");
  }

  function openSession(id: string) {
    setSessionId(id);
    void loadMessages(person, id);
  }

  return {
    person,
    speaker,
    setSpeaker,
    sessions,
    sessionId,
    openSession,
    messages,
    input,
    setInput,
    loading,
    booting,
    error,
    setError,
    pendingChatDelete,
    setPendingChatDelete,
    councilStage,
    layerStates,
    reviewed,
    reviewReason,
    pendingConfirm,
    setPendingConfirm,
    pendingRest,
    savedBanner,
    accountChoices,
    setAccountChoices,
    accountChoiceKind,
    handleNewChat,
    confirmPending,
    declinePending,
    handleDeleteSession,
    handleClearHistory,
    handleSend,
  };
}

export type AssistantChat = ReturnType<typeof useAssistantChat>;
