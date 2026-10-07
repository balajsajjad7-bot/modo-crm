"use client";
// Admin → AI → Bots: Modo's automations — what each does, on/off, last run, and "Run all now".
import { useEffect, useState } from "react";
import Link from "next/link";
import { Bot, Play, RefreshCw, MessageSquare } from "lucide-react";
import { toneStyle } from "@/lib/tones";

const api = (url, method = "GET", body) => fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" }).then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }));
const ago = (d) => { if (!d) return "not run yet"; const s = (Date.now() - new Date(d)) / 1000; return s < 90 ? "just now" : s < 3600 ? Math.round(s / 60) + " min ago" : s < 86400 ? Math.round(s / 3600) + " h ago" : new Date(d).toLocaleDateString(); };

export default function BotsPage() {
  const [d, setD] = useState(null); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");
  const load = () => api("/api/bots/config").then((r) => r.ok && setD(r.data));
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);
  if (!d) return <p className="muted">Loading bots…</p>;
  const toggle = async (b) => { setD({ bots: d.bots.map((x) => (x.key === b.key ? { ...x, on: !x.on } : x)) }); await api("/api/bots/config", "POST", { key: b.key, on: !b.on }); };
  const runAll = async () => { setBusy(true); setMsg(""); const r = await api("/api/bots/config", "POST", { run: true }); setBusy(false); setMsg(r.ok ? "All bots ran. New messages (if any) are in Chat." : r.data.error || "Couldn't run."); load(); };
  const on = d.bots.filter((b) => b.on).length;
  return (
    <div className="stack">
      <section className="panel bots-head">
        <div><h2><Bot size={17} /> {on} of {d.bots.length} bots working for you</h2>
          <p className="muted small" style={{ margin: 0 }}>They run by themselves every minute or so while Modo is open anywhere (plus a background heartbeat). You get #modo-bot and WhatsApp; agents get their own Modo bot inbox; everyone sees #wins. Nothing is ever sent twice.</p></div>
        <div className="row" style={{ gap: 8 }}>
          <Link className="btn-link" href="/admin/chat"><MessageSquare size={14} /> Open Chat</Link>
          <button onClick={runAll} disabled={busy}>{busy ? <><RefreshCw size={14} className="spin" /> Running…</> : <><Play size={14} /> Run all now</>}</button>
        </div>
        {msg && <span className="small muted">{msg}</span>}
      </section>
      <div className="bots-grid">
        {d.bots.map((b) => (
          <article key={b.key} className={"bot-card" + (b.on ? "" : " off")}>
            <span className="bot-ic gt" style={toneStyle(b.name + " " + b.desc)}>{b.emoji}</span>
            <div className="bot-tx"><b>{b.name}</b><span>{b.desc}</span>
              <small className={b.run?.result?.startsWith("error") ? "bot-err" : ""}>{b.on ? (b.run?.result?.startsWith("error") ? "⚠️ " + b.run.result : "Last run " + ago(b.run?.at)) : "Off"}</small></div>
            <button role="switch" aria-checked={b.on} aria-label={(b.on ? "Turn off " : "Turn on ") + b.name} className={"toggle" + (b.on ? " on" : "")} onClick={() => toggle(b)}><span /></button>
          </article>
        ))}
      </div>
      <section className="panel stack">
        <h2><MessageSquare size={17} /> Talk to the bots</h2>
        <p className="muted small" style={{ margin: 0 }}>In Chat → #modo-bot (or from your admin WhatsApp): <b>bots</b>, <b>bot off pace</b>, <b>bot on pace</b>, <b>check</b> (run all), <b>brief</b>, <b>sales</b>, <b>online</b>, <b>late</b>, <b>callbacks</b>, <b>coach</b>, or just say what you want done. Agents type <b>help</b> in their Modo bot inbox: my sales, target, callbacks, breaks, leaderboard, contract, speech.</p>
      </section>
    </div>
  );
}
