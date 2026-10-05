"use client";
// Recent calls from Modo's own call log (every call placed or wrapped up through Modo).
import { useEffect, useState } from "react";
import { History, Phone, RefreshCw } from "lucide-react";

const fmt = (p) => { const d = String(p || "").replace(/\D/g, "").slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p; };
const len = (s) => (s == null ? "—" : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`);
const SRC = { vicidial: "VICIdial", gvoice: "Google Voice", custom: "Dialer", manual: "Manual" };

export default function RecentCalls({ mine = false, limit = 25, onRedial, title = "Recent calls", showAgent, refreshKey }) {
  const [rows, setRows] = useState(null); const [err, setErr] = useState("");
  const load = () => fetch(`/api/calls?limit=${limit}${mine ? "&mine=1" : ""}`, { cache: "no-store" }).then(async (r) => { const d = await r.json().catch(() => ({})); if (!r.ok) return setErr(d.error || "Couldn't load calls."); setErr(""); setRows(d.rows || []); }).catch(() => setErr("Couldn't load calls."));
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [mine, limit, refreshKey]); // eslint-disable-line
  return (
    <section className="panel stack">
      <div className="row" style={{ justifyContent: "space-between" }}><h2><History size={17} /> {title}</h2><button className="ghost sm icon-btn" aria-label="Refresh" onClick={load}><RefreshCw size={14} /></button></div>
      {err && <p className="err small">{err}</p>}
      {!rows ? <p className="muted small">Loading…</p> : !rows.length ? <p className="muted small" style={{ margin: 0 }}>No calls yet. Calls made from Modo's dialers show up here with their result and notes.</p> : (
        <div className="tablewrap"><table className="calls-table">
          <thead><tr>{showAgent && <th>Agent</th>}<th>Customer</th><th>When</th><th>Length</th><th>Result</th><th>Via</th>{onRedial && <th />}</tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}>
              {showAgent && <td>{r.agent || "—"}</td>}
              <td><b>{r.name || fmt(r.phone)}</b>{r.name && <div className="small muted num">{fmt(r.phone)}</div>}{r.note && <div className="small muted ellipsis" style={{ maxWidth: 280 }} title={r.note}>{r.note}</div>}</td>
              <td className="small muted">{new Date(r.startedAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>
              <td className="small num">{r.endedAt ? len(r.seconds) : <span className="chip ok">live</span>}</td>
              <td>{r.result ? <span className="chip">{r.result}</span> : <span className="muted small">—</span>}</td>
              <td className="small muted">{SRC[r.source] || r.source}</td>
              {onRedial && <td><button className="ghost sm" onClick={() => onRedial(r)}><Phone size={12} /> Call</button></td>}
            </tr>
          ))}</tbody>
        </table></div>
      )}
    </section>
  );
}
