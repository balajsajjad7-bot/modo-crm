"use client";
// Automatic attendance: live who's-in board, daily register with corrections, and auto clock-in/out + office detection settings.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "./api";
import { dur } from "@/lib/fmt";
import { Building2, Home, Coffee, Moon, LogOut, UserX, MonitorSmartphone, LocateFixed, Save, Pencil, Wifi, QrCode, KeyRound, Zap, ClipboardList, Fingerprint } from "lucide-react";

const ST = { working: ["In office / working", Building2], remote: ["Remote", Home], "on break": ["On break", Coffee], idle: ["Idle (no activity)", Moon], busy: ["Busy", Zap], away: ["Away", Moon], "clocked out": ["Clocked out", LogOut], "not in": ["Not in yet", UserX] };
const SRC = { login: ["signed in", KeyRound], auto: ["auto (opened CRM)", Zap], qr: ["QR at office", QrCode], kiosk: ["office kiosk", MonitorSmartphone], admin: ["set by admin", Pencil] };
const t = (d) => (d ? new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—");
const localDate = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };

export default function Attendance() {
  const [live, setLive] = useState(null); const [date, setDate] = useState(localDate()); const [day, setDay] = useState(null);
  const [s, setS] = useState(null); const [msg, setMsg] = useState(""); const [fix, setFix] = useState(null);
  const loadLive = useCallback(() => api("/api/presence").then((r) => r.ok && setLive(r.data)), []);
  const loadDay = useCallback(() => api("/api/attendance/day?date=" + date).then((r) => r.ok && setDay(r.data)), [date]);
  useEffect(() => { loadLive(); const i = setInterval(loadLive, 15000); return () => clearInterval(i); }, [loadLive]);
  useEffect(() => { loadDay(); }, [loadDay]);
  useEffect(() => { api("/api/settings").then((r) => r.ok && setS(r.data)); }, []);

  const counts = (live || []).reduce((m, a) => ({ ...m, [a.status]: (m[a.status] || 0) + 1 }), {});
  const here = () => navigator.geolocation?.getCurrentPosition((p) => setS({ ...s, officeLat: +p.coords.latitude.toFixed(6), officeLng: +p.coords.longitude.toFixed(6) }), () => setMsg("Location blocked. Allow it in the address bar."), { enableHighAccuracy: true });
  async function saveSettings() {
    setMsg("");
    const r = await api("/api/settings", "PATCH", { autoClockIn: s.autoClockIn, autoClockOut: s.autoClockOut, officeLat: s.officeLat, officeLng: s.officeLng, officeRadius: s.officeRadius });
    setMsg(r.ok ? "Attendance settings saved." : r.data.error);
  }
  async function saveFix() {
    const toISO = (hm) => hm ? new Date(`${fix.date}T${hm}`).toISOString() : null;
    let outISO = toISO(fix.out); if (outISO && fix.out < fix.in) outISO = new Date(new Date(outISO).getTime() + 86400000).toISOString(); // overnight
    const r = await api("/api/attendance/day", "POST", { userId: fix.id, date: fix.date, clockIn: toISO(fix.in), clockOut: outISO });
    if (!r.ok) return alert(r.data.error); setFix(null); loadDay(); loadLive();
  }

  return (
    <div className="stack">
      <div className="kpi-grid">
        {["working", "remote", "on break", "idle", "away", "busy", "clocked out", "not in"].map((k) => { const [l, I] = ST[k]; return (
          <div key={k} className="panel kpi"><div className="l row" style={{ gap: 6 }}><I size={14} />{l}</div><div className="v">{counts[k] || 0}</div></div>
        ); })}
      </div>

      <section className="panel stack">
        <div className="row" style={{ justifyContent: "space-between" }}><h2><Zap size={17} /> Right now</h2><Link href="/kiosk" className="btn-link"><MonitorSmartphone size={14} /> Open office kiosk</Link></div>
        <div className="who-grid">
          {(live || []).map((a) => { const [l] = ST[a.status]; const src = SRC[a.source]; return (
            <Link key={a.id} href={`/admin/agents/${a.id}`} className="panel who" style={{ textDecoration: "none", color: "var(--foreground)", background: "rgba(0,0,0,.25)" }}>
              <span className="sl-avatar" style={{ width: 40, height: 40, borderRadius: 12, background: "var(--grad)", fontSize: 14 }}>{a.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>
              <div style={{ minWidth: 0 }}>
                <b className="ellipsis" style={{ display: "block" }}>{a.name}</b>
                <span className={"st st-" + a.status.replace(/\s/g, "")}>{l}</span>
                <div className="small muted" style={{ marginTop: 4 }}>
                  {a.clockIn ? <>In {t(a.clockIn)}{a.lateSeconds ? <span className="due-over"> · {dur(a.lateSeconds)} late</span> : " · on time"}</> : `Shift ${a.shiftStart}`}
                  {a.clockOut && <> · out {t(a.clockOut)}{a.autoOut ? " (auto)" : ""}</>}
                </div>
                {src && <div className="small muted">via {src[0]}</div>}
                {a.awayReason && <div className="small" style={{ color: "var(--amber)" }}>{a.status === "idle" ? `idle since ${t(a.idleSince)}` : a.awayReason}</div>}
              </div>
            </Link>
          ); })}
        </div>
      </section>

      <section className="panel stack">
        <div className="row" style={{ justifyContent: "space-between" }}><h2><ClipboardList size={17} /> Register</h2><label style={{ maxWidth: 180 }}>Shift date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label></div>
        <div className="tablewrap"><table>
          <thead><tr><th>Agent</th><th>Clock in</th><th>Clock out</th><th>Late</th><th>Where</th><th>How</th><th></th></tr></thead>
          <tbody>{(day || []).map((a) => { const r = a.record; const src = r && SRC[r.source]; return (
            <tr key={a.id}>
              <td>{a.name}<div className="muted small">{a.agentId} · shift {a.shiftStart}</div></td>
              <td>{r ? t(r.clockIn) : <span className="muted">absent</span>}</td>
              <td>{r?.clockOut ? t(r.clockOut) + (r.autoOut ? " (auto)" : "") : r ? "still in" : "—"}</td>
              <td>{r ? (r.lateSeconds ? <span className="due-over">{dur(r.lateSeconds)}</span> : "on time") : "—"}</td>
              <td>{r?.location === "office" ? <span className="chip ok">office</span> : r?.location === "remote" ? <span className="chip late">remote</span> : "—"}</td>
              <td className="small muted">{src ? src[0] : "—"}</td>
              <td><button className="ghost sm" onClick={() => setFix({ id: a.id, name: a.name, date, in: r ? new Date(r.clockIn).toTimeString().slice(0, 5) : a.shiftStart, out: r?.clockOut ? new Date(r.clockOut).toTimeString().slice(0, 5) : "" })}><Pencil size={13} /> {r ? "Fix" : "Mark present"}</button></td>
            </tr>
          ); })}</tbody>
        </table></div>
        {fix && (
          <div className="panel stack" style={{ borderColor: "var(--accent)" }}>
            <b>{fix.name} · {fix.date}</b>
            <div className="form"><label>Clock in<input type="time" value={fix.in} onChange={(e) => setFix({ ...fix, in: e.target.value })} /></label><label>Clock out (optional)<input type="time" value={fix.out} onChange={(e) => setFix({ ...fix, out: e.target.value })} /></label></div>
            <p className="muted small" style={{ margin: 0 }}>Lateness and deductions are recalculated from the clock-in time.</p>
            <div className="row"><button onClick={saveFix}><Save size={15} /> Save</button><button className="ghost" onClick={() => setFix(null)}>Cancel</button></div>
          </div>
        )}
      </section>

      {s && (
        <section className="panel stack">
          <h2><Fingerprint size={17} /> Automatic attendance</h2>
          <div className="action-list">
            <div><div><b>Auto clock-in</b><div className="muted small">Opening the CRM during shift time clocks the agent in, even without signing in again.</div></div>
              <label className="row" style={{ color: "var(--foreground)" }}><input type="checkbox" style={{ width: "auto" }} checked={s.autoClockIn} onChange={(e) => setS({ ...s, autoClockIn: e.target.checked })} /> On</label></div>
            <div><div><b>Auto clock-out</b><div className="muted small">When every CRM tab has been closed (or the PC is off) for this long, the agent is clocked out at the last moment they were active.</div></div>
              <label className="row" style={{ color: "var(--foreground)", flexWrap: "nowrap" }}><input type="number" min="5" max="600" value={s.autoClockOut} onChange={(e) => setS({ ...s, autoClockOut: e.target.value })} style={{ maxWidth: 90 }} /> minutes</label></div>
            <div><div><b className="row" style={{ gap: 6 }}><Wifi size={15} /> Office Wi-Fi</b><div className="muted small">{s.officeIps ? `Office IPs: ${s.officeIps.split(/\s+/).join(", ")}` : "No office IP set yet."} Anyone on these counts as "in office". Set them in Settings.</div></div>
              <Link href="/admin/settings" className="btn-link">Settings</Link></div>
            <div><div><b className="row" style={{ gap: 6 }}><LocateFixed size={15} /> Office location (GPS)</b><div className="muted small">Laptops and phones within the radius count as in office. Stand in the office and tap "Use my location".</div></div>
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <input placeholder="Latitude" value={s.officeLat ?? ""} onChange={(e) => setS({ ...s, officeLat: e.target.value })} style={{ maxWidth: 120 }} />
                <input placeholder="Longitude" value={s.officeLng ?? ""} onChange={(e) => setS({ ...s, officeLng: e.target.value })} style={{ maxWidth: 120 }} />
                <input type="number" value={s.officeRadius} onChange={(e) => setS({ ...s, officeRadius: e.target.value })} style={{ maxWidth: 80 }} aria-label="Radius in metres" /><span className="small">m</span>
                <button className="ghost sm" onClick={here}><LocateFixed size={14} /> Use my location</button>
              </div></div>
            <div><div><b className="row" style={{ gap: 6 }}><QrCode size={15} /> Office kiosk</b><div className="muted small">Put a screen or tablet at the entrance. Agents scan the changing QR code with their phone, or type their ID. Scanning proves they're physically in the office.</div></div>
              <Link href="/kiosk" className="btn-link">Open kiosk</Link></div>
          </div>
          {msg && <div className="receipt">{msg}</div>}
          <div><button onClick={saveSettings}><Save size={15} /> Save attendance settings</button></div>
        </section>
      )}
    </div>
  );
}
