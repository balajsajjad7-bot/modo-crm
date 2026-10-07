"use client";
// Admin → Team → Remote control: see every agent's Modo live and control it — message, lock, sign out, reload,
// open a page, end break, set status. One agent, several, or everyone at once.
import { useEffect, useMemo, useState } from "react";
import { MonitorSmartphone, MessageSquare, Lock, LockOpen, LogOut, RefreshCw, ExternalLink, Coffee, Users, Send, Circle, Eye, EyeOff } from "lucide-react";

const api = (url, method = "GET", body) => fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" }).then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }));
const ago = (t) => { if (!t) return "never"; const s = (Date.now() - new Date(t)) / 1000; return s < 60 ? "now" : s < 3600 ? Math.round(s / 60) + "m ago" : Math.round(s / 3600) + "h ago"; };
const PAGES = [["/agent", "My shift"], ["/agent/dialer", "Dialer"], ["/agent/sale", "Submit sale"], ["/agent/notepad", "Notepad"], ["/agent/chat", "Chat"], ["/agent/contract", "My contract"], ["/agent/tasks", "Callbacks"], ["/agent/lookups", "Lookups"]];
const PAGE_NAME = Object.fromEntries(PAGES);

export default function RemotePage() {
  const [d, setD] = useState(null); const [sel, setSel] = useState([]); const [text, setText] = useState(""); const [page, setPage] = useState("/agent/dialer"); const [msg, setMsg] = useState("");
  const load = () => api("/api/remote").then((r) => r.ok && setD(r.data));
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);
  const agents = d?.agents || [];
  const live = (a) => a.seen?.at && Date.now() - a.seen.at < 30000;
  const counts = useMemo(() => ({ live: agents.filter(live).length, locked: agents.filter((a) => a.locked).length, brk: agents.filter((a) => a.onBreak).length }), [d]); // eslint-disable-line
  if (!d) return <p className="muted">Loading agents…</p>;
  const send = async (type, to = sel.length ? sel : "all", extra = {}) => {
    if ((type === "logout" || type === "lock") && !confirm(`${type === "logout" ? "Sign out" : "Lock the screen of"} ${to === "all" ? "EVERY agent" : to.length + " agent(s)"}?`)) return;
    const r = await api("/api/remote", "POST", { to, type, ...extra });
    setMsg(r.ok ? `✓ Sent to ${r.data.sent} agent(s) — it happens within a few seconds.` : r.data.error); setTimeout(() => setMsg(""), 4000); load();
  };
  const toggle = (id) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const target = sel.length ? `${sel.length} selected` : "everyone";
  return (
    <div className="stack">
      <div className="rc-kpis">
        <div><Circle size={14} className="rc-live" /><b>{counts.live}</b><span>in Modo right now</span></div>
        <div><Coffee size={14} /><b>{counts.brk}</b><span>on break</span></div>
        <div><Lock size={14} /><b>{counts.locked}</b><span>locked</span></div>
        <div><Users size={14} /><b>{agents.length}</b><span>agents</span></div>
      </div>
      <section className="panel stack">
        <h2><Send size={17} /> Send to {target}</h2>
        <div className="rc-send">
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Message that pops up on their screen — e.g. Team meeting in 5 minutes, wrap up your calls." />
          <div className="rc-acts">
            <button onClick={() => text.trim() && send("message", undefined, { text })} disabled={!text.trim()}><MessageSquare size={14} /> Pop-up message</button>
            <button className="ghost" onClick={() => send("lock", undefined, { text: text || "Your screen is locked by your admin." })}><Lock size={14} /> Lock screen</button>
            <button className="ghost" onClick={() => send("unlock")}><LockOpen size={14} /> Unlock</button>
            <button className="ghost" onClick={() => send("reload")}><RefreshCw size={14} /> Reload Modo</button>
            <button className="ghost" onClick={() => send("endBreak")}><Coffee size={14} /> End break</button>
            <span className="rc-open"><select value={page} onChange={(e) => setPage(e.target.value)}>{PAGES.map(([u, l]) => <option key={u} value={u}>{l}</option>)}</select><button className="ghost" onClick={() => send("open", undefined, { url: page })}><ExternalLink size={14} /> Open page</button></span>
            <button className="ghost danger" onClick={() => send("logout")}><LogOut size={14} /> Sign out</button>
          </div>
          {msg && <span className="small muted">{msg}</span>}
        </div>
      </section>
      <section className="panel stack">
        <div className="row" style={{ justifyContent: "space-between" }}><h2><MonitorSmartphone size={17} /> Agents live</h2>
          <span className="row" style={{ gap: 6 }}><button className="ghost sm" onClick={() => setSel(agents.map((a) => a.id))}>Select all</button>{sel.length > 0 && <button className="ghost sm" onClick={() => setSel([])}>Clear</button>}</span></div>
        <div className="rc-list">
          {agents.map((a) => (
            <label key={a.id} className={"rc-row" + (sel.includes(a.id) ? " on" : "")}>
              <input type="checkbox" checked={sel.includes(a.id)} onChange={() => toggle(a.id)} />
              <span className={"rc-dot " + (a.locked ? "lock" : live(a) ? (a.seen.idle ? "idle" : a.onBreak ? "brk" : "on") : "off")} />
              <span className="rc-who"><b>{a.name}</b><small>{a.agentId} · {a.locked ? "🔒 locked" : live(a) ? (a.onBreak ? "☕ on break" : a.seen.idle ? "💤 idle" : "🟢 active") : "offline · seen " + ago(a.lastSeenAt)}</small></span>
              <span className="rc-page">{live(a) ? <>{a.seen.visible ? <Eye size={12} /> : <EyeOff size={12} />} {PAGE_NAME[a.seen.path] || a.seen.title?.replace(/ · Modo.*$/, "") || a.seen.path}</> : "—"}</span>
              <span className="rc-quick">
                <button type="button" className="ghost sm icon-btn" title="Message" onClick={(e) => { e.preventDefault(); const t = prompt("Message to " + a.name); if (t) send("message", [a.id], { text: t }); }}><MessageSquare size={13} /></button>
                <button type="button" className="ghost sm icon-btn" title={a.locked ? "Unlock" : "Lock"} onClick={(e) => { e.preventDefault(); send(a.locked ? "unlock" : "lock", [a.id], { text: "Your screen is locked by your admin." }); }}>{a.locked ? <LockOpen size={13} /> : <Lock size={13} />}</button>
                <button type="button" className="ghost sm icon-btn" title="Sign out" onClick={(e) => { e.preventDefault(); send("logout", [a.id]); }}><LogOut size={13} /></button>
              </span>
            </label>
          ))}
          {!agents.length && <p className="muted small">No agents yet.</p>}
        </div>
        <p className="muted small" style={{ margin: 0 }}>Works whenever the agent has Modo open (browser, Windows app or phone). "In Modo right now" = checked in within the last 30 seconds; 👁 = Modo is the window they're looking at.</p>
      </section>
    </div>
  );
}
