/*
 * KG Finance service worker.
 *
 * Only job: receive a push and show it, and bring the app forward when the
 * notification is tapped. No caching here — the app is online-first and a
 * stale copy of a finance screen is worse than no copy.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = { title: "KG Finance", body: "Something is due.", url: "/memory" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // A plain-text push still shows, with the default title.
    if (event.data) payload.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/apple-icon.png",
      badge: "/icon.svg",
      tag: payload.tag || "kg-due",
      renotify: false,
      data: { url: payload.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/memory";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});
