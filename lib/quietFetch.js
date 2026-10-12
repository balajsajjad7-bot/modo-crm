"use client";
// Lets Modo's database sleep. Neon's free plan counts every hour the database is awake, and it only sleeps after
// 5 quiet minutes — but open Modo screens refresh every few seconds, even on a PC nobody is using overnight.
// So automatic refreshes (GET requests to /api) wait while the tab is hidden or nobody has touched the page for
// QUIET_MIN minutes, and run once the person is back. Anything the person does (saving, sending) is never held.
// Repeated refreshes of the same address while waiting share one request, so coming back doesn't flood the server.
const QUIET_MIN = 15;
let last = Date.now();
let waiters = [];
const shared = new Map();

const active = () => typeof document !== "undefined" && !document.hidden && Date.now() - last < QUIET_MIN * 60000;
const wake = () => { const w = waiters; waiters = []; w.forEach((go) => go()); };

export const isActive = active;
export function installQuietFetch() {
  if (typeof window === "undefined" || window.__modoQuiet) return;
  window.__modoQuiet = true;
  const real = window.fetch.bind(window);
  const poke = () => { const was = active(); last = Date.now(); if (!was && active()) wake(); };
  for (const ev of ["pointerdown", "keydown", "touchstart", "wheel", "mousemove", "scroll"]) window.addEventListener(ev, poke, { passive: true, capture: true });
  document.addEventListener("visibilitychange", () => { if (active()) wake(); });
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input?.url || "";
    const method = String(init?.method || (typeof input === "object" && input?.method) || "GET").toUpperCase();
    const path = url.startsWith(location.origin) ? url.slice(location.origin.length) : url;
    if (method !== "GET" || !path.startsWith("/api/") || active()) return real(input, init);
    // Held until the person is back; same address → one request, each caller gets its own copy.
    let p = shared.get(path);
    if (!p) {
      p = new Promise((go) => waiters.push(go)).then(() => { shared.delete(path); return real(input, init); });
      shared.set(path, p);
    }
    return p.then((r) => r.clone());
  };
}
