/*
 * KG Finance service worker.
 *
 * Only job: receive a push and show it, and bring the app forward when the
 * notification is tapped. No caching here — the app is online-first and a
 * stale copy of a finance screen is worse than no copy.
 *
 * Alarms and timed reminders arrive with Done and Snooze buttons. Those work
 * without opening the app: the worker tells the server, and any open copy of
 * the app is told to pick the change up. Tapping the notification itself
 * opens the app on the ringing screen.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/** Tell every open copy of the app something happened. */
function tellClients(message) {
  return self.clients
    .matchAll({ type: "window", includeUncontrolled: true })
    .then((clients) => clients.forEach((client) => client.postMessage(message)));
}

self.addEventListener("push", (event) => {
  let payload = { title: "KG Finance", body: "Something is due.", url: "/memory" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // A plain-text push still shows, with the default title.
    if (event.data) payload.body = event.data.text();
  }

  const options = {
    body: payload.body,
    icon: "/apple-icon.png",
    // The small status-bar icon on Android: a white lion, drawn from its alpha.
    badge: "/brand/badge.png",
    tag: payload.tag || "kg-due",
    renotify: !!payload.renotify,
    // An alarm stays on screen until it is handled.
    requireInteraction: !!payload.requireInteraction,
    data: { url: payload.url, id: payload.id, at: payload.at, kind: payload.kind },
  };
  if (Array.isArray(payload.actions)) options.actions = payload.actions;
  if (Array.isArray(payload.vibrate)) options.vibrate = payload.vibrate;

  event.waitUntil(
    self.registration
      .showNotification(payload.title, options)
      // An open app rings on screen as well, straight away.
      .then(() => (payload.id ? tellClients({ type: "kg-ring", id: payload.id }) : undefined))
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};

  // Done or Snooze, from the notification's own buttons.
  if ((event.action === "done" || event.action === "snooze") && data.id) {
    event.waitUntil(
      fetch("/api/reminders/act", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: data.id, action: event.action, at: data.at }),
      })
        .catch(() => undefined)
        .then(() => tellClients({ type: "kg-reminders-changed" }))
    );
    return;
  }

  const target = data.url || "/memory";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const client = clients.find((each) => "focus" in each);
      if (!client) return self.clients.openWindow(target);
      // Focus first, while the tap still counts as the user's. navigate() only
      // works on a page this worker controls; elsewhere the app is still brought
      // forward, and told which reminder to ring.
      return client.focus().then((focused) => {
        const win = focused || client;
        if (data.id) win.postMessage({ type: "kg-ring", id: data.id });
        return win.navigate(target).catch(() => win);
      });
    })
  );
});
