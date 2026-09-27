"use client";
// Quality department dashboard: every call reviewed by AI. Scores, grammar, nervousness, compliance, trends, per-agent detail.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useShell } from "@/components/Shell";
import { Download, RefreshCw, ShieldCheck, Languages, Activity, Gauge, Printer } from "lucide-react";

const LABELS = { greeting: "Greeting", pitch: "Pitch", disclosure: "Disclosure", closing: "Closing", empathy: "Empathy", clarity: "Clarity", grammar: "Grammar", confidence: "Confidence", compliance: "Compliance" };
const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const tone = (v, hi = 75, lo = 55) => (v == null ? "" : v >= hi ? "ok" : v >= lo ? "late" : "red");
const nerv = (v) => (v == null ? "" : v >= 60 ? "red" : v >= 35 ? "late" : "ok");

export default function Quality() {
  const { me } = useShell(); const isAdmin = me?.role === "ADMIN"; const base = isAdmin ? "/admin/quality" : "/agent/quality";
  const [from, setFrom] = useState(iso(new Date(Date.now() - 13 * 86400000))); const [to, setTo] = useState(iso(new Date())); const [agent, setAgent] = useState("");
  const [d, setD] = useState(null); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(""); const [openAgent, setOpenAgent] = useState(null);
  const load = useCallback(() => { setD(null); fetch(`/api/qa?from=${from}&to=${to}${agent ? "&agent=" + agent : ""}`).then((r) => r.json()).then(setD); }, [from, to, agent]);
  useEffect(() => { load(); }, [load]);
  async function backfill() { setBusy(true); const r = await fetch("/api/qa/backfill", { method: "POST" }).then((x) => x.json()); setBusy(false); setMsg(`Reviewed ${r.reviewed || 0} calls${r.failed ? `, ${r.failed} couldn't be reviewed` : ""}.`); load(); }
  function csv() {
    const head = ["Date", "Agent", "ID", "Overall", ...Object.values(LABELS), "Grammar mistakes", "Filler words", "Words/min", "Agent nervous %", "Customer nervous %", "Compliance passed", "Sentiment", "Outcome", "Summary"];
    const lines = [head, ...d.rows.map((r) => [new Date(r.at).toLocaleString(), r.agent, r.agentId, r.overall, ...Object.keys(LABELS).map((k) => r.scores[k] ?? ""), r.grammarCount, r.fillers, r.wpm ?? "", r.agentNervous ?? "", r.customerNervous ?? "", `${r.compliancePassed}/${r.complianceTotal}`, r.sentiment || "", r.outcome || "", r.summary || ""])];
    const blob = new Blob([lines.map((l) => l.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `quality-report-${from}-to-${to}.csv`; a.click();
  }
  if (!d) return <p className="muted">Loading quality reports…</p>;
  const t = d.totals; const maxDay = Math.max(1, ...d.perDay.map((x) => x.calls));
  return (
    <div className="stack qa">
      <div className="toolbar no-print">
        <label style={{ maxWidth: 170 }}>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label style={{ maxWidth: 170 }}>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        {isAdmin && <label style={{ maxWidth: 220 }}>Agent<select value={agent} onChange={(e) => setAgent(e.target.value)}><option value="">Everyone</option>{d.byAgent.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}
        <div className="row" style={{ alignSelf: "flex-end", marginLeft: "auto" }}>
          {isAdmin && d.pending > 0 && <button className="ghost" onClick={backfill} disabled={busy}><RefreshCw size={14} /> {busy ? "Reviewing…" : `Review ${Math.min(5, d.pending)} unreviewed calls`}</button>}
          <button className="ghost" onClick={csv} disabled={!d.rows.length}><Download size={14} /> Export CSV</button>
          <button className="ghost" onClick={() => window.print()}><Printer size={14} /> Print</button>
        </div>
      </div>
      {msg && <div className="receipt">{msg}</div>}

      <div className="kpi-grid">
        <div className="panel kpi"><div className="l"><Gauge size={13} /> Average quality</div><div className="v">{t.avg ?? "—"}<small>/100</small></div><div className="d muted">{t.calls} calls reviewed</div></div>
        <div className="panel kpi"><div className="l"><Languages size={13} /> Grammar mistakes</div><div className="v">{t.grammar}</div><div className="d muted">{t.calls ? (t.grammar / t.calls).toFixed(1) : 0} per call</div></div>
        <div className="panel kpi"><div className="l"><Activity size={13} /> Agent nervousness</div><div className="v">{t.nervous ?? "—"}<small>%</small></div><div className="d muted">{t.fillers ?? 0} filler words per call</div></div>
        <div className="panel kpi"><div className="l"><ShieldCheck size={13} /> Compliance</div><div className="v">{t.compliance ?? "—"}<small>%</small></div><div className="d muted">checks passed</div></div>
        <div className="panel kpi"><div className="l">Sales</div><div className="v">{t.sales}</div><div className="d muted">calls that ended in a sale</div></div>
      </div>

      <div className="two-col">
        <section className="panel stack">
          <h2>Quality per day</h2>
          <div className="bars" role="img" aria-label="Average quality per day">{d.perDay.map((x) => (
            <div key={x.day} className="bar-col" title={`${x.day}: ${x.avg ?? "no calls"} avg · ${x.calls} calls`}>
              <div style={{ width: "100%", flex: 1, display: "flex", alignItems: "flex-end", gap: 2 }}>
                <div className="bar-fill alt" style={{ height: (x.calls / maxDay) * 100 + "%" }} /><div className="bar-fill" style={{ height: (x.avg || 0) + "%" }} />
              </div><span className="bar-lbl">{x.day.slice(8)}</span></div>
          ))}</div>
          <span className="small muted">▮ average score (0–100) · <span style={{ opacity: .6 }}>▮ number of calls</span></span>
        </section>
        <section className="panel stack">
          <h2>Compliance checklist</h2>
          <div className="funnel">{d.complianceItems.map((c) => (
            <div key={c.item} style={{ gridTemplateColumns: "1fr 110px 50px" }}><span className="small">{c.item}</span><div className="track"><div style={{ width: (c.passRate || 0) + "%", background: c.passRate >= 80 ? "#7fd6a0" : c.passRate >= 50 ? "#ffb070" : "#ff4d5a" }} /></div><span className="small r num">{c.passRate == null ? "—" : c.passRate + "%"}</span></div>
          ))}</div>
        </section>
      </div>

      {isAdmin && (
        <section className="panel tablewrap">
          <h2 style={{ marginBottom: 8 }}>Agents</h2>
          <table>
            <thead><tr><th>Agent</th><th className="r">Calls</th><th className="r">Avg</th>{Object.values(LABELS).map((l) => <th key={l} className="r">{l}</th>)}<th className="r">Grammar/call</th><th className="r">Fillers/call</th><th className="r">Nervous</th><th className="r">Compliance</th><th></th></tr></thead>
            <tbody>{d.byAgent.map((a) => [
              <tr key={a.id}>
                <td><b>{a.name}</b><div className="muted small">{a.agentId}</div></td><td className="r">{a.calls}</td>
                <td className="r"><span className={"chip " + tone(a.avg)}>{a.avg ?? "—"}</span></td>
                {Object.keys(LABELS).map((k) => <td key={k} className="r num" style={{ color: a.criteria[k] != null && a.criteria[k] < 5 ? "var(--red)" : undefined }}>{a.criteria[k] ?? "—"}</td>)}
                <td className="r">{a.grammarPerCall ?? "—"}</td><td className="r">{a.fillersPerCall ?? "—"}</td>
                <td className="r"><span className={"chip " + nerv(a.nervous)}>{a.nervous ?? "—"}%</span></td><td className="r">{a.compliance ?? "—"}%</td>
                <td><button className="ghost sm" onClick={() => setOpenAgent(openAgent === a.id ? null : a.id)}>{openAgent === a.id ? "Hide" : "Mistakes"}</button></td>
              </tr>,
              openAgent === a.id && <tr key={a.id + "m"}><td colSpan={16}>
                {a.mistakes.length ? <div className="gram-list">{a.mistakes.map((m, i) => <div key={i}><s>{m.said}</s><span>→</span><b>{m.better}</b><em>{m.why}</em></div>)}</div> : <p className="muted small">No grammar mistakes found.</p>}
              </td></tr>,
            ])}</tbody>
          </table>
        </section>
      )}

      <section className="panel tablewrap">
        <h2 style={{ marginBottom: 8 }}>Calls</h2>
        <table>
          <thead><tr><th>When</th>{isAdmin && <th>Agent</th>}<th className="r">Score</th><th className="r">Grammar</th><th className="r">Fillers</th><th className="r">Agent nervous</th><th className="r">Customer nervous</th><th className="r">Compliance</th><th>Outcome</th><th>Summary</th><th></th></tr></thead>
          <tbody>{d.rows.map((r) => (
            <tr key={r.id}>
              <td className="small">{new Date(r.at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</td>{isAdmin && <td>{r.agent}</td>}
              <td className="r"><span className={"chip " + tone(r.overall)}>{r.overall}</span></td><td className="r">{r.grammarCount}</td><td className="r">{r.fillers}</td>
              <td className="r"><span className={"chip " + nerv(r.agentNervous)}>{r.agentNervous ?? "—"}%</span></td><td className="r">{r.customerNervous == null ? <span className="muted small">—</span> : <span className={"chip " + nerv(r.customerNervous)}>{r.customerNervous}%</span>}</td>
              <td className="r">{r.compliancePassed}/{r.complianceTotal}</td><td className="small">{r.outcome || "—"}</td><td className="small" style={{ maxWidth: 360 }}>{r.summary}</td>
              <td><Link className="btn-link" href={`${base}/${r.id}`}>Report</Link></td>
            </tr>
          ))}</tbody>
        </table>
        {!d.rows.length && <p className="muted">No reviewed calls in this period. Calls are reviewed automatically when an agent presses End call in Call assist.</p>}
      </section>
    </div>
  );
}
