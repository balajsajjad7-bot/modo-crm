"use client";
// Home launcher: big buttons for every page (same list as the menu, so permissions are respected).
// Pin favourites with the star; they stay at the top on this device.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Star, Search, LayoutGrid, ChevronDown } from "lucide-react";
import { useShell } from "./Shell";
import { toneStyle } from "@/lib/tones";
import { useNewPages } from "./WhatsNew";

export default function Launcher({ title = "Go to" }) {
  const { nav = [], home } = useShell() || {};
  const path = usePathname();
  const { fresh, markSeen } = useNewPages(); const isNew = (h) => fresh.some((x) => x.href === h);
  const [pins, setPins] = useState([]); const [q, setQ] = useState(""); const [all, setAll] = useState(false);
  const key = "modo-pins-" + (home || "");
  useEffect(() => { try { setPins(JSON.parse(localStorage.getItem(key) || "[]")); setAll(localStorage.getItem(key + "-open") === "1"); } catch {} }, [key]);
  const toggle = (href) => { const next = pins.includes(href) ? pins.filter((x) => x !== href) : [...pins, href]; setPins(next); try { localStorage.setItem(key, JSON.stringify(next)); } catch {} };
  const setOpen = (v) => { setAll(v); try { localStorage.setItem(key + "-open", v ? "1" : "0"); } catch {} };
  const groups = useMemo(() => nav.map((n) => (n.children ? { label: n.label, icon: n.icon, items: n.children } : { label: null, items: [n] })), [nav]);
  const flat = groups.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label }))).filter((i) => i.href && i.href !== path);
  const term = q.trim().toLowerCase();
  const found = term ? flat.filter((i) => (i.label + " " + (i.hint || "") + " " + (i.group || "")).toLowerCase().includes(term)) : null;
  const pinned = flat.filter((i) => pins.includes(i.href));
  // Without pins, show the most useful first 8 so the home screen is never bare
  const PREF = ["/admin/autodial", "/agent/dialer", "/admin/phone", "/agent/phone", "/admin/sales", "/agent/sale", "/agent/budgetease", "/admin/agents", "/admin/attendance", "/admin/chat", "/agent/chat", "/admin/ai", "/agent/ai", "/admin/drive", "/agent/contacts", "/agent/notepad", "/admin/reports"];
  const rank = (h) => { const i = PREF.indexOf(h); return i < 0 ? 99 : i; };
  const quick = [...(pinned.length ? pinned : [...flat].sort((a, b) => rank(a.href) - rank(b.href)).slice(0, 8)), ...flat.filter((x) => isNew(x.href) && !pins.includes(x.href)).slice(0, 4)].filter((x, i, arr) => arr.findIndex((y) => y.href === x.href) === i);
  const Tile = ({ it }) => (
    <div className="ln-tile">
      <Link href={it.href} className="ln-go" onClick={() => isNew(it.href) && markSeen(it.href)}><span className="ln-ic gt" style={toneStyle(it.label + " " + (it.hint || ""))}>{it.icon}</span><span className="ln-t"><b><span className="ln-l">{it.label}</span>{it.badge ? <em className="ln-badge">{it.badge}</em> : null}{isNew(it.href) && <em className="wn-chip">NEW</em>}</b>{it.hint && <small>{it.hint}</small>}</span></Link>
      <button className={"ghost ln-pin" + (pins.includes(it.href) ? " on" : "")} aria-label={pins.includes(it.href) ? "Unpin" : "Pin to home"} title={pins.includes(it.href) ? "Unpin" : "Pin to home"} onClick={() => toggle(it.href)}><Star size={14} /></button>
    </div>
  );
  if (!flat.length) return null;
  return (
    <section className="panel stack launcher">
      <div className="ln-head">
        <h2><LayoutGrid size={17} /> {title}</h2>
        <label className="ln-search"><Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a page…" /></label>
      </div>
      {found ? (found.length ? <div className="ln-grid">{found.map((it) => <Tile key={it.href} it={it} />)}</div> : <p className="muted small" style={{ margin: 0 }}>No page matches “{q}”.</p>) : (
        <>
          <div className="ln-sub">{pinned.length ? "Pinned" : "Quick start"} {!pinned.length && <span className="muted small ln-hint">· tap ☆ to pin</span>}</div>
          <div className="ln-grid">{quick.map((it) => <Tile key={it.href} it={it} />)}</div>
          <button className="ghost sm ln-more" onClick={() => setOpen(!all)} aria-expanded={all}><ChevronDown size={14} style={{ transform: all ? "rotate(180deg)" : "none", transition: "transform .2s" }} /> {all ? "Hide all pages" : `All pages (${flat.length})`}</button>
          {all && groups.map((g, gi) => { const items = g.items.filter((i) => i.href && i.href !== path); if (!items.length) return null; return (
            <div key={gi} className="ln-group"><div className="ln-sub">{g.icon}{g.label || "General"}</div><div className="ln-grid">{items.map((it) => <Tile key={it.href} it={{ ...it, group: g.label }} />)}</div></div>
          ); })}
        </>
      )}
    </section>
  );
}
