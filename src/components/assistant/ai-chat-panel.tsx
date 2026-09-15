"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, Loader2, MessageSquarePlus, Send, Trash2 } from "lucide-react";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassCard } from "@/components/ui/glass-card";
import { CompactPageShell } from "@/components/ui/compact-page-shell";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { getClientFinancePayload } from "@/lib/ai/client-finance-context";
import { getBehaviorInstructionsForAssistant, getRemindersForAssistant } from "@/store/assistant-preferences-store";
import { getRulesForAssistant } from "@/store/rules-store";
import { describeRule } from "@/lib/rules/engine";
import { AssistantMessageBody } from "@/components/assistant/assistant-message-body";
import { executeAssistantTools } from "@/lib/ai/execute-assistant-tool";
import {
  asProposedWrite,
  buildToolConfirmationPreview,
  isWriteTool,
  spokenSaveConfirmation,
  EXPENSE_PERSON_CHIPS,
  EXPENSE_PAID_BY_CHIPS,
  withExpensePerson,
  withPaidBy,
  accountChoicePrompt,
  withPickedAccount,
  writeToolNeedsAccount,
  expenseWriteNeedsPayer,
  sortAccountChips,
  writeNeedsSpeaker,
} from "@/lib/ai/assistant-confirmation";
import type { AssistantToolCall } from "@/lib/ai/tools";
import type { Part } from "@google/generative-ai";
import { CouncilLayerAnimation } from "@/components/assistant/council-layer-animation";
import type { CouncilStage, LayerStatus } from "@/lib/ai/council";
import { formatChatWhen } from "@/lib/ai/chat-time";
import type { Person } from "@/types";
import { PERSON_LABELS } from "@/types";
import { inferSpeakerFromUtterance, SPEAKER_CHIPS } from "@/lib/ai/person";
import { applySpeakerToWrite, isShortAffirmation } from "@/lib/ai/infer-write-intent";
import { useFinanceStore } from "@/store/finance-store";

interface ChatMessage {
  id: string;
  role: "user" | "model";
  content: string;
  created_at?: string;
}

interface ChatSession {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

interface AiChatPanelProps {
  assistantName?: string;
  embedded?: boolean;
}

const QUICK_PROMPTS = [
  "What did we spend today?",
  "What's the GreenDot balance?",
  "Any reminders due?",
] as const;

function allAccountChips() {
  const seen = new Set<string>();
  const chips: Array<{ id: string; name: string }> = [];
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
  const chips: Array<{ id: string; name: string }> = [];
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

function allCategoryChips() {
  return useFinanceStore
    .getState()
    .spendCategories.filter((category) => category.name.trim())
    .slice(0, 8)
    .map((category) => ({ id: category.id, name: category.name }));
}

export function AiChatPanel({
  assistantName = "Jarvis",
  embedded = false,
}: AiChatPanelProps) {
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
  const [accountChoices, setAccountChoices] = useState<Array<{ id: string; name: string }>>([]);
  const [accountChoiceKind, setAccountChoiceKind] = useState<"pay-from" | "cash-source">("pay-from");
  const bottomRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

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
          setPendingConfirm(
            activeSpeaker ? applySpeakerToWrite(writeCall, activeSpeaker) : writeCall
          );
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
      setError(err instanceof Error ? err.message : "Assistant request failed.");
    } finally {
      setLoading(false);
    }
  }

