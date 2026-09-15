import { NextResponse } from "next/server";
import { deletePushSubscription, upsertPushSubscription } from "@/lib/ai/chat-store";

export const dynamic = "force-dynamic";

/** A device registering (or withdrawing) itself for due-date pushes. */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      subscription?: { endpoint?: string } & Record<string, unknown>;
      person?: string;
    };
    if (!body.subscription?.endpoint) {
      return NextResponse.json({ ok: false, error: "No subscription." }, { status: 400 });
    }
    const person = body.person === "kushvanth" || body.person === "g" ? body.person : null;
    const saved = await upsertPushSubscription(
      body.subscription as { endpoint: string } & Record<string, unknown>,
      person
    );
    if (!saved) {
      return NextResponse.json(
        { ok: false, error: "The push_subscriptions table is not created yet." },
        { status: 503 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save the subscription.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as { endpoint?: string };
    if (body.endpoint) await deletePushSubscription(body.endpoint);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not remove the subscription.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
