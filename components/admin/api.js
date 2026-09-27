"use client";
import { useEffect, useState, useCallback } from "react";

export const api = (url, method = "GET", body) => fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ ok: r.ok, data: await r.json() }));

export function usePoll(url, ms) {
  const [state, set] = useState({ data: null, error: null });
  const load = useCallback(() => api(url).then(({ ok, data }) => set(ok ? { data, error: null } : { data: null, error: data.error })), [url]);
  useEffect(() => { load(); if (!ms) return; const t = setInterval(load, ms); return () => clearInterval(t); }, [load, ms]);
  return [state, load];
}

