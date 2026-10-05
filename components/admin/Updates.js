"use client";
import { useEffect, useState } from "react";
import { api } from "./api";
import { Download, RefreshCw, Sparkles } from "lucide-react";
export default function Updates() {
  const [d, setD] = useState(null);
  const load = () => { setD(null); api("/api/version").then((r) => r.ok && setD(r.data)); };
  useEffect(() => { load(); }, []);
  if (!d) return <p className="muted">Checking…</p>;
  return (
    <div className="stack">
      <section className="panel stack">
        <div className="row" style={{ justifyContent: "space-between" }}><h2><Sparkles size={17} /> Modo {d.version}</h2><button className="ghost sm" onClick={load}><RefreshCw size={13} /> Check for updates</button></div>
        {d.newer ? <div className="receipt"><b>Modo {d.latest.version} is available.</b> {d.latest.notes}{d.latest.url && <> <a href={d.latest.url} target="_blank" rel="noreferrer">Download</a></>}</div>
          : <p className="muted small" style={{ margin: 0 }}>{d.latest ? "You're on the latest version." : "How to update: double-click update-crm.bat in your Modo folder (it adds new files and database tables), then push to GitHub so Netlify publishes it."}</p>}
      </section>
      {d.changelog.map((c) => (
        <section key={c.version} className="panel stack"><h2 style={{ fontSize: 16 }}>{c.version} <span className="muted small">{c.date}</span></h2><ul className="qa-ul">{c.notes.map((n, i) => <li key={i}>{typeof n === "string" ? n : n.text}</li>)}</ul></section>
      ))}
    </div>
  );
}
