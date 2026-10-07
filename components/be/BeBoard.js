"use client";
// Admin → Budget Ease: every signup, status, private-field reveal (audited), stats per agent, CSV.
import { useMemo, useState } from "react";
import { usePoll, api } from "@/components/admin/api";
import BeCard, { money } from "./BeCard";
import BeTeam from "./BeTeam";
import { Download, Search, PiggyBank, Trophy } from "lucide-react";
import FoldHead from "@/components/FoldHead";

const TABS = [["NEW", "New"], ["FOLLOWUP", "Follow-up"], ["APPROVED", "Approved"], ["REJECTED", "Rejected"], ["ALL", "All"]];
export default function BeBoard() {
  const [res, reload] = usePoll("/api/budgetease", 15000);
  const [tab, setTab] = useState("NEW"); const [q, setQ] = useState(""); const [agent, setAgent] = useState(""); const [local, setLocal] = useState({});
  const all = useMemo(() => (res.data || []).map((r) => ({ ...r, status: local[r.id] || r.status })), [res.data, local]);
  const agents = [...new Map(all.map((r) => [r.userId, r.agent])).entries()];
  const shown = all.filter((r) => (tab === "ALL" || r.status === tab) && (!agent || r.userId === agent) && (!q || `${r.customer} ${r.phone} ${r.consumerId} ${r.company} ${r.zip}`.toLowerCase().includes(q.toLowerCase())));
  const today = new Date().toDateString();
  const approved = all.filter((r) => r.status === "APPROVED");
  const stats = { total: all.length, today: all.filter((r) => new Date(r.createdAt).toDateString() === today).length, approved: approved.length,
    avgPct: all.length ? (all.reduce((t, r) => t + (r.discountPct || 0), 0) / all.length).toFixed(1) : "—", savings: approved.reduce((t, r) => t + r.savingsMonthly, 0) };
  const board = agents.map(([id, name]) => { const R = all.filter((r) => r.userId === id); return { id, name, total: R.length, approved: R.filter((r) => r.status === "APPROVED").length, today: R.filter((r) => new Date(r.createdAt).toDateString() === today).length }; }).sort((a, b) => b.approved - a.approved || b.total - a.total);
  const setStatus = async (r, st) => { setLocal((l) => ({ ...l, [r.id]: st })); await api("/api/budgetease", "PATCH", { id: r.id, status: st }); };
  const del = async (r) => { if (!confirm(`Delete ${r.consumerId} (${r.customer})? This can't be undone.`)) return; await api("/api/budgetease?id=" + r.id, "DELETE"); reload(); };
  const reveal = async (id) => { const r = await api("/api/budgetease/reveal", "POST", { id }); if (!r.ok) { alert(r.data.error); return null; } reload(); return r.data; };
  function csv() {
    const head = ["Consumer ID", "Date", "Agent", "Customer", "Phone", "Email", "ZIP", "Service address", "Company", "Service", "Current bill", "Wants to pay", "Discount %", "Status", "Flags", "Notes"];
    const lines = [head, ...shown.map((r) => [r.consumerId, new Date(r.createdAt).toLocaleString(), r.agent, r.customer, r.phone, r.email || "", r.zip, r.serviceAddress, r.company, r.service, r.billAmount, r.payAmount, r.discountPct, r.status, r.flags.join("; "), r.notes || ""])];
    const blob = new Blob([lines.map((l) => l.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "budget-ease-signups.csv"; a.click();
  }
  if (!res.data) return <p className="muted">{res.error || "Loading Budget Ease…"}</p>;
  return (
    <div className="stack">
      <BeTeam />
      <div className="kpi-grid">
        <div className="panel kpi"><div className="l"><PiggyBank size={13} /> Signups today</div><div className="v">{stats.today}</div><div className="d muted">{stats.total} in total</div></div>
        <div className="panel kpi"><div className="l">Approved</div><div className="v">{stats.approved}</div><div className="d muted">{all.filter((r) => r.status === "NEW").length} waiting</div></div>
        <div className="panel kpi"><div className="l">Average discount</div><div className="v">{stats.avgPct}<small>%</small></div></div>
        <div className="panel kpi"><div className="l">Customer savings (approved)</div><div className="v">{money(stats.savings)}</div><div className="d muted">a month</div></div>
      </div>
      <div className="toolbar">
        <nav className="seg" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l} ({k === "ALL" ? all.length : all.filter((r) => r.status === k).length})</button>)}</nav>
        <label className="sl-search" style={{ margin: 0, maxWidth: 260 }}><Search size={14} /><input placeholder="Name, phone, ID, company, ZIP" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <select value={agent} onChange={(e) => setAgent(e.target.value)} style={{ maxWidth: 200 }}><option value="">All agents</option>{agents.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
        <button className="ghost" onClick={csv} disabled={!shown.length} style={{ marginLeft: "auto" }}><Download size={14} /> CSV (no SSN/DOB)</button>
      </div>
      <div className="two-col be-cols">
        <div className="be-list">{shown.map((r) => <BeCard key={r.id} r={r} admin onStatus={setStatus} onDelete={del} onReveal={reveal} />)}{!shown.length && <div className="panel muted">Nothing here.</div>}</div>
        <section className="panel stack" style={{ alignSelf: "start" }}>
          <FoldHead id="lb-be" icon={<Trophy size={17} />} title="Budget Ease leaderboard" />
          <div className="dialer-list">{board.map((b, i) => <div key={b.id}><b className="num" style={{ width: 22 }}>{i + 1}</b><b>{b.name}</b><span className="chip ok">{b.approved} approved</span><span className="muted small" style={{ marginLeft: "auto" }}>{b.total} total · {b.today} today</span></div>)}{!board.length && <p className="muted">No signups yet.</p>}</div>
        </section>
      </div>
    </div>
  );
}
