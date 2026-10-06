"use client";
// Admin report: every agent's personal notepad, read-only, searchable, exportable.
import { useMemo, useState } from "react";
import { usePoll } from "./api";
import { NotebookPen, Search, Download, Sparkles, AlertTriangle, MessageCircle, RefreshCw } from "lucide-react";

// Notepad coach: Modo AI reads the agents' notepads and tells the admin, per customer, what to say and how to engage.
function NotepadCoach({ agentId, agentName, compact }) {
  const [res, setRes] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function run() {
    setBusy(true); setErr("");
    const r = await fetch("/api/ai/do", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ task: "coach_notepads", agentId }) });
    const d = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) return setErr(d.error || "The coach couldn't run.");
    setRes(d);
  }
  const label = agentId ? "Coach me on these customers" : "Summarize all notepads & coach me";
  return (
    <div className={"coach" + (compact ? " compact" : "")}>
      {!res && <button className={compact ? "ghost sm" : ""} onClick={run} disabled={busy}><Sparkles size={15} /> {busy ? "Reading notepads…" : label}</button>}
      {err && <div className="err small">{err}</div>}
      {res && (
        <div className="coach-out">
          <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
            <b className="row" style={{ gap: 6 }}><Sparkles size={15} /> Notepad coach</b>
            <span className="row" style={{ gap: 6 }}><button className="ghost sm" onClick={run} disabled={busy}><RefreshCw size={13} /> {busy ? "…" : "Refresh"}</button><button className="ghost sm" onClick={() => setRes(null)}>Close</button></span>
          </div>
          {res.empty && <p className="muted small">No notes to read yet.</p>}
          {res.overview && <p className="coach-overview">{res.overview}</p>}
          {(res.agents || []).map((a, i) => (
            <div key={a.agentUserId || i} className="coach-agent">
              {!agentId && <b>{a.agent}</b>}
              {a.summary && <p className="muted small" style={{ margin: "2px 0 6px" }}>{a.summary}</p>}
              {(a.customers || []).map((c, j) => (
                <div key={j} className="coach-cst">
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}><b>{c.customer || "Customer"}</b>{c.mood && <span className="chip">{c.mood}</span>}</div>
                  {c.situation && <p className="small" style={{ margin: "2px 0" }}>{c.situation}</p>}
                  {c.say && <blockquote className="tr-say"><MessageCircle size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />{c.say}</blockquote>}
                  {c.engage && <p className="small coach-engage"><b>How to engage:</b> {c.engage}</p>}
                  {c.next && <p className="small" style={{ margin: 0 }}><b>Next:</b> {c.next}</p>}
                  {(c.flags || []).filter(Boolean).map((f, k) => <div key={k} className="tr-warn small"><AlertTriangle size={14} /><span>{f}</span></div>)}
                </div>
              ))}
              {(a.followups || []).filter(Boolean).length > 0 && <ul className="tr-ul small">{a.followups.filter(Boolean).map((f, k) => <li key={k}>{f}</li>)}</ul>}
            </div>
          ))}
          <p className="muted small" style={{ margin: 0 }}>AI suggestions from the notes. Check prices and offers before quoting; card numbers, SSNs and PINs are hidden before the AI sees the notes.</p>
        </div>
      )}
    </div>
  );
}

export default function AgentNotepads() {
  const [{ data }] = usePoll("/api/agents/notepads", 20000);
  const [q, setQ] = useState("");
  const list = useMemo(() => (data || []).filter((a) => {
    const s = q.toLowerCase(); return !s || (a.name + " " + a.agentId + " " + (a.padText || "")).toLowerCase().includes(s);
  }), [data, q]);
  if (!data) return <p className="muted">Loading notepads…</p>;
  const withNotes = list.filter((a) => (a.padText || "").trim());
  function exportCsv() {
    const rows = [["Agent", "ID", "Notepad"], ...list.map((a) => [a.name, a.agentId, (a.padText || "").replace(/\r?\n/g, " ")])];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a"); a.href = url; a.download = "agent-notepads.csv"; a.click(); URL.revokeObjectURL(url);
  }
  return (
    <div className="stack">
      <section className="panel stack">
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <h2><NotebookPen size={17} /> Agent notepads</h2>
          <div className="row" style={{ gap: 8 }}>
            <label className="sl-search" style={{ margin: 0, maxWidth: 260, background: "rgba(255,255,255,.06)" }}><Search size={14} /><input placeholder="Search agents or notes…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
            <button className="ghost sm" onClick={exportCsv}><Download size={14} /> CSV</button>
          </div>
        </div>
        <p className="muted small" style={{ margin: 0 }}>Each agent's personal scratchpad. Read-only — {withNotes.length} of {list.length} agents have notes.</p>
        {withNotes.length > 0 && <NotepadCoach />}
      </section>
      <div className="np-grid">
        {list.map((a) => (
          <section key={a.id} className="panel stack" style={{ gap: 8 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <b>{a.name} <span className="muted small num">· {a.agentId}</span></b>
              <span className={"chip " + (a.online ? "ok" : "")}>{a.online ? "online" : "offline"}</span>
            </div>
            {(a.padText || "").trim()
              ? <><div className="np-note">{a.padText}</div><NotepadCoach agentId={a.id} agentName={a.name} compact /></>
              : <p className="muted small" style={{ margin: 0 }}>No notes.</p>}
          </section>
        ))}
        {!list.length && <p className="muted">No agents match.</p>}
      </div>
    </div>
  );
}
