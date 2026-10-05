"use client";
// Admin → Sales: every sale as a frosted card on its own violet-pink-cyan aurora. Mark each one Active or Not active.
import { useEffect, useMemo, useState } from "react";
import { usePoll, api } from "./api";
import SaleCard from "@/components/SaleCard";
import EmailComposer from "@/components/EmailComposer";
import { useShell } from "@/components/Shell";
import { Search, ChevronsUpDown } from "lucide-react";

const TABS = [["NEW", "New"], ["VERIFIED", "Active"], ["REJECTED", "Not active"], ["ALL", "All"]];

export default function SalesBoard() {
  const [{ data, error }, reload] = usePoll("/api/sales", 15000);
  const [tab, setTab] = useState("NEW"); const [q, setQ] = useState(""); const [office, setOffice] = useState(""); const [camp, setCamp] = useState(""); const [camps, setCamps] = useState([]);
  useEffect(() => { api("/api/org").then((r) => r.ok && setCamps(Array.isArray(r.data.campaigns) ? r.data.campaigns : [])); }, []);
  const { me } = useShell(); const [mail, setMail] = useState(null);
  const [local, setLocal] = useState({}); const [gone, setGone] = useState({}); const [expand, setExpand] = useState(false);
  const list = useMemo(() => (data || []).filter((s) => !gone[s.id]).map((s) => { const c = camps.find((x) => x.id === s.campaignId); return { ...s, status: local[s.id] || s.status, campaignName: c?.name, campaignColor: c?.color }; }), [data, local, gone, camps]);
  const count = (st) => list.filter((s) => st === "ALL" || s.status === st).length;
  const shown = list.filter((s) => (tab === "ALL" || s.status === tab) && (!office || s.office === office) && (!camp || s.campaignId === camp) &&
    (!q || [s.orderNumber, s.customer, s.phone, s.email, s.device, s.user?.name, s.closer, s.zip, s.locationCode].join(" ").toLowerCase().includes(q.toLowerCase())));
  const offices = [...new Set(list.map((s) => s.office).filter(Boolean))];
  const active = list.filter((s) => s.status === "VERIFIED");
  async function setStatus(id, status) { setLocal((l) => ({ ...l, [id]: status })); const r = await api("/api/sales", "PATCH", { id, status }); if (!r.ok) alert(r.data.error || "Couldn't update the sale."); reload(); }
  async function remove(s) {
    if (!confirm(`Delete sale #${s.orderNumber || s.receipt} for ${s.customer || "this customer"}? This can't be undone.`)) return;
    setGone((g) => ({ ...g, [s.id]: true })); const r = await api("/api/sales?id=" + s.id, "DELETE"); if (!r.ok) alert("Couldn't delete the sale."); reload();
  }

  if (error) return <p className="err">{error}</p>;
  return (
    <div className="sales-page stack">
      <div className="sales-kpis">
        <div><span>New</span><b>{count("NEW")}</b></div>
        <div><span>Active</span><b>{count("VERIFIED")}</b></div>
        <div><span>Not active</span><b>{count("REJECTED")}</b></div>
        <div><span>Active monthly value</span><b>${active.reduce((t, s) => t + (s.billAfter || s.amount || 0), 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}</b></div>
      </div>
      <div className="toolbar">
        <nav className="seg" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l} <span className="muted">({count(k)})</span></button>)}</nav>
        <label className="sl-search" style={{ margin: 0, maxWidth: 340, flex: 1, background: "rgba(255,255,255,.06)" }}><Search size={14} /><input placeholder="Order #, customer, phone, device, agent…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <button className="ghost sm" onClick={() => setExpand(!expand)}><ChevronsUpDown size={14} /> {expand ? "Collapse all" : "Expand all"}</button>
        {camps.length > 0 && <select value={camp} onChange={(e) => setCamp(e.target.value)} style={{ maxWidth: 170 }}><option value="">All campaigns</option>{camps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
        {offices.length > 0 && <select value={office} onChange={(e) => setOffice(e.target.value)} style={{ maxWidth: 170 }}><option value="">All offices</option>{offices.map((o) => <option key={o}>{o}</option>)}</select>}
      </div>
      {!data ? <p className="muted">Loading sales…</p> : !shown.length ? <p className="muted">No {tab === "ALL" ? "" : TABS.find((t) => t[0] === tab)[1].toLowerCase() + " "}sales{q ? " match your search" : " yet"}.</p> : (
        <div className="sale-grid">{shown.map((s, i) => <div key={s.id} className="rise" style={{ animationDelay: Math.min(i, 12) * 45 + "ms" }}><SaleCard key={s.id + (expand ? "o" : "c")} s={s} onStatus={setStatus} onDelete={remove} onEmail={setMail} defaultOpen={expand} /></div>)}</div>
      )}
      {mail && <EmailComposer to={mail.email} sender={me?.name} saleId={mail.id}
        data={{ customer: (mail.customer || "").split(" ")[0], orderNumber: mail.orderNumber, device: mail.device, storage: mail.storage, deviceColor: mail.deviceColor, gift: mail.gift, billBefore: mail.billBefore, billAfter: mail.billAfter, discountPct: mail.discountPct, nextBillDate: mail.nextBillDate }}
        onClose={() => setMail(null)} />}
    </div>
  );
}
