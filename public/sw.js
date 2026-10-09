// CRM Modo push service worker (v3) — shows alerts even when Modo isn't open.
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
    data: { url: d.url || "/login" },
    icon: "/icon-192.png",
    badge: "/favicon-32.png",
    vibrate: [120, 60, 120],
    requireInteraction: !!d.urgent,
  }));
});

// Tapping a notification opens Modo on the right page — whether Modo is open, in the background or closed.
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const target = new URL((e.notification.data && e.notification.data.url) || "/login", self.location.origin).href;
  e.waitUntil((async () => {
    const cs = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const mine = cs.filter((c) => c.url && c.url.startsWith(self.location.origin));
    const win = mine.find((c) => c.focused) || mine[0];
    if (win) {
      try { await win.focus(); } catch (_) {}
      // Move that window to the page; an older window this worker doesn't control gets a message instead.
      try { if (win.navigate) { await win.navigate(target); return; } } catch (_) {}
      try { win.postMessage({ type: "modo-open", url: target }); return; } catch (_) {}
    }
    try { await self.clients.openWindow(target); } catch (_) {}
  })());
});
