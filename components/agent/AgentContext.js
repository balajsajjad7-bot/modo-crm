"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { post, useIdleTracking } from "./sections";

const Ctx = createContext(null);
export const useAgent = () => useContext(Ctx);

// Loads the agent's shift once for all pages, ticks the clock, tracks idle time, and handles breaks.
export function AgentProvider({ children }) {
  const [me, setMe] = useState(null);
  const [now, setNow] = useState(Date.now());
  const load = useCallback(() => fetch("/api/attendance", { cache: "no-store" }).then((r) => r.json()).then((d) => setMe({ ...d, loadedAt: Date.now() })), []);
  useEffect(() => { load(); const t = setInterval(() => setNow(Date.now()), 1000); const r = setInterval(load, 60000); return () => { clearInterval(t); clearInterval(r); }; }, [load]);
  useIdleTracking(me?.idleAfter);
  const toggleBreak = async () => { await post("/api/breaks", { action: me?.breaks.open ? "end" : "start" }); await load(); };
  const finish = async (leaveCall) => { await leaveCall?.(); await post("/api/auth/logout"); location.href = "/"; };
  // Ending a shift is one simple step — no code or admin approval. (Shifts also end
  // automatically at shift start + shift hours; see autoCloseStale / shiftEndOut.)
  const endShift = async (leaveCall) => {
    if (!confirm("End your shift and sign out?")) return false;
    await post("/api/attendance").catch(() => {});
    await finish(leaveCall); return true;
  };
  return <Ctx.Provider value={{ me, now, reload: load, toggleBreak, endShift }}>{children}</Ctx.Provider>;
}
