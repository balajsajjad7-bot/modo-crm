"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { post, useIdleTracking } from "./sections";
import EndShiftDialog from "./EndShiftDialog";

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
  const [endDlg, setEndDlg] = useState(null); // { leaveCall }
  const finish = async (leaveCall) => { await leaveCall?.(); await post("/api/auth/logout"); location.href = "/"; };
  const endShift = async (leaveCall) => {
    const st = await fetch("/api/shift-end", { cache: "no-store" }).then((r) => r.json()).catch(() => ({}));
    if (st.early) { setEndDlg({ leaveCall }); return false; } // shift not over: approval needed
    if (!confirm("End your shift and sign out?")) return false;
    const r = await post("/api/attendance");
    if (r.status === 403) { setEndDlg({ leaveCall }); return false; }
    await finish(leaveCall); return true;
  };
  return <Ctx.Provider value={{ me, now, reload: load, toggleBreak, endShift }}>{children}{endDlg && <EndShiftDialog onClose={() => setEndDlg(null)} onDone={() => finish(endDlg.leaveCall)} />}</Ctx.Provider>;
}
