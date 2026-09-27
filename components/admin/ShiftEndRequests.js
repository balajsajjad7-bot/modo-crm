"use client";
// Admin: agents asking to end their shift early. Approve → a one-time code goes to the agent in Chat (and shows here).
import { useEffect, useState } from "react";
import { api } from "./api";
import { Clock, Check, X } from "lucide-react";

const t = (d) => (d ? new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "—");
const STATUS = { pending: ["waiting", "late"], approved: ["approved · code sent", "ok"], used: ["left", "ok"], denied: ["denied", "red"], expired: ["code expired", ""] };

export default function ShiftEndRequests({ compact }) {
  const [list, setList] = useState(null); const [codes, setCodes] = useState({}); const [notes, setNotes] = useState({});
  const load = () => api("/api/shift-end").then((r) => r.ok && setList(r.data.requests));
  useEffect(() => { load(); const i = setInterval(load, 15000); return () => clearInterval(i); }, []);
  async function decide(r, approve) { const res = await api("/api/shift-end", "PATCH", { id: r.id, approve, note: notes[r.id] }); if (!res.ok) return alert(res.data.error); if (res.data.code) setCodes((c) => ({ ...c, [r.id]: res.data.code })); load(); }
  if (!list) return null;
  const pending = list.filter((r) => r.status === "pending");
  const shown = compact ? list.filter((r) => r.status === "pending" || codes[r.id]) : list; // keep a just-approved code on screen
  if (compact && !shown.length) return null;
  return (
    <section className="panel stack">
      <h2><Clock size={17} /> Early shift-end requests {pending.length > 0 && <span className="chip late">{pending.length} waiting</span>}</h2>
      {!shown.length && <p className="muted small" style={{ margin: 0 }}>No requests. Agents who try to end their shift before it's over send a request here; you approve and Modo sends them a one-time code in Chat.</p>}
      <div className="stack" style={{ gap: 8 }}>{shown.map((r) => (
        <div key={r.id} className="se-row">
          <div style={{ minWidth: 0 }}><b>{r.name}</b> <span className="muted small">{r.agentId}</span>
            <div className="small">“{r.reason}”</div>
            <div className="small muted">asked {t(r.createdAt)} · shift ends {t(r.shiftEnd)}{r.decidedBy ? ` · ${r.decidedBy} ${t(r.decidedAt)}` : ""}</div></div>
          {r.status === "pending" ? (
            <div className="row" style={{ gap: 6 }}>
              <input value={notes[r.id] || ""} onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })} placeholder="Note (optional)" style={{ maxWidth: 170, padding: "6px 10px" }} />
              <button className="sm" onClick={() => decide(r, true)}><Check size={13} /> Approve</button>
              <button className="ghost sm" onClick={() => decide(r, false)}><X size={13} /> Deny</button>
            </div>
          ) : <div className="row" style={{ gap: 6 }}><span className={"chip " + STATUS[r.status]?.[1]}>{STATUS[r.status]?.[0] || r.status}</span>{codes[r.id] && r.status === "approved" && <span className="code-pill" title="Also sent to the agent in Chat">{codes[r.id]}</span>}</div>}
        </div>
      ))}</div>
    </section>
  );
}
