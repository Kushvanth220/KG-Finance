import { GET as tickRoute } from "@/app/api/push/tick/route";

/**
 * In development, the every-minute alarm timer.
 *
 * In production a Supabase job calls /api/push/tick once a minute
 * (supabase/alarm-timer.sql). It cannot reach a laptop's dev server, so
 * without this nothing rings while the app is closed during development: the
 * alarm only shows once the app is opened again. Imported only by
 * instrumentation.ts, and only in development.
 */

const state = globalThis as { kgAlarmTimer?: boolean };

if (!state.kgAlarmTimer) {
  state.kgAlarmTimer = true;

  const tick = () =>
    tickRoute(
      new Request("http://localhost/api/push/tick", {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ""}` },
      })
    ).catch((error: unknown) => console.error("[alarm timer]", error));

  console.log("[alarm timer] checking for alarms every minute (development stand-in for the Supabase timer)");
  // A couple of seconds after each minute turns, like the real timer.
  setTimeout(() => {
    void tick();
    setInterval(() => void tick(), 60_000);
  }, 62_000 - (Date.now() % 60_000));
}
