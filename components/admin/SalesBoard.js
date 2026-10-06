"use client";
// Admin → Sales: every sale as a frosted card on its own violet-pink-cyan aurora. Mark each one Active or Not active.
import { useEffect, useMemo, useRef, useState } from "react";
import { usePoll, api } from "./api";
import SaleCard from "@/components/SaleCard";
import { cheer } from "@/components/Cheers";
import EmailComposer from "@/components/EmailComposer";
import { useShell } from "@/components/Shell";
import { Search, ChevronsUpDown, ChevronLeft, ChevronRight, LayoutGrid, RectangleHorizontal } from "lucide-react";

const TABS = [["NEW", "New"], ["VERIFIED", "Active"], ["REJECTED", "Not active"], ["ALL", "All"]];

export default function SalesBoard() {
  const [{ data, error }, reload] = usePoll("/api/sales", 15000);
  const [tab, setTab] = useState("NEW"); const [q, setQ] = useState(""); const [office, setOffice] = useState(""); const [camp, setCamp] = useState(""); const [camps, setCamps] = useState([]);
  useEffect(() => { api("/api/org").then((r) => r.ok && setCamps(Array.isArray(r.data.campaigns) ? r.data.campaigns : [])); }, []);
  const { me } = useShell(); const [mail, setMail] = useState(null);
  // One sale at a time (wide, with Previous / Next) or the grid of cards
  const [one, setOne] = useState(true); const [idx, setIdx] = useState(0); const touch = useRef(null);
  useEffect(() => { try { const v = localStorage.getItem("modo-sales-view"); if (v) setOne(v === "one"); } catch {} }, []);
  const setView = (v) => { setOne(v); try { localStorage.setItem("modo-sales-view", v ? "one" : "grid"); } catch {} };
  const [local, setLocal] = useState({}); const [gone, setGone] = useState({}); const [expand, setExpand] = useState(false);
  const list = useMemo(() => (data || []).filter((s) => !gone[s.id]).map((s) => { const c = camps.find((x) => x.id === s.campaignId); return { ...s, status: local[s.id] || s.status, campaignName: c?.name, campaignColor: c?.color }; }), [data, local, gone, camps]);
  const count = (st) => list.filter((s) => st === "ALL" || s.status === st).length;
  const shown = list.filter((s) => (tab === "ALL" || s.status === tab) && (!office || s.office === office) && (!camp || s.campaignId === camp) &&
    (!q || [s.orderNumber, s.customer, s.phone, s.email, s.device, s.user?.name, s.closer, s.zip, s.locationCode].join(" ").toLowerCase().includes(q.toLowerCase())));
  const offices = [...new Set(list.map((s) => s.office).filter(Boolean))];
  const active = list.filter((s) => s.status === "VERIFIED");
  const cur = Math.min(idx, Math.max(0, shown.length - 1));
  const go = (d) => {
    const to = Math.max(0, Math.min(shown.length - 1, cur + d));
    if (to === cur) return; // nothing to move to: don't touch the scroll position
    setIdx(to);
    const el = document.querySelector(".sale-one"); if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  useEffect(() => { setIdx(0); }, [tab, q, office, camp]);
  useEffect(() => {
    if (!one) return;
    const key = (e) => { if (/input|textarea|select/i.test(e.target.tagName) || document.querySelector(".sale-card.max")) return; if (e.key === "ArrowRight") go(1); if (e.key === "ArrowLeft") go(-1); };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [one, shown.length]); // eslint-disable-line
  // Package delivered (the Modo bot noticed) → a quick celebration on screen
  const seenUps = useRef(null);
  useEffect(() => {
    if (!Array.isArray(data)) return;
    const now = Object.fromEntries(data.map((x) => [x.id, x.upsStatus]));
    if (seenUps.current) data.forEach((x) => { const was = seenUps.current[x.id]; if (x.upsStatus === "delivered" && was !== undefined && was !== "delivered") cheer({ title: `📦 Delivered · #${x.orderNumber || ""}`, body: `${(x.customer || "The customer").split(" ")[0]}'s ${x.device || "package"} arrived (UPS).`, device: x.device, color: x.deviceColor }); });
    seenUps.current = now;
  }, [data]);
  const activeValue = active.reduce((t, s) => t + (s.deviceValue || 0), 0);
  const unpriced = active.filter((s) => s.device && s.deviceValue == null).length;
  // Return labels (Shippo) set up?
  const [labels, setLabels] = useState(null);
  useEffect(() => { api("/api/sales/return-label").then((r) => r.ok && setLabels(r.data)); }, []);
  // Price devices automatically: a few at a time, Active sales first, each sale tried once per visit.
  const tried = useRef(new Set()); const pricing = useRef(false); const [priceErr, setPriceErr] = useState("");
  useEffect(() => {
    if (!data || pricing.current) return;
    const todo = [...list].sort((a, b) => (b.status === "VERIFIED") - (a.status === "VERIFIED"))
      .filter((s) => s.device && s.deviceValue == null && s.status !== "REJECTED" && !tried.current.has(s.id)).slice(0, 4);
    if (!todo.length) return;
    todo.forEach((s) => tried.current.add(s.id)); pricing.current = true;
    api("/api/sales/value", "POST", { ids: todo.map((s) => s.id) }).then((r) => { pricing.current = false; if (!r.ok) setPriceErr(r.data.error || ""); else { setPriceErr(""); reload(); } });
  }, [data, list]); // eslint-disable-line
  async function setStatus(id, status) {
    const was = list.find((x) => x.id === id);
    setLocal((l) => ({ ...l, [id]: status })); const r = await api("/api/sales", "PATCH", { id, status });
    if (!r.ok) alert(r.data.error || "Couldn't update the sale.");
    else if (status === "VERIFIED" && was?.status !== "VERIFIED") cheer({ title: `Well done! #${was?.orderNumber || ""} is Active 🎉`, body: `${(was?.user?.name || "The agent").split(" ")[0]} just got a congrats.`, device: was?.device, color: was?.deviceColor });
    reload();
  }
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
        <div title="What the devices on Active sales are worth today, looked up online"><span>Active device value</span><b>${activeValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}</b>
          {unpriced > 0 && <small className="kpi-sub">{priceErr ? "Price check failed: " + priceErr : `Checking ${unpriced} device price${unpriced > 1 ? "s" : ""}…`}</small>}</div>
      </div>
      <div className="toolbar">
        <nav className="seg" role="tablist">{TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l} <span className="muted">({count(k)})</span></button>)}</nav>
        <label className="sl-search" style={{ margin: 0, maxWidth: 340, flex: 1, background: "rgba(255,255,255,.06)" }}><Search size={14} /><input placeholder="Order #, customer, phone, device, agent…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <nav className="seg view-seg" aria-label="View"><button aria-selected={one} onClick={() => setView(true)}><RectangleHorizontal size={14} /> One at a time</button><button aria-selected={!one} onClick={() => setView(false)}><LayoutGrid size={14} /> Grid</button></nav>
        {!one && <button className="ghost sm" onClick={() => setExpand(!expand)}><ChevronsUpDown size={14} /> {expand ? "Collapse all" : "Expand all"}</button>}
        {camps.length > 0 && <select value={camp} onChange={(e) => setCamp(e.target.value)} style={{ maxWidth: 170 }}><option value="">All campaigns</option>{camps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
        {offices.length > 0 && <select value={office} onChange={(e) => setOffice(e.target.value)} style={{ maxWidth: 170 }}><option value="">All offices</option>{offices.map((o) => <option key={o}>{o}</option>)}</select>}
      </div>
      {!data ? <p className="muted">Loading sales…</p> : !shown.length ? <p className="muted">No {tab === "ALL" ? "" : TABS.find((t) => t[0] === tab)[1].toLowerCase() + " "}sales{q ? " match your search" : " yet"}.</p> : (
        one ? (
          <div className="sale-one" onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now() })} onTouchEnd={(e) => {
            // A real sideways swipe only: mostly horizontal, quick, not on the map or a text box. Scrolling up/down never changes the sale.
            const st = touch.current; touch.current = null; if (!st) return;
            const dx = e.changedTouches[0].clientX - st.x, dy = e.changedTouches[0].clientY - st.y;
            if (Math.abs(dx) > 90 && Math.abs(dx) > 2.5 * Math.abs(dy) && Date.now() - st.t < 700 && !e.target.closest(".sm-map-wrap, input, textarea, select, .ups-rail")) go(dx < 0 ? 1 : -1);
          }}>
            <div className="sale-pager">
              <button className="ghost" onClick={() => go(-1)} disabled={cur === 0}><ChevronLeft size={16} /> Previous</button>
              <span className="sale-pos"><b>{cur + 1}</b> of {shown.length}</span>
              <button onClick={() => go(1)} disabled={cur >= shown.length - 1}>Next sale <ChevronRight size={16} /></button>
            </div>
            <SaleCard key={shown[cur].id} s={shown[cur]} labels={labels} onStatus={setStatus} onDelete={remove} onEmail={setMail} defaultOpen wide />
            {shown.length > 1 && <div className="sale-pager bottom">
              <button className="ghost" onClick={() => go(-1)} disabled={cur === 0}><ChevronLeft size={16} /> Previous</button>
              <div className="sale-dots">{shown.slice(Math.max(0, cur - 6), cur + 7).map((x) => { const i = shown.indexOf(x); return <button key={x.id} className={"sale-dot" + (i === cur ? " on" : "")} title={`#${x.orderNumber || ""} ${x.customer || ""}`} onClick={() => { setIdx(i); window.scrollTo({ top: 0, behavior: "smooth" }); }} aria-label={`Sale ${i + 1}`} />; })}</div>
              <button onClick={() => go(1)} disabled={cur >= shown.length - 1}>Next sale <ChevronRight size={16} /></button>
            </div>}
          </div>
        ) : (
        <div className="sale-grid">{shown.map((s, i) => <div key={s.id} className="rise" style={{ animationDelay: Math.min(i, 12) * 45 + "ms" }}><SaleCard key={s.id + (expand ? "o" : "c")} s={s} labels={labels} onStatus={setStatus} onDelete={remove} onEmail={setMail} defaultOpen={expand} /></div>)}</div>
        )
      )}
      {mail && <EmailComposer to={mail.email} sender={me?.name} saleId={mail.id}
        data={{ customer: (mail.customer || "").split(" ")[0], orderNumber: mail.orderNumber, device: mail.device, storage: mail.storage, deviceColor: mail.deviceColor, gift: mail.gift, billBefore: mail.billBefore, billAfter: mail.billAfter, discountPct: mail.discountPct, nextBillDate: mail.nextBillDate }}
        onClose={() => setMail(null)} />}
    </div>
  );
}
