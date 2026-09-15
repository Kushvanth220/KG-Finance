import { NextResponse } from "next/server";
import { assertAiUserId } from "@/lib/ai/person";
import {
  appendChatMessage,
  createUserChatSession,
  deleteExpiredChatSessions,
  getSessionForUser,
  listSessionMessages,
} from "@/lib/ai/chat-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = assertAiUserId(searchParams.get("user_id"));
    const sessionId = searchParams.get("session_id");

    if (!sessionId) {
      return NextResponse.json({ ok: false, error: "session_id is required." }, { status: 400 });
    }

    const messages = await listSessionMessages(sessionId, userId);
    return NextResponse.json({ ok: true, user_id: userId, session_id: sessionId, messages });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load messages.",
      },
      { status: 400 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      user_id?: string;
      session_id?: string;
      title?: string;
      role?: string;
      content?: string;
    };
    const userId = assertAiUserId(body.user_id);
    const role = body.role === "model" ? "model" : body.role === "user" ? "user" : null;
    const content = body.content?.trim();

    if (!role || !content) {
      return NextResponse.json(
        { ok: false, error: "role and content are required." },
        { status: 400 }
      );
    }

    await deleteExpiredChatSessions(userId);

    let sessionId = body.session_id?.trim();
    if (sessionId) {
      const existing = await getSessionForUser(sessionId, userId);
      if (!existing) {
        sessionId = undefined;
      }
    }
    if (!sessionId) {
      const created = await createUserChatSession(userId, body.title?.trim() || "Voice chat");
      sessionId = created.id;
    }

    const message = await appendChatMessage(sessionId, userId, role, content);
    return NextResponse.json({
      ok: true,
      user_id: userId,
      session_id: sessionId,
      message,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to save message.",
      },
      { status: 400 }
    );
  }
}
