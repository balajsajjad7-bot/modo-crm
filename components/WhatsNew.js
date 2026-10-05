"use client";
// What's new: the release notes for your role + any page added to your menu since you last looked.
// Also exports the small banner that appears once after each update, and the "new pages" tracker.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, X, ArrowRight, BadgePlus } from "lucide-react";
import { useShell } from "./Shell";

const forMe = (n, role) => typeof n === "string" || !n.for || (n.for === "admin" ? role !== "AGENT" : role === "AGENT");
const text = (n) => (typeof n === "string" ? n : n.text);
const get = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || "null") ?? d; } catch { return d; } };
const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
export const newer = (a, b) => String(a || "0").localeCompare(String(b || "0"), undefined, { numeric: true }) > 0;

// Pages in the menu the person hasn't seen before. First visit remembers everything (no flood of "new").
export function useNewPages() {
  const { nav = [], home } = useShell() || {};
  const [fresh, setFresh] = useState([]);
  const key = "modo-seen-pages-" + (home || "");
  const all = nav.flatMap((n) => n.children || [n]).filter((x) => x.href);
  const sig = all.map((x) => x.href).join("|");
  useEffect(() => {
    if (!all.length) return;
    const seen = get(key, null);
    if (!seen) { put(key, all.map((x) => x.href.split("?")[0])); return; }
    setFresh(all.filter((x) => !seen.includes(x.href.split("?")[0])));
  }, [sig]); // eslint-disable-line
  const markSeen = (href) => { const seen = get(key, []); const next = href ? [...new Set([...seen, href.split("?")[0]])] : [...new Set([...seen, ...all.map((x) => x.href.split("?")[0])])]; put(key, next); setFresh((f) => (href ? f.filter((x) => x.href !== href) : [])); };
  return { fresh, markSeen };
}

export function WhatsNewBanner() {
  const { me, home } = useShell() || {};
  const [d, setD] = useState(null); const [hide, setHide] = useState(true);
  useEffect(() => {
    fetch("/api/version").then((r) => r.json()).then((v) => {
      setD(v); const last = get("modo-seen-version", null);
      if (!last) put("modo-seen-version", v.version); // first time: nothing to announce
      else if (newer(v.version, last)) setHide(false);
    }).catch(() => {});
  }, []);
  if (hide || !d) return null;
  const role = me?.role || (home === "/agent" ? "AGENT" : "ADMIN");
  const last = get("modo-seen-version", "0");
  const notes = (d.changelog || []).filter((c) => newer(c.version, last)).flatMap((c) => c.notes.filter((n) => forMe(n, role)));
  if (!notes.length) return null;
  const close = () => { put("modo-seen-version", d.version); setHide(true); };
  return (
    <div className="wn-banner" role="status">
      <Sparkles size={16} /><div className="wn-b-t"><b>Modo updated to {d.version}</b><span className="ellipsis">{text(notes[0])}{notes.length > 1 ? ` · +${notes.length - 1} more` : ""}</span></div>
      <Link href={(home || "/admin") + "/whatsnew"} className="btn-link" onClick={close}>See what's new <ArrowRight size={12} /></Link>
      <button className="ghost sm icon-btn" aria-label="Dismiss" onClick={close}><X size={14} /></button>
    </div>
  );
}

export default function WhatsNew() {
  const { me, home } = useShell() || {};
  const [d, setD] = useState(null);
  const { fresh, markSeen } = useNewPages();
  const role = me?.role || (home === "/agent" ? "AGENT" : "ADMIN");
  const [last] = useState(() => (typeof window === "undefined" ? "0" : get("modo-seen-version", "0")));
  useEffect(() => { fetch("/api/version").then((r) => r.json()).then((v) => { setD(v); put("modo-seen-version", v.version); }).catch(() => setD({ changelog: [] })); }, []);
  if (!d) return <p className="muted">Loading…</p>;
  return (
    <div className="stack">
      {fresh.length > 0 && (
        <section className="panel stack wn-new">
          <div className="row" style={{ justifyContent: "space-between" }}><h2><BadgePlus size={17} /> New in your menu</h2><button className="ghost sm" onClick={() => markSeen()}>Mark all seen</button></div>
          <div className="ln-grid">{fresh.map((x) => (
            <Link key={x.href} href={x.href} className="ln-tile ln-go" onClick={() => markSeen(x.href)}><span className="ln-ic">{x.icon}</span><span className="ln-t"><b>{x.label} <em className="wn-chip">NEW</em></b>{x.hint && <small>{x.hint}</small>}</span></Link>
          ))}</div>
        </section>
      )}
      {(d.changelog || []).map((c) => {
        const notes = c.notes.filter((n) => forMe(n, role));
        if (!notes.length) return null;
        return (
          <section key={c.version} className={"panel stack" + (newer(c.version, last) ? " wn-fresh" : "")}>
            <h2 style={{ fontSize: 16 }}>Modo {c.version} <span className="muted small">{c.date}</span>{newer(c.version, last) && <em className="wn-chip">NEW</em>}</h2>
            <ul className="qa-ul">{notes.map((n, i) => <li key={i}>{text(n)}</li>)}</ul>
          </section>
        );
      })}
    </div>
  );
}
