"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, ChevronDown, ChevronUp, Keyboard, MessageSquarePlus, Mic, Sparkles, Trash2, X } from "lucide-react";
import { AiVoicePanel } from "@/components/assistant/ai-voice-panel";
import { AiProviderTeam } from "@/components/assistant/ai-provider-team";
import { AssistantMessageBody } from "@/components/assistant/assistant-message-body";
import { ConfirmWriteCard } from "@/components/assistant/confirm-write-card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { AssistantActivity, AssistantChat } from "@/components/assistant/use-assistant-chat";
import { formatChatWhen } from "@/lib/ai/chat-time";
import { applySpeakerToWrite, isShortAffirmation } from "@/lib/ai/infer-write-intent";
import { SPEAKER_CHIPS } from "@/lib/ai/person";
import type { AssistantVoiceGender } from "@/lib/ai/assistant-voice";
import { PERSON_LABELS } from "@/types";
import { cn } from "@/lib/utils";

/**
 * Where you talk to the assistant inside the workspace — the reference's
 * "Ask a question…" bar, with the conversation folded above it.
 *
 * Typing goes through the shared chat engine, so every money write still
 * stops at the confirm card. The chosen node rides along as context ("+ Food")
 * unless you take it off; AI Analysis asks about whatever is chosen. The mic
 * switches to the voice call, which reports what it hears and does to the map
 * the same way.
 */

export type ConversationMode = "text" | "voice";

