// CRM Modo push service worker — shows alerts even when Modo isn't open.
self.addEventListener("install", (e) => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { title: "CRM Modo", body: e.data && e.data.text ? e.data.text() : "" }; }
  const title = d.title || "CRM Modo";
  e.waitUntil(self.registration.showNotification(title, {
    body: d.body || "",
    tag: d.tag || undefined,
    renotify: !!d.tag,
    data: { url: d.url || "/" },
    vibrate: [120, 60, 120],
    requireInteraction: !!d.urgent,
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    for (const c of cs) { if ("focus" in c) { if (c.navigate) c.navigate(url); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
