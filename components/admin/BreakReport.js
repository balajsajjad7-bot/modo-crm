"use client";
// Team → Break report: every break, per agent per day, with allowance and overage. Export to CSV.
import { useEffect, useState } from "react";
import { api } from "./api";
import { dur } from "@/lib/fmt";
import { Download, Coffee } from "lucide-react";

const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const t = (d) => (d ? new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "still on break");

export default function BreakReport() {
  const [from, setFrom] = useState(iso(new Date(Date.now() - 6 * 86400000))); const [to, setTo] = useState(iso(new Date()));
  const [d, setD] = useState(null); const [open, setOpen] = useState({});
  useEffect(() => { setD(null); api(`/api/reports/breaks?from=${from}&to=${to}`).then((r) => r.ok && setD(r.data)); }, [from, to]);
  function csv() {
    const lines = [["Agent", "ID", "Date", "Break start", "Break end", "Minutes", "Day total (min)", "Over allowance (min)"]];
    d.rows.forEach((r) => r.breaks.forEach((b) => lines.push([r.name, r.agentId, r.date, new Date(b.start).toLocaleTimeString(), b.end ? new Date(b.end).toLocaleTimeString() : "open", (b.seconds / 60).toFixed(1), (r.total / 60).toFixed(1), (r.over / 60).toFixed(1)])));
    const blob = new Blob([lines.map((l) => l.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `break-report-${from}-to-${to}.csv`; a.click();
  }
  return (
    <div className="stack">
      <div className="toolbar">
        <label style={{ maxWidth: 170 }}>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label style={{ maxWidth: 170 }}>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        {d && <button className="ghost" style={{ alignSelf: "flex-end" }} onClick={csv} disabled={!d.rows.length}><Download size={15} /> Export CSV</button>}
        {d && <span className="muted small" style={{ alignSelf: "flex-end", marginLeft: "auto" }}>Allowance {dur(d.allowance)} per shift</span>}
      </div>
      {!d ? <p className="muted">Loading…</p> : (
        <>
          <div className="kpi-grid">{d.perAgent.map((a) => (
            <div key={a.id} className="panel kpi"><div className="l">{a.name}</div><div className="v">{dur(a.total)}</div>
              <div className="d muted">{a.breaks} breaks over {a.days} day{a.days === 1 ? "" : "s"}{a.over ? <span className="due-over"> · {dur(a.over)} over</span> : ""}</div></div>
          ))}{!d.perAgent.length && <p className="muted">No breaks in this period.</p>}</div>
          <section className="panel tablewrap">
            <table>
              <thead><tr><th>Date</th><th>Agent</th><th className="r">Breaks</th><th className="r">Total</th><th className="r">Over allowance</th><th></th></tr></thead>
              <tbody>{d.rows.map((r) => [
                <tr key={r.userId + r.date}>
                  <td>{r.date}</td><td>{r.name}<div className="muted small">{r.agentId}</div></td><td className="r">{r.count}</td><td className="r num">{dur(r.total)}</td>
                  <td className="r">{r.over ? <span className="due-over">{dur(r.over)}</span> : "—"}</td>
                  <td>{r.open && <span className="chip late">on break now</span>} <button className="ghost sm" onClick={() => setOpen({ ...open, [r.userId + r.date]: !open[r.userId + r.date] })}><Coffee size={13} /> {open[r.userId + r.date] ? "Hide" : "Times"}</button></td>
                </tr>,
                open[r.userId + r.date] && <tr key={r.userId + r.date + "d"}><td colSpan={6}><div className="row" style={{ gap: 6 }}>{r.breaks.map((b, i) => <span key={i} className="chip">{t(b.start)} → {t(b.end)} · {dur(b.seconds)}</span>)}</div></td></tr>,
              ])}</tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
