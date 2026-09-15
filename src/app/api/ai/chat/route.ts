import { NextResponse } from "next/server";
import { assertAiUserId, parseAiUserId } from "@/lib/ai/person";
import {
  appendChatMessage,
  createUserChatSession,
  deleteExpiredChatSessions,
  getSessionForUser,
  listSessionMessages,
} from "@/lib/ai/chat-store";
import { resolveWorkspaceFinanceContext } from "@/lib/ai/resolve-finance-context";
import {
  continueCouncilWithToolResults,
  generateCouncilReply,
  type CouncilProgress,
} from "@/lib/ai/council";
import type { GeminiToolResponseInput } from "@/lib/ai/gemini-client";
import type { Part } from "@google/generative-ai";
import type { FinanceState } from "@/types";
import { ENGLISH_ONLY_REPLY, looksNonEnglish } from "@/lib/ai/live-transcript";

export const dynamic = "force-dynamic";

interface ChatRequestBody {
  user_id?: string;
  message?: string;
  session_id?: string;
  assistant_name?: string;
  finance_state?: FinanceState;
  behavior_instructions?: string[];
  rules?: string[];
  reminders?: string[];
  speaking_with?: string;
  /** Opt out of the NDJSON progress stream and get one plain JSON body back. */
  stream?: boolean;
  tool_continuation?: {
    user_message: string;
    model_parts: Part[];
    tool_responses: GeminiToolResponseInput[];
  };
}

type ChatResult = { status: number; payload: Record<string, unknown> };

/** Runs one chat turn, reporting council progress as it happens. */
async function runChat(
  body: ChatRequestBody,
  progress: CouncilProgress
): Promise<ChatResult> {
  const userId = assertAiUserId(body.user_id);
  const continuation = body.tool_continuation;

  // 30-day retention cleanup — housekeeping, so don't make the reply wait on it.
  void deleteExpiredChatSessions(userId).catch((error) =>
    console.warn("[chat] session cleanup failed:", error)
  );

  // Doesn't depend on the session, so build it while the session resolves.
  const financeContextPromise = resolveWorkspaceFinanceContext(body.finance_state, true);
  // Keep an early return below from leaving this rejection unhandled.
  financeContextPromise.catch(() => {});

  let sessionId = body.session_id;
  if (!sessionId && !continuation) {
    const created = await createUserChatSession(userId);
    sessionId = created.id;
  } else if (sessionId) {
    const existing = await getSessionForUser(sessionId, userId);
    if (!existing) {
      return {
        status: 404,
        payload: { ok: false, error: "Session not found for this user." },
      };
    }
  } else if (!sessionId) {
    return {
      status: 400,
      payload: { ok: false, error: "session_id is required for tool continuation." },
    };
  }

  const [financeContext, priorMessages] = await Promise.all([
    financeContextPromise,
    listSessionMessages(sessionId!, userId),
  ]);
  const history = priorMessages.map((entry) => ({
    role: entry.role,
    content: entry.content,
  }));

  const assistantName = body.assistant_name?.trim();
  const behaviorInstructions = Array.isArray(body.behavior_instructions)
    ? body.behavior_instructions
    : [];
  const reminders = Array.isArray(body.reminders) ? body.reminders : [];
  const rules = Array.isArray(body.rules) ? body.rules : [];
  const speakingWith = parseAiUserId(body.speaking_with);

  if (continuation) {
    const outcome = await continueCouncilWithToolResults({
      userId,
      financeContext,
      assistantName,
      behaviorInstructions,
      reminders,
      rules,
      speakingWith,
      history,
      message: continuation.user_message,
      userMessage: continuation.user_message,
      modelParts: continuation.model_parts,
      toolResponses: continuation.tool_responses,
      progress,
    });

    if (outcome.kind === "tool_calls") {
      return {
        status: 200,
        payload: {
          ok: true,
          user_id: userId,
          session_id: sessionId,
          needs_tools: true,
          tool_calls: outcome.toolCalls,
          model_parts: outcome.modelParts,
          user_message: continuation.user_message,
          providers: outcome.providers,
        },
      };
    }

    const saved = await appendChatMessage(sessionId!, userId, "model", outcome.reply);
    return {
      status: 200,
      payload: {
        ok: true,
        user_id: userId,
        session_id: sessionId,
        reply: outcome.reply,
        message: saved,
        providers: outcome.providers,
      },
    };
  }

  const message = body.message?.trim();
  if (!message) {
    return { status: 400, payload: { ok: false, error: "message is required." } };
  }

  await appendChatMessage(sessionId!, userId, "user", message);

  if (looksNonEnglish(message)) {
    const saved = await appendChatMessage(sessionId!, userId, "model", ENGLISH_ONLY_REPLY);
    return {
      status: 200,
      payload: {
        ok: true,
        user_id: userId,
        session_id: sessionId,
        reply: ENGLISH_ONLY_REPLY,
        message: saved,
      },
    };
  }

  const outcome = await generateCouncilReply({
    userId,
    financeContext,
    assistantName,
    behaviorInstructions,
    reminders,
    rules,
    speakingWith,
    history,
    message,
    progress,
  });

  if (outcome.kind === "tool_calls") {
    return {
      status: 200,
      payload: {
        ok: true,
        user_id: userId,
        session_id: sessionId,
        needs_tools: true,
        tool_calls: outcome.toolCalls,
        model_parts: outcome.modelParts,
        user_message: message,
        providers: outcome.providers,
      },
    };
  }

  const saved = await appendChatMessage(sessionId!, userId, "model", outcome.reply);

  return {
    status: 200,
    payload: {
      ok: true,
      user_id: userId,
      session_id: sessionId,
      reply: outcome.reply,
      message: saved,
      providers: outcome.providers,
    },
  };
}

function errorStatus(message: string): number {
  return message.includes("GEMINI_API_KEY") ||
    message.includes("OPENAI_API_KEY") ||
    message.includes("ANTHROPIC_API_KEY") ||
    message.includes("No AI provider")
    ? 503
    : 400;
}

export async function POST(request: Request) {
  let body: ChatRequestBody;
  try {
    body = (await request.json()) as ChatRequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  // Callers that just want the answer can skip the progress stream.
  if (body.stream === false) {
    try {
      const { status, payload } = await runChat(body, {});
      return NextResponse.json(payload, { status });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Chat request failed.";
      return NextResponse.json({ ok: false, error: message }, { status: errorStatus(message) });
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: Record<string, unknown>) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          closed = true;
        }
      };

      send({ type: "stage", stage: "input" });

      const progress: CouncilProgress = {
        onStage: (stage) => send({ type: "stage", stage }),
        onLayer: (id, status, meta) =>
          send({ type: "layer", id, status, ms: meta?.ms, role: meta?.role }),
        onCascade: (info) =>
          send({ type: "cascade", reviewed: info.reviewed, reason: info.reason }),
      };

      try {
        const { status, payload } = await runChat(body, progress);
        send({ type: "done", status, payload });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Chat request failed.";
        send({
          type: "done",
          status: errorStatus(message),
          payload: { ok: false, error: message },
        });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
