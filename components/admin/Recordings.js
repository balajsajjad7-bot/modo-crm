"use client";
// Admin → VICIdial recordings: pick a day, play or download call recordings straight from your VICIdial server.
import { useEffect, useState } from "react";
import { api } from "./api";
import { Play, Download, RefreshCw, Search, AlertCircle } from "lucide-react";

const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const dur = (s) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "—");

export default function Recordings() {
  const [date, setDate] = useState(iso(new Date())); const [agent, setAgent] = useState(""); const [phone, setPhone] = useState("");
  const [d, setD] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const load = async () => {
    setBusy(true); setErr(""); setD(null);
    const r = await api(`/api/vicidial/recordings?date=${date}${agent ? "&agent=" + encodeURIComponent(agent) : ""}${phone ? "&phone=" + encodeURIComponent(phone) : ""}`);
    setBusy(false); if (r.ok) setD(r.data.rows); else setErr(r.data.error || "Couldn't load recordings.");
  };
  useEffect(() => { load(); }, []); // eslint-disable-line
  return (
    <div className="stack">
      <section className="panel toolbar">
        <label style={{ maxWidth: 180 }}>Day<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label style={{ maxWidth: 170 }}>Agent (VICIdial user)<input value={agent} onChange={(e) => setAgent(e.target.value)} placeholder="e.g. 1001" /></label>
        <label style={{ maxWidth: 190 }}>Phone<input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="customer number" /></label>
        <button style={{ alignSelf: "flex-end" }} onClick={load} disabled={busy}><Search size={15} /> {busy ? "Loading…" : "Find recordings"}</button>
      </section>
      {err && <section className="panel err" style={{ display: "flex", gap: 10, alignItems: "flex-start" }}><AlertCircle size={18} style={{ flexShrink: 0 }} /><div>{err}</div></section>}
      {d && (
        <section className="panel tablewrap">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}><h2>{d.length} recording{d.length === 1 ? "" : "s"} · {date}</h2><button className="ghost sm" onClick={load}><RefreshCw size={13} /></button></div>
          {!d.length ? <p className="muted">No recordings found for this day/filter. Try a different date or agent.</p> : (
            <table>
              <thead><tr><th>Time</th><th>Agent</th><th>Phone</th><th>Length</th><th>Play</th><th></th></tr></thead>
              <tbody>{d.map((r, i) => (
                <tr key={r.id || i}>
                  <td className="small">{r.start || "—"}</td><td>{r.agent || "—"}</td><td className="num">{r.phone || "—"}</td><td className="num">{dur(r.seconds)}</td>
                  <td style={{ minWidth: 240 }}><audio controls preload="none" src={r.url} style={{ height: 34, maxWidth: 240 }} /></td>
                  <td><a className="btn-link" href={r.url} target="_blank" rel="noreferrer" download><Download size={13} /></a></td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </section>
      )}
      <p className="muted small">Recordings play straight from your VICIdial server, so your browser must be able to reach it (same public-address requirement as live tracking). Nothing is copied into Modo.</p>
    </div>
  );
}
