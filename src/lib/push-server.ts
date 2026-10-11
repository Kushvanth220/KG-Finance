import webpush from "web-push";
import { deletePushSubscription, type PushSubscriptionRow } from "@/lib/ai/chat-store";

/**
 * What the push routes share: who may call them, and sending one payload to
 * the devices it is for.
 */

/** The timers (Vercel's cron, the Supabase timer) send `Bearer CRON_SECRET`. */
export function authorisedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/** Set up web-push; false when the keys aren't configured. */
export function configurePush(): boolean {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:hello@example.com", publicKey, privateKey);
  return true;
}

/** A device set to one person hears that person's things and the shared ones. */
export const deviceWants = (devicePerson: string | null, itemPerson: string | null | undefined) =>
  !devicePerson || !itemPerson || devicePerson === itemPerson;

/**
 * Send to every device that wants it. A device the browser has dropped (404 or
 * 410) is forgotten so it isn't tried again.
 */
export async function sendToDevices(
  subscriptions: PushSubscriptionRow[],
  payload: Record<string, unknown>,
  person: string | null | undefined,
  ttlSeconds: number
): Promise<{ sent: number; pruned: number }> {
  let sent = 0;
  let pruned = 0;
  const body = JSON.stringify(payload);
  for (const sub of subscriptions) {
    if (!deviceWants(sub.person, person)) continue;
    try {
      await webpush.sendNotification(sub.subscription as unknown as webpush.PushSubscription, body, {
        TTL: ttlSeconds,
        urgency: "high",
      });
      sent += 1;
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        await deletePushSubscription(sub.endpoint);
        pruned += 1;
      }
    }
  }
  return { sent, pruned };
}
