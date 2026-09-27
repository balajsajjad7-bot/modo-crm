"use client";
// Team → Shifts: edit everyone's shift times in one place; automatic clock-out when a shift ends.
import { useEffect, useState } from "react";
import { api } from "./api";
import { Clock, Save, CheckSquare } from "lucide-react";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const t = (d) => new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
const endOf = (start, hours) => { const [h, m] = start.split(":").map(Number); const mins = (h * 60 + m + Math.round(hours * 60)) % 1440; return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}${h * 60 + m + hours * 60 >= 1440 ? " (next day)" : ""}`; };

export default function Shifts() {
  const [d, setD] = useState(null); const [edits, setEdits] = useState({}); const [sel, setSel] = useState([]); const [bulk, setBulk] = useState({ shiftStart: "", shiftHours: "", graceMinutes: "" }); const [msg, setMsg] = useState("");
  const load = () => api("/api/shifts").then((r) => r.ok && setD(r.data));
  useEffect(() => { load(); }, []);
  if (!d) return <p className="muted">Loading shifts…</p>;
  const row = (a) => ({ ...a, ...(edits[a.id] || {}) });
  const set = (id, k, v) => setEdits((e) => ({ ...e, [id]: { ...(e[id] || {}), [k]: v } }));
  const save = async (a) => { const e = edits[a.id]; if (!e) return; const r = await api("/api/shifts", "PATCH", { ids: [a.id], ...e }); setMsg(r.ok ? `${a.name}'s shift saved.` : r.data.error); if (r.ok) { setEdits((x) => { const n = { ...x }; delete n[a.id]; return n; }); load(); } };
  const applyBulk = async () => { const r = await api("/api/shifts", "PATCH", { ids: sel, ...bulk }); setMsg(r.ok ? `Updated ${r.data.updated} agents.` : r.data.error); if (r.ok) { setSel([]); load(); } };
  const setting = async (patch) => { await api("/api/settings", "PATCH", patch); load(); };
  return (
    <div className="stack">
      <section className="panel stack">
        <h2><Clock size={17} /> When a shift ends</h2>
        <div className="action-list">
          <div><div><b>Clock agents out automatically at the end of their shift</b><div className="muted small">Their clock-out is set to the exact shift end time, any open break is closed, and they see "Your shift has ended".</div></div>
            <button role="switch" aria-checked={d.settings.shiftEndOut} className={"toggle" + (d.settings.shiftEndOut ? " on" : "")} onClick={() => setting({ shiftEndOut: !d.settings.shiftEndOut })}><span /></button></div>
          <div><div><b>Wait before the automatic clock-out</b><div className="muted small">Useful if agents often finish a last call after the shift ends.</div></div>
            <label className="row" style={{ color: "var(--foreground)", flexWrap: "nowrap" }}><input type="number" min="0" max="240" defaultValue={d.settings.shiftEndGrace} onBlur={(e) => setting({ shiftEndGrace: e.target.value })} style={{ maxWidth: 90 }} /> minutes</label></div>
        </div>
      </section>

      {sel.length > 0 && (
        <section className="panel toolbar">
          <b><CheckSquare size={15} /> {sel.length} selected</b>
          <label style={{ maxWidth: 150 }}>Start<input type="time" value={bulk.shiftStart} onChange={(e) => setBulk({ ...bulk, shiftStart: e.target.value })} /></label>
          <label style={{ maxWidth: 120 }}>Hours<input type="number" min="1" max="16" step="0.5" value={bulk.shiftHours} onChange={(e) => setBulk({ ...bulk, shiftHours: e.target.value })} /></label>
          <label style={{ maxWidth: 120 }}>Grace (min)<input type="number" min="0" value={bulk.graceMinutes} onChange={(e) => setBulk({ ...bulk, graceMinutes: e.target.value })} /></label>
          <button style={{ alignSelf: "flex-end" }} onClick={applyBulk}>Apply to selected</button>
          <button className="ghost" style={{ alignSelf: "flex-end" }} onClick={() => setSel([])}>Clear</button>
        </section>
      )}
      {msg && <div className="receipt">{msg}</div>}

      <section className="panel tablewrap">
        <table>
          <thead><tr><th><input type="checkbox" style={{ width: "auto" }} checked={sel.length === d.agents.length && sel.length > 0} onChange={(e) => setSel(e.target.checked ? d.agents.map((a) => a.id) : [])} aria-label="Select all" /></th>
            <th>Agent</th><th>Starts</th><th>Hours</th><th>Ends</th><th>Grace</th><th>Working days</th><th>Today</th><th></th></tr></thead>
          <tbody>{d.agents.map((a0) => { const a = row(a0); const days = new Set(a.workDays.split(",").filter(Boolean).map(Number)); const dirty = !!edits[a.id]; return (
            <tr key={a.id} style={a.active ? undefined : { opacity: .5 }}>
              <td><input type="checkbox" style={{ width: "auto" }} checked={sel.includes(a.id)} onChange={(e) => setSel(e.target.checked ? [...sel, a.id] : sel.filter((x) => x !== a.id))} aria-label={"Select " + a.name} /></td>
              <td><b>{a.name}</b><div className="muted small">{a.agentId}</div></td>
              <td><input type="time" value={a.shiftStart} onChange={(e) => set(a.id, "shiftStart", e.target.value)} style={{ maxWidth: 120, padding: "6px 8px" }} /></td>
              <td><input type="number" min="1" max="16" step="0.5" value={a.shiftHours} onChange={(e) => set(a.id, "shiftHours", e.target.value)} style={{ maxWidth: 80, padding: "6px 8px" }} /></td>
              <td className="small">{endOf(a.shiftStart, Number(a.shiftHours) || 0)}</td>
              <td><input type="number" min="0" value={a.graceMinutes} onChange={(e) => set(a.id, "graceMinutes", e.target.value)} style={{ maxWidth: 70, padding: "6px 8px" }} /></td>
              <td><div className="days">{DAYS.map((x, i) => <button key={x} className={days.has(i) ? "on" : ""} onClick={() => { days.has(i) ? days.delete(i) : days.add(i); set(a.id, "workDays", [...days].sort().join(",")); }} aria-pressed={days.has(i)}>{x[0]}</button>)}</div></td>
              <td className="small">{a.today.clockIn ? <>in {t(a.today.clockIn)}{a.today.clockOut ? <> · out {t(a.today.clockOut)}{a.today.auto ? <span className="muted"> (auto)</span> : ""}</> : <span style={{ color: "var(--green)" }}> · on shift</span>}</> : <span className="muted">{t(a.today.start)}–{t(a.today.end)}</span>}</td>
              <td>{dirty && <button className="sm" onClick={() => save(a0)}><Save size={13} /> Save</button>}</td>
            </tr>
          ); })}</tbody>
        </table>
      </section>
    </div>
  );
}