export function WorkspaceConversation({
  chat,
  mode,
  onModeChange,
  assistantName,
  voiceGender,
  autoStartVoice,
  onAutoStartHandled,
  onVoiceBusy,
  onActivity,
  context,
  onAnalyse,
  expanded,
  onExpandedChange,
}: {
  chat: AssistantChat;
  mode: ConversationMode;
  onModeChange: (mode: ConversationMode) => void;
  assistantName: string;
  voiceGender: AssistantVoiceGender;
  autoStartVoice: boolean;
  onAutoStartHandled: () => void;
  onVoiceBusy: (busy: boolean) => void;
  onActivity: (activity: AssistantActivity) => void;
  /** The chosen node, offered as context for the next question. */
  context: { label: string; about: string } | null;
  onAnalyse: () => void;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}) {
  const [withContext, setWithContext] = useState(true);
  const [teamOpen, setTeamOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const { messages, input, loading, booting, error, pendingConfirm, speaker, sessions, sessionId } = chat;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [messages, loading, expanded]);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    // The node rides along in plain words, so the question is clear in the
    // saved conversation too, not just on this screen.
    const question = withContext && context && !text.toLowerCase().includes(context.label.toLowerCase())
      ? `${text} (about ${context.about})`
      : text;
    void chat.handleSend(question);
  };

  const shown = expanded ? messages : messages.slice(-2);

  if (mode === "voice") {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[12px] font-medium text-[#e3e8eb]/80">Talking to {assistantName}</p>
          <button
            type="button"
            onClick={() => onModeChange("text")}
            className="inline-flex items-center gap-1 rounded-full border border-[var(--ws-edge)] px-2.5 py-1 text-[11px] font-semibold text-[#e3e8eb]/75 hover:text-[#e3e8eb]"
          >
            <Keyboard className="h-3.5 w-3.5" /> Type instead
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          <AiVoicePanel
            assistantName={assistantName}
            voiceGender={voiceGender}
            autoStart={autoStartVoice}
            onAutoStartHandled={onAutoStartHandled}
            onLiveChange={onVoiceBusy}
            onActivity={onActivity}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <ConfirmDialog
        open={chat.pendingChatDelete !== null}
        title={chat.pendingChatDelete === "all" ? "Delete all chats?" : "Delete this chat?"}
        message={
          chat.pendingChatDelete === "all"
            ? "Every saved text conversation will be removed. Your money records are not affected."
            : "This conversation will be removed. Your money records are not affected."
        }
        confirmLabel={chat.pendingChatDelete === "all" ? "Delete all" : "Delete chat"}
        onConfirm={() => {
          if (chat.pendingChatDelete === "all") void chat.handleClearHistory();
          else if (chat.pendingChatDelete) {
            const id = chat.pendingChatDelete;
            chat.setPendingChatDelete(null);
            void chat.handleDeleteSession(id);
          }
        }}
        onCancel={() => chat.setPendingChatDelete(null)}
      />

      {/* The conversation, folded to its last exchange until opened. */}
      {messages.length > 0 || loading ? (
        <div className="ws-panel flex min-h-0 flex-col rounded-2xl">
          <div className="flex items-center justify-between gap-2 px-3 pt-2">
            <button
              type="button"
              onClick={() => onExpandedChange(!expanded)}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#e3e8eb]/70 hover:text-[#e3e8eb]"
              aria-expanded={expanded}
            >
              {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
              Conversation · {messages.length}
            </button>
            <div className="flex items-center gap-1">
              {expanded && sessions.length > 1 ? (
                <select
                  value={sessionId ?? ""}
                  onChange={(event) => chat.openSession(event.target.value)}
                  className="max-w-[9rem] rounded-md bg-[#e3e8eb]/8 px-1.5 py-0.5 text-[10px] text-[#e3e8eb]/80 outline-none"
                  aria-label="Earlier conversations"
                >
                  {sessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {session.title ?? "Chat"} · {formatChatWhen(session.updated_at || session.created_at)}
                    </option>
                  ))}
                </select>
              ) : null}
              {expanded ? (
                <button
                  type="button"
                  onClick={() => chat.setPendingChatDelete("all")}
                  className="rounded-md p-1 text-[#e3e8eb]/55 hover:text-[var(--ws-bad)]"
                  aria-label="Delete all text chats"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void chat.handleNewChat()}
                className="rounded-md p-1 text-[#e3e8eb]/55 hover:text-[#e3e8eb]"
                aria-label="New chat"
              >
                <MessageSquarePlus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div
            className={cn("space-y-2 overflow-y-auto px-3 pb-2 pt-1.5", expanded ? "max-h-[44dvh]" : "max-h-32")}
            data-lenis-prevent
          >
            {shown.map((message) => (
              <div key={message.id} className={cn("flex", message.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[88%] rounded-2xl px-3 py-1.5 text-[13px] leading-relaxed",
                    // Folded: two lines each. The full answer is in AI analysis above, or one tap away.
                    !expanded && "max-h-[3.4em] overflow-hidden",
                    message.role === "user"
                      ? "bg-[var(--ws-gold)]/18 text-[#f3e6c8] whitespace-pre-wrap"
                      : "bg-[#e3e8eb]/6 text-[#e3e8eb]/90"
                  )}
                >
                  {message.role === "user" ? message.content : <AssistantMessageBody content={message.content} />}
                </div>
              </div>
            ))}
            {loading && !pendingConfirm ? (
              <div className="ws-shimmer h-6 w-40 rounded-full" aria-label={`${assistantName} is thinking`} />
            ) : null}
            <div ref={bottomRef} />
          </div>
        </div>
      ) : null}

      <ConfirmWriteCard chat={chat} />

      {/* Money writes carry a person: say who is talking — asked only when a write needs it. */}
      {pendingConfirm || (error && /who am i talking|who paid/i.test(error)) ? (
        <div className="flex flex-wrap items-center gap-1.5 px-1">
          <span className="text-[10px] uppercase tracking-wide text-[#e3e8eb]/50">
            {speaker ? `Talking to ${PERSON_LABELS[speaker]}` : "Who's asking?"}
          </span>
          {SPEAKER_CHIPS.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={() => {
                chat.setSpeaker(chip.id);
                chat.setError(null);
                if (pendingConfirm) chat.setPendingConfirm(applySpeakerToWrite(pendingConfirm, chip.id));
              }}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                speaker === chip.id
                  ? "border-[var(--ws-gold)] bg-[var(--ws-gold)]/15 text-[#f3d9a4]"
                  : "border-[var(--ws-edge)] text-[#e3e8eb]/75"
              )}
            >
              {chip.label}
            </button>
          ))}
        </div>
      ) : null}

      {error ? <p className="px-1 text-[12px] text-[var(--ws-bad)]">{error}</p> : null}

      <div className="rounded-[22px] border border-[var(--ws-edge)] bg-[#0b1514]/80 p-1.5 shadow-[0_0_40px_rgba(90,209,192,0.12)]">
        <div className="flex items-center gap-2 rounded-2xl bg-[#e3e8eb] px-3 py-1.5">
          <input
            value={input}
            onChange={(event) => chat.setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (pendingConfirm && (!input.trim() || isShortAffirmation(input))) {
                  chat.setInput("");
                  void chat.confirmPending();
                  return;
                }
                send();
              }
            }}
            placeholder={pendingConfirm ? "Tap Yes, save — or type Yes / No" : "Ask a question…"}
            className="min-w-0 flex-1 bg-transparent py-1.5 text-[14px] text-[#0b1514] outline-none placeholder:text-[#4a5452]"
            disabled={booting}
            aria-label={`Ask ${assistantName}`}
          />
          <button
            type="button"
            onClick={send}
            disabled={loading || booting || !input.trim()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0b1514] text-[#e3e8eb] disabled:opacity-40"
            aria-label="Send"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 px-0.5">
          <div className="relative">
            <button
              type="button"
              onClick={() => setTeamOpen((open) => !open)}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#e3e8eb]/8 px-2.5 py-1 text-[12px] font-medium text-[#e3e8eb]/85 hover:bg-[#e3e8eb]/14"
              aria-expanded={teamOpen}
            >
              <span className="h-2 w-2 rounded-full bg-[var(--ws-teal)]" /> {assistantName}
              <ChevronDown className="h-3 w-3 opacity-70" />
            </button>
            {teamOpen ? (
              <div className="ws-panel absolute bottom-9 left-0 z-30 w-72 rounded-xl p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[11px] font-semibold text-[#e3e8eb]/80">Who answers</p>
                  <button type="button" onClick={() => setTeamOpen(false)} aria-label="Close" className="text-[#e3e8eb]/60">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <AiProviderTeam />
              </div>
            ) : null}
          </div>
          {context ? (
            <button
              type="button"
              onClick={() => setWithContext((on) => !on)}
              aria-pressed={withContext}
              title={withContext ? "Your question will mention this" : "Ask without it"}
              className={cn(
                "inline-flex max-w-[12rem] items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-medium",
                withContext ? "bg-[var(--ws-gold)]/16 text-[#f3d9a4]" : "bg-[#e3e8eb]/6 text-[#e3e8eb]/50 line-through"
              )}
            >
              <span className="truncate">+ {context.label}</span>
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onModeChange("voice")}
            className="inline-flex items-center gap-1 rounded-full bg-[#e3e8eb]/8 px-2.5 py-1 text-[12px] font-medium text-[#e3e8eb]/85 hover:bg-[#e3e8eb]/14"
          >
            <Mic className="h-3.5 w-3.5" /> Talk
          </button>
          <button
            type="button"
            onClick={onAnalyse}
            disabled={loading}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[#e3e8eb]/8 px-2.5 py-1 text-[12px] font-medium text-[#e3e8eb]/85 hover:bg-[#e3e8eb]/14 disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5 text-[var(--ws-gold)]" /> AI Analysis
          </button>
        </div>
      </div>
    </div>
  );
}
