"use client";
import { useEffect, useState, useCallback } from "react";

export const api = (url, method = "GET", body) => fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ ok: r.ok, data: await r.json() }));

export function usePoll(url, ms) {
  const [state, set] = useState({ data: null, error: null });
  const load = useCallback(() => url && api(url).then(({ ok, data }) => set(ok ? { data, error: null } : { data: null, error: data.error })).catch(() => {}), [url]);
  useEffect(() => {
    if (!url) return;
    load();
    if (!ms) return;
    // Only poll while the tab is visible — a hidden tab shouldn't hammer the server or re-render.
    const t = setInterval(() => { if (typeof document === "undefined" || !document.hidden) load(); }, ms);
    const onVis = () => { if (!document.hidden) load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); };
  }, [load, ms, url]);
  return [state, load];
}

