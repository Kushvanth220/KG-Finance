/**
 * Runs once when the server starts. In development it stands in for the
 * every-minute alarm timer (see lib/dev-alarm-timer.ts). The import sits
 * behind the runtime check so the edge build never pulls in its Node-only
 * push code.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "development") {
    await import("@/lib/dev-alarm-timer");
  }
}
