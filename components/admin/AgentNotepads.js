"use client";
// Admin report: every agent's personal notepad, read-only, searchable, exportable.
import { useMemo, useState } from "react";
import { usePoll } from "./api";
import { NotebookPen, Search, Download } from "lucide-react";

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
      </section>
      <div className="np-grid">
        {list.map((a) => (
          <section key={a.id} className="panel stack" style={{ gap: 8 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <b>{a.name} <span className="muted small num">· {a.agentId}</span></b>
              <span className={"chip " + (a.online ? "ok" : "")}>{a.online ? "online" : "offline"}</span>
            </div>
            {(a.padText || "").trim()
              ? <div className="np-note">{a.padText}</div>
              : <p className="muted small" style={{ margin: 0 }}>No notes.</p>}
          </section>
        ))}
        {!list.length && <p className="muted">No agents match.</p>}
      </div>
    </div>
  );
}
