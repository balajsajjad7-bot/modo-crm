"use client";
import { AlarmClock, BarChart3, Gauge, Kanban, Sparkles } from "lucide-react";
import AiButton from "@/components/AiButton";
import { useEffect, useState } from "react";
import { useShell } from "@/components/Shell";
import { api, money } from "./shared";

function Bars({ data, k, alt, label }) {
  const max = Math.max(1, ...data.map((d) => Math.max(d[k], alt ? d[alt] : 0)));
  return (
    <div className="bars" role="img" aria-label={label}>
      {data.map((d) => (
        <div key={d.day} className="bar-col" title={`${d.day}: ${d[k]}${alt ? ` of ${d[alt]}` : ""}`}>
          <div style={{ width: "100%", flex: 1, display: "flex", alignItems: "flex-end", gap: 2 }}>
            {alt && <div className="bar-fill alt" style={{ height: (d[alt] / max) * 100 + "%" }} />}
            <div className="bar-fill" style={{ height: (d[k] / max) * 100 + "%" }} />
          </div>
          <span className="bar-lbl">{d.day.slice(8)}</span>
        </div>
      ))}
    </div>
  );
}

export default function Reports() {
  const { me } = useShell(); const isAdmin = me?.role === "ADMIN";
  const [days, setDays] = useState(14); const [d, setD] = useState(null);
  useEffect(() => { setD(null); api("/api/reports?days=" + days).then((r) => r.ok && setD(r.data)); }, [days]);
  if (!d) return <p className="muted">Crunching numbers…</p>;
  const aiData = () => ({ data: { days: d.days, kpis: d.kpis, pipeline: d.pipeline, agents: d.agents, perDay: d.perDay?.slice(-14) } });
  const k = d.kpis; const maxStage = Math.max(1, ...d.pipeline.map((p) => p.value));
  const tiles = [
    [k.verified, "Verified sales", `${k.submitted} submitted · ${k.verifyRate}% verified`],
    [money(k.revenue), "Verified revenue", `last ${d.days} days`],
    [money(k.openPipeline), "Open pipeline", k.winRate != null ? `${k.winRate}% win rate` : "no closed deals yet"],
    [k.onTime != null ? k.onTime + "%" : "—", "On-time shifts", k.inOffice != null ? `${k.inOffice}% in office` : ""],
    [k.avgScore ?? "—", "Avg call score", "out of 100"],
    [k.tasksDone, "Tasks completed", `last ${d.days} days`],
  ];
  return (
    <div className="stack">
      <div className="toolbar"><nav className="seg" role="tablist">{[7, 14, 30, 90].map((n) => <button key={n} role="tab" aria-selected={days === n} onClick={() => setDays(n)}>{n} days</button>)}</nav></div>
      <div className="kpi-grid">{tiles.map(([v, l, s]) => <div key={l} className="panel kpi"><div className="l">{l}</div><div className="v">{v}</div><div className="d muted">{s}</div></div>)}</div>
      <div className="two-col">
      <section className="panel stack"><div className="row" style={{ justifyContent: "space-between" }}><h2><Sparkles size={17} /> What the numbers say</h2><AiButton task="explain_report" payload={aiData} label="Explain with AI" /></div><p className="muted small" style={{ margin: 0 }}>Modo AI reads these reports and tells you what's going well, what's worrying, and what to do tomorrow.</p></section>
        <section className="panel stack"><div className="row" style={{ justifyContent: "space-between" }}><h2><BarChart3 size={17} /> Sales per day</h2><span className="small muted">▮ verified &nbsp; <span style={{ opacity: .6 }}>▮ submitted</span></span></div><Bars data={d.perDay} k="verified" alt="submitted" label="Sales per day" /></section>
        <section className="panel stack"><h2><Kanban size={17} /> Pipeline by stage</h2>
          <div className="funnel">{d.pipeline.map((p) => <div key={p.id}><span className="small">{p.label} <span className="muted">({p.count})</span></span><div className="track"><div style={{ width: (p.value / maxStage) * 100 + "%" }} /></div><span className="small r num">{money(p.value)}</span></div>)}</div>
        </section>
      </div>
      <section className="panel stack"><h2><AlarmClock size={17} /> Late arrivals per day</h2><Bars data={d.perDay} k="late" label="Late arrivals per day" /></section>
      {isAdmin && (
        <section className="panel tablewrap">
          <h2 style={{ marginBottom: 8 }}><Gauge size={17} /> Agent performance</h2>
          <table>
            <thead><tr><th>Agent</th><th className="r">Verified</th><th className="r">Submitted</th><th className="r">Revenue</th><th className="r">Avg score</th><th className="r">Days in</th><th className="r">Late days</th></tr></thead>
            <tbody>{d.byAgent.map((a) => <tr key={a.name}><td>{a.name}</td><td className="r num">{a.verified}</td><td className="r">{a.submitted}</td><td className="r">{money(a.revenue)}</td><td className="r">{a.avgScore ?? "—"}</td><td className="r">{a.daysIn}</td><td className="r" style={{ color: a.lateDays ? "var(--red)" : undefined }}>{a.lateDays}</td></tr>)}</tbody>
          </table>
        </section>
      )}
    </div>
  );
}
