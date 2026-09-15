import { NextResponse } from "next/server";
import { assertAiUserId } from "@/lib/ai/person";
import {
  deleteAllUserChatSessions,
  deleteUserChatSession,
  listUserChatSessions,
} from "@/lib/ai/chat-store";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = assertAiUserId(searchParams.get("user_id"));

    const sessions = await listUserChatSessions(userId);
    return NextResponse.json({ ok: true, user_id: userId, sessions });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load sessions.",
      },
      { status: 400 }
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = assertAiUserId(searchParams.get("user_id"));
    const sessionId = searchParams.get("session_id");
    const deleteAll = searchParams.get("all") === "1";

    if (deleteAll) {
      await deleteAllUserChatSessions(userId);
      return NextResponse.json({ ok: true, user_id: userId, deleted: "all" });
    }

    if (!sessionId) {
      return NextResponse.json({ ok: false, error: "session_id is required." }, { status: 400 });
    }

    await deleteUserChatSession(sessionId, userId);
    return NextResponse.json({ ok: true, user_id: userId, session_id: sessionId });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to delete session.",
      },
      { status: 400 }
    );
  }
}
