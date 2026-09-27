"use client";
// One call's QA report: scores, grammar corrections, nervous moments, compliance, coaching, transcript. Printable.
import { useEffect, useState } from "react";
import Link from "next/link";
import { useShell } from "@/components/Shell";
import { ArrowLeft, Printer, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { dur } from "@/lib/fmt";

const col = (v) => (v >= 8 ? "#7fd6a0" : v >= 5 ? "#ffb070" : "#ff4d5a");
export default function QualityReport({ id }) {
  const { me } = useShell(); const isAdmin = me?.role === "ADMIN"; const base = isAdmin ? "/admin/quality" : "/agent/quality";
  const [r, setR] = useState(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const load = () => fetch("/api/qa/" + id).then(async (x) => { const d = await x.json(); x.ok ? setR(d) : setErr(d.error); });
  useEffect(() => { load(); }, [id]); // eslint-disable-line
  if (err) return <p className="err">{err}</p>;
  if (!r) return <p className="muted">Loading report…</p>;
  const lines = (r.call?.transcript || "").split("\n").filter(Boolean);
  const bad = new Set([...r.grammar.map((g) => g.said), ...r.nervous.map((n) => n.said)].map((x) => x.toLowerCase().slice(0, 40)));
  const secs = r.call?.endedAt ? Math.round((new Date(r.call.endedAt) - new Date(r.call.startedAt)) / 1000) : null;
  async function rerun() { setBusy(true); const x = await fetch("/api/qa/" + id, { method: "POST" }).then((y) => y.json()); setBusy(false); if (x.error) alert(x.error); else load(); }
  return (
    <div className="stack qa-report">
      <div className="toolbar no-print">
        <Link href={base} className="btn-link"><ArrowLeft size={14} /> All reports</Link>
        <div className="row" style={{ marginLeft: "auto" }}>
          {isAdmin && <button className="ghost" onClick={rerun} disabled={busy}><RefreshCw size={14} /> {busy ? "Reviewing…" : "Review again"}</button>}
          <button className="ghost" onClick={() => window.print()}><Printer size={14} /> Print / PDF</button>
        </div>
      </div>
      <section className="panel qa-head">
        <div className={"qa-score " + (r.overall >= 75 ? "ok" : r.overall >= 55 ? "late" : "red")}><b>{r.overall}</b><span>/100</span></div>
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontSize: 22 }}>{r.agent?.name} <span className="muted small">{r.agent?.agentId}</span></h2>
          <div className="small muted">{new Date(r.call?.startedAt || r.createdAt).toLocaleString()}{secs ? ` · ${dur(secs)}` : ""} · {r.outcome || "—"} · customer {r.sentiment || "—"}{r.call?.endedBy ? ` · ended by ${r.call.endedBy}${r.call.endedBySource === "ai" ? " (AI guess)" : ""}` : ""}</div>
          {r.summary && <p style={{ margin: "8px 0 0" }}>{r.summary}</p>}
        </div>
      </section>

      <div className="kpi-grid">
        <div className="panel kpi"><div className="l">Agent nervous</div><div className="v">{r.agentNervous ?? "—"}<small>%</small></div></div>
        <div className="panel kpi"><div className="l">Customer nervous</div><div className="v">{r.customerNervous ?? "—"}<small>{r.customerNervous != null ? "%" : ""}</small></div><div className="d muted">{r.call?.customerSide ? "" : "customer not captured"}</div></div>
        <div className="panel kpi"><div className="l">Grammar mistakes</div><div className="v">{r.grammar.length}</div></div>
        <div className="panel kpi"><div className="l">Filler words</div><div className="v">{r.fillers}</div><div className="d muted">um, uh, you know…</div></div>
        <div className="panel kpi"><div className="l">Speaking pace</div><div className="v">{r.wpm ?? "—"}</div><div className="d muted">words/min (120–160 is ideal)</div></div>
        <div className="panel kpi"><div className="l">Talk ratio</div><div className="v">{r.agentWords + r.customerWords ? Math.round((r.agentWords / (r.agentWords + r.customerWords)) * 100) : 100}<small>%</small></div><div className="d muted">agent talking</div></div>
      </div>

      <div className="two-col">
        <section className="panel stack">
          <h2>Scores</h2>
          <div className="qa-bars">{Object.entries(r.scores).map(([k, v]) => (
            <div key={k}><span>{r.labels[k] || k}</span><div className="nerv-track"><div style={{ width: v * 10 + "%", background: col(v) }} /></div><b>{v}/10</b></div>
          ))}</div>
        </section>
        <section className="panel stack">
          <h2>Compliance</h2>
          <div className="qa-checks">{r.compliance.map((c, i) => (
            <div key={i}>{c.passed ? <CheckCircle2 size={16} style={{ color: "#7fd6a0" }} /> : <XCircle size={16} style={{ color: "#ff4d5a" }} />}<span><b>{c.item}</b>{c.note && <span className="muted small"> · {c.note}</span>}</span></div>
          ))}</div>
        </section>
      </div>

      <section className="panel stack">
        <h2>Grammar & language</h2>
        {r.grammar.length ? <div className="gram-list">{r.grammar.map((g, i) => <div key={i}><s>{g.said}</s><span>→</span><b>{g.better}</b><em>{g.why}</em></div>)}</div> : <p className="muted small" style={{ margin: 0 }}>No grammar mistakes found.</p>}
      </section>
      <section className="panel stack">
        <h2>Nervous moments</h2>
        {r.nervous.length ? <div className="gram-list">{r.nervous.map((n, i) => <div key={i}><q>{n.said}</q><em>{n.sign}</em></div>)}</div> : <p className="muted small" style={{ margin: 0 }}>The agent sounded steady.</p>}
      </section>
      <div className="two-col">
        <section className="panel stack"><h2>What went well</h2><ul className="qa-ul">{(r.highlights.strengths || []).map((x, i) => <li key={i}>{x}</li>)}</ul></section>
        <section className="panel stack"><h2>Coaching</h2><ul className="qa-ul">{(r.highlights.improve || []).map((x, i) => <li key={i}>{x}</li>)}</ul></section>
      </div>
      <section className="panel stack">
        <h2>Transcript</h2>
        <div className="subs qa-transcript">{lines.map((l, i) => { const c = l.startsWith("C: "); const t = l.replace(/^[AC]: /, ""); const flag = !c && bad.has(t.toLowerCase().slice(0, 40)); return <p key={i} className={(c ? "c" : "a") + (flag ? " flag" : "")}><b>{c ? "Customer" : r.agent?.name?.split(" ")[0] || "Agent"}</b>{t}</p>; })}</div>
      </section>
    </div>
  );
}
