"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { Bot, Loader2, MessageSquarePlus, Send, Trash2 } from "lucide-react";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassCard } from "@/components/ui/glass-card";
import { CompactPageShell } from "@/components/ui/compact-page-shell";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { DEFAULT_ASSISTANT_NAME } from "@/store/assistant-preferences-store";
import { AssistantMessageBody } from "@/components/assistant/assistant-message-body";
import { CouncilLayerAnimation } from "@/components/assistant/council-layer-animation";
import { ConfirmWriteCard } from "@/components/assistant/confirm-write-card";
import { useAssistantChat, type AssistantActivity } from "@/components/assistant/use-assistant-chat";
import { formatChatWhen } from "@/lib/ai/chat-time";
import { PERSON_LABELS } from "@/types";
import { SPEAKER_CHIPS } from "@/lib/ai/person";
import { applySpeakerToWrite, isShortAffirmation } from "@/lib/ai/infer-write-intent";

/**
 * The text assistant as a chat: sessions, messages, the confirm card, and a
 * box to type in. The engine — every rule about what may be saved — is in
 * useAssistantChat; this file is only how it looks.
 */

interface AiChatPanelProps {
  assistantName?: string;
  embedded?: boolean;
  onActivity?: (activity: AssistantActivity) => void;
}

const QUICK_PROMPTS = [
  "What did we spend today?",
  "What's the GreenDot balance?",
  "Any reminders due?",
] as const;

export function AiChatPanel({
  assistantName = DEFAULT_ASSISTANT_NAME,
  embedded = false,
  onActivity,
}: AiChatPanelProps) {
  const chat = useAssistantChat({ assistantName, onActivity });
  const bottomRef = useRef<HTMLDivElement>(null);
  const {
    speaker,
    sessions,
    sessionId,
    messages,
    input,
    loading,
    booting,
    error,
    pendingChatDelete,
    councilStage,
    layerStates,
    reviewed,
    reviewReason,
    pendingConfirm,
  } = chat;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

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
            void chat.handleClearHistory();
          } else if (pendingChatDelete) {
            const id = pendingChatDelete;
            chat.setPendingChatDelete(null);
            void chat.handleDeleteSession(id);
          }
        }}
        onCancel={() => chat.setPendingChatDelete(null)}
      />

      <GlassCard className="!p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs text-muted">
            <Bot className="w-4 h-4 text-accent" />
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
                onClick={() => chat.setPendingChatDelete("all")}
                aria-label="Delete all text chats"
              >
                <Trash2 className="w-4 h-4" />
                {embedded ? null : "Delete history"}
              </GlassButton>
            ) : null}
            <GlassButton type="button" variant="ghost" size="sm" onClick={chat.handleNewChat} aria-label="New chat">
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
                  chat.setSpeaker(chip.id);
                  chat.setError(null);
                  if (pendingConfirm) {
                    chat.setPendingConfirm(applySpeakerToWrite(pendingConfirm, chip.id));
                  }
                }}
                className={`min-h-8 rounded-full border px-3 py-1 text-[11px] font-semibold ${
                  selected
                    ? "border-accent bg-accent/15 text-accent"
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
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-black/5 dark:border-white/10"
                }`}
              >
                <button type="button" onClick={() => chat.openSession(session.id)} className="max-w-[9rem] text-left">
                  <span className="block truncate">{session.title ?? "Chat"}</span>
                  <span className="block text-[9px] opacity-70">
                    {formatChatWhen(session.updated_at || session.created_at)}
                  </span>
                </button>
                <button
                  type="button"
                  aria-label="Delete this chat"
                  onClick={() => chat.setPendingChatDelete(session.id)}
                  className="text-muted hover:text-negative text-sm leading-none"
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
            <Bot className="w-8 h-8 mx-auto text-accent mb-3" />
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
                    void chat.handleSend(prompt);
                  }}
                  className="rounded-full border border-black/10 dark:border-white/10 px-3 py-1.5 text-[11px] font-medium text-muted hover:border-accent/40 hover:text-accent"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  message.role === "user" ? "glass-pill whitespace-pre-wrap" : "bg-black/[0.04] dark:bg-white/[0.06]"
                }`}
              >
                {message.role === "user" ? message.content : <AssistantMessageBody content={message.content} />}
                {message.created_at ? (
                  <p className={`mt-1 text-[10px] ${message.role === "user" ? "text-white/70" : "text-muted"}`}>
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

      <ConfirmWriteCard chat={chat} />

      {error ? (
        <div className="px-1">
          <p className="text-xs text-negative">{error}</p>
          {/failed|provider|unavailable|not configured|timed out|network/i.test(error) ? (
            <p className="mt-1 text-[11px] text-muted">
              The forms still work without {assistantName}:{" "}
              <Link href="/spend" className="font-semibold text-accent">Spend</Link> ·{" "}
              <Link href="/flex" className="font-semibold text-accent">Flex block</Link> ·{" "}
              <Link href="/accounts" className="font-semibold text-accent">Income</Link> ·{" "}
              <Link href="/memory" className="font-semibold text-accent">Reminder</Link>
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="flex gap-2">
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
              void chat.handleSend();
            }
          }}
          placeholder={pendingConfirm ? "Tap Yes, save — or type Yes / No" : `Message ${assistantName}…`}
          className="glass flex-1 rounded-2xl px-4 py-3 text-sm outline-none"
          disabled={loading || booting}
        />
        <GlassButton
          type="button"
          onClick={() => void chat.handleSend()}
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
    <CompactPageShell title="AI Assistant" subtitle={`One AI for ${PERSON_LABELS.kushvanth} and ${PERSON_LABELS.g}`}>
      {content}
    </CompactPageShell>
  );
}
