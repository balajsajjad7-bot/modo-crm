"use client";
// Connected apps: every service Modo can use, with one-tap Connect. Connected apps show up in the menu (Apps).
import { useEffect, useState } from "react";
import Link from "next/link";
import { Plug, CheckCircle2, Circle, ArrowRight, Cloud } from "lucide-react";

export default function Apps() {
  const [d, setD] = useState(null);
  useEffect(() => { fetch("/api/apps", { cache: "no-store" }).then((r) => r.json()).then(setD).catch(() => setD({ apps: [] })); }, []);
  if (!d) return <p className="muted">Loading apps…</p>;
  const apps = d.apps || [];
  const on = apps.filter((a) => a.connected), off = apps.filter((a) => !a.connected);
  const Card = ({ a }) => (
    <div className={"app-card" + (a.connected ? " on" : "")}>
      <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>{a.connected ? <CheckCircle2 size={16} className="app-ok" /> : <Circle size={16} className="muted" />}<b>{a.label}</b></div>
      <span className="small muted app-hint">{a.connected ? a.detail || "Connected" : a.hint}</span>
      <div className="row" style={{ gap: 6, marginTop: "auto" }}>
        {a.connected && a.open && <Link className="btn-link" href={a.open.href}>Open {a.open.label} <ArrowRight size={12} /></Link>}
        <Link className={a.connected ? "btn-link" : "btn-link app-connect"} href={a.setup}>{a.connected ? "Settings" : <><Cloud size={12} /> Connect</>}</Link>
      </div>
    </div>
  );
  const groups = [...new Set(off.map((a) => a.group))];
  return (
    <div className="stack">
      <section className="panel stack">
        <h2><Plug size={17} /> Connected ({on.length})</h2>
        {on.length ? <div className="app-grid">{on.map((a) => <Card key={a.key} a={a} />)}</div> : <p className="muted small" style={{ margin: 0 }}>Nothing connected yet. Pick an app below.</p>}
        <p className="muted small" style={{ margin: 0 }}>Connected apps appear in your menu under <b>Apps</b> automatically. Google Drive and Dropbox connect by asking your permission; you never type your Google or Dropbox password into Modo.</p>
      </section>
      {groups.map((g) => (
        <section key={g} className="panel stack"><h2>{g}</h2><div className="app-grid">{off.filter((a) => a.group === g).map((a) => <Card key={a.key} a={a} />)}</div></section>
      ))}
    </div>
  );
}