  const content = (
    <>
      <ConfirmDialog
        open={pendingChatDelete !== null}
        title={pendingChatDelete === "all" ? "Delete all chats?" : "Delete this chat?"}
        message={
          pendingChatDelete === "all"
            ? "Every saved text conversation will be removed. Your money records are not affected."
            : "This conversation will be removed. Your money records are not affected."
        }
        confirmLabel={pendingChatDelete === "all" ? "Delete all" : "Delete chat"}
        onConfirm={() => {
          if (pendingChatDelete === "all") {
            void handleClearHistory();
          } else if (pendingChatDelete) {
            const id = pendingChatDelete;
            setPendingChatDelete(null);
            void handleDeleteSession(id);
          }
        }}
        onCancel={() => setPendingChatDelete(null)}
      />

      <GlassCard className="!p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-muted">
            <Bot className="w-4 h-4 text-[#007aff]" />
            <span className={embedded ? "sr-only" : undefined}>
              Text chat · <strong>shared</strong>
            </span>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 || sessions.length > 0 ? (
              <GlassButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPendingChatDelete("all")}
                aria-label="Delete all text chats"
              >
                <Trash2 className="w-4 h-4" />
                {embedded ? null : "Delete history"}
              </GlassButton>
            ) : null}
            <GlassButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleNewChat}
              aria-label="New chat"
            >
              <MessageSquarePlus className="w-4 h-4" />
              {embedded ? null : "New chat"}
            </GlassButton>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            {speaker ? `Talking to ${PERSON_LABELS[speaker]}` : "Who am I talking to?"}
          </p>
          {SPEAKER_CHIPS.map((chip) => {
            const selected = speaker === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => {
                  setSpeaker(chip.id);
                  setError(null);
                  if (pendingConfirm) {
                    setPendingConfirm(applySpeakerToWrite(pendingConfirm, chip.id));
                  }
                }}
                className={`min-h-8 rounded-full border px-3 py-1 text-[11px] font-semibold ${
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
        {sessions.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {sessions.slice(0, embedded ? 2 : 5).map((session) => (
              <div
                key={session.id}
                className={`shrink-0 inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] border ${
                  sessionId === session.id
                    ? "border-[#007aff]/40 bg-[#007aff]/10 text-[#007aff]"
                    : "border-black/5 dark:border-white/10"
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setSessionId(session.id);
                    void loadMessages(person, session.id);
                  }}
                  className="max-w-[9rem] text-left"
                >
                  <span className="block truncate">{session.title ?? "Chat"}</span>
                  <span className="block text-[9px] opacity-70">
                    {formatChatWhen(session.updated_at || session.created_at)}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label="Delete this chat"
                  onClick={() => setPendingChatDelete(session.id)}
                  className="text-muted hover:text-[#ff3b30] text-sm leading-none"
                >
                  ×
                </button>
              </div>
            ))}
            {sessions.length > (embedded ? 2 : 5) ? (
              <span className="shrink-0 self-center text-[10px] text-muted">
                +{sessions.length - (embedded ? 2 : 5)} more
              </span>
            ) : null}
          </div>
        ) : null}
      </GlassCard>

      <div
        className={`glass rounded-xl overflow-y-auto p-3 space-y-3 ${
          embedded ? "min-h-[12rem] max-h-[min(38vh,20rem)]" : "min-h-[50vh] max-h-[58vh]"
        }`}
      >
        {booting ? (
          <div className="flex items-center justify-center gap-2 text-sm text-muted py-16">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading AI…
          </div>
        ) : messages.length === 0 ? (
          <div className={`text-center px-4 ${embedded ? "py-6" : "py-12"}`}>
            <Bot className="w-8 h-8 mx-auto text-[#007aff] mb-3" />
            <p className="text-sm font-medium">Ask about your finances</p>
            <p className="text-xs text-muted mt-1">
              Example: &quot;Update GreenDot to $600&quot;. Chats save, then delete after 30 days.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {QUICK_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={loading || booting}
                  onClick={() => {
                    void handleSend(prompt);
                  }}
                  className="rounded-full border border-black/10 dark:border-white/10 px-3 py-1.5 text-[11px] font-medium text-muted hover:border-[#007aff]/40 hover:text-[#007aff]"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  message.role === "user"
                    ? "bg-[#007aff] text-white whitespace-pre-wrap"
                    : "bg-black/[0.04] dark:bg-white/[0.06]"
                }`}
              >
                {message.role === "user" ? (
                  message.content
                ) : (
                  <AssistantMessageBody content={message.content} />
                )}
                {message.created_at ? (
                  <p
                    className={`mt-1 text-[10px] ${
                      message.role === "user" ? "text-white/70" : "text-muted"
                    }`}
                  >
                    {formatChatWhen(message.created_at)}
                  </p>
                ) : null}
              </div>
            </div>
          ))
        )}
        {loading && !pendingConfirm ? (
          <CouncilLayerAnimation
            active
            stage={councilStage}
            layers={layerStates}
            reviewed={reviewed}
            reviewReason={reviewReason}
          />
        ) : null}
        <div ref={bottomRef} />
      </div>

      {savedBanner ? (
        <div
          role="status"
          aria-live="polite"
          className="sticky bottom-0 z-20 rounded-xl bg-[#34c759]/15 border border-[#34c759]/30 px-3 py-2 text-[12px] text-[#34c759] text-center font-semibold backdrop-blur-md"
        >
          {savedBanner}
        </div>
      ) : pendingConfirm ? (
        <div
          role="region"
          aria-label="Confirm this money change"
          className="sticky bottom-0 z-20 rounded-xl bg-[#ff9500]/10 border border-[#ff9500]/25 px-3 py-2.5 space-y-2 backdrop-blur-md"
        >
          <p className="text-[11px] text-[#ff9500] text-center font-medium">
            {buildToolConfirmationPreview(pendingConfirm)}
            {pendingRest.length > 0 ? (
              <span className="mt-1 block text-[11px] text-muted">
                {pendingRest.length} more after this one.
              </span>
            ) : null}
          </p>
          {accountChoices.length > 0 ? (
            <div className="space-y-2">
              <p className="text-[11px] text-[#007aff] text-center font-medium">
                {accountChoicePrompt(pendingConfirm.name, accountChoiceKind)}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
              {accountChoices.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setPendingConfirm(withPickedAccount(pendingConfirm, account, accountChoiceKind));
                    setAccountChoices([]);
                  }}
                  className="min-h-11 rounded-full border border-black/10 dark:border-white/10 px-3.5 py-2 text-[12px] font-semibold"
                >
                  {account.name}
                </button>
              ))}
              </div>
            </div>
          ) : (
            <>
              {pendingConfirm.name === "record_expense" ? (
                <>
                  <div className="flex flex-wrap justify-center gap-2">
                    {EXPENSE_PERSON_CHIPS.map((chip) => {
                      const selected =
                        String(pendingConfirm.args.expense_for ?? "") === chip.id;
                      return (
                        <button
                          key={chip.id}
                          type="button"
                          disabled={loading}
                          onClick={() => {
                            setPendingConfirm({
                              ...pendingConfirm,
                              args: withExpensePerson(pendingConfirm.args, chip.id),
                            });
                          }}
                          className={`min-h-9 rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
                            selected
                              ? "border-[#007aff] bg-[#007aff]/15 text-[#007aff]"
                              : "border-black/10 dark:border-white/10"
                          }`}
                        >
                          {chip.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    {EXPENSE_PAID_BY_CHIPS.map((chip) => {
                      const selected = String(pendingConfirm.args.paid_by ?? "") === chip.id;
                      return (
                        <button
                          key={chip.id}
                          type="button"
                          disabled={loading}
                          onClick={() => {
                            setPendingConfirm({
                              ...pendingConfirm,
                              args: withPaidBy(pendingConfirm.args, chip.id),
                            });
                          }}
                          className={`min-h-9 rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
                            selected
                              ? "border-[#007aff] bg-[#007aff]/15 text-[#007aff]"
                              : "border-black/10 dark:border-white/10"
                          }`}
                        >
                          {chip.label}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : null}
              {pendingConfirm.name === "record_expense" &&
              !String(pendingConfirm.args.category ?? "").trim() ? (
                <div className="flex flex-wrap justify-center gap-2">
                  {allCategoryChips().map((category) => (
                    <button
                      key={category.id}
                      type="button"
                      disabled={loading}
                      onClick={() => {
                        setPendingConfirm({
                          ...pendingConfirm,
                          args: { ...pendingConfirm.args, category: category.name },
                        });
                      }}
                      className="min-h-11 rounded-full border border-black/10 dark:border-white/10 px-3.5 py-2 text-[12px] font-semibold"
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
                  disabled={loading}
                  onClick={() => void confirmPending()}
                  className="flex-1 min-h-11 rounded-lg bg-[#34c759] text-white py-2 text-[13px] font-semibold disabled:opacity-50"
                >
                  Yes, save
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setPendingConfirm(null);
                    setPendingRest([]);
                    void handleSend("No");
                  }}
                  className="flex-1 min-h-11 rounded-lg bg-black/5 dark:bg-white/10 text-foreground py-2 text-[13px] font-semibold disabled:opacity-50"
                >
                  No
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}

      {error ? (
        <div className="px-1">
          <p className="text-xs text-[#ff3b30]">{error}</p>
          {/failed|provider|unavailable|not configured|timed out|network/i.test(error) ? (
            <p className="mt-1 text-[11px] text-muted">
              The forms still work without Jarvis:{" "}
              <Link href="/spend" className="font-semibold text-[#007aff]">Spend</Link> ·{" "}
              <Link href="/flex" className="font-semibold text-[#007aff]">Flex block</Link> ·{" "}
              <Link href="/accounts" className="font-semibold text-[#007aff]">Income</Link> ·{" "}
              <Link href="/memory" className="font-semibold text-[#007aff]">Reminder</Link>
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (pendingConfirm && (!input.trim() || isShortAffirmation(input))) {
                setInput("");
                void confirmPending();
                return;
              }
              void handleSend();
            }
          }}
          placeholder={
            pendingConfirm ? "Tap Yes, save — or type Yes / No" : `Message ${assistantName}…`
          }
          className="glass flex-1 rounded-2xl px-4 py-3 text-sm outline-none"
          disabled={loading || booting}
        />
        <GlassButton
          type="button"
          onClick={() => void handleSend()}
          disabled={loading || booting || !input.trim()}
          className="shrink-0"
        >
          <Send className="w-4 h-4" />
        </GlassButton>
      </div>
    </>
  );

  if (embedded) {
    return <div className="space-y-3">{content}</div>;
  }

  return (
    <CompactPageShell
      title="AI Assistant"
      subtitle={`One AI for ${PERSON_LABELS.kushvanth} and ${PERSON_LABELS.g}`}
    >
      {content}
    </CompactPageShell>
  );
}
