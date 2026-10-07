"use client";
// Modo → WhatsApp inbox: your whole linked WhatsApp in Modo. Every chat (customers, groups, and what you send
// from the phone), Modo's suggested replies waiting for your OK, and the rules for what Modo may say to customers.
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import WaCommands from "@/components/WaCommands";
import WaLockGate, { WaLockBar } from "@/components/WaLockGate";
import { waLabel, initialsOf } from "@/lib/waName";
import { MessageCircle, Send, Search, Plus, Check, X, Pencil, Users, ShieldCheck, ArrowLeft, Sparkles, Phone, BookOpen, Ban, Link2, Clock, Settings2 } from "lucide-react";

const api = (url, method = "GET", body) => fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" }).then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }));
const ago = (d) => { const s = (Date.now() - new Date(d)) / 1000; return s < 60 ? "now" : s < 3600 ? Math.floor(s / 60) + "m" : s < 86400 ? Math.floor(s / 3600) + "h" : new Date(d).toLocaleDateString([], { month: "short", day: "numeric" }); };

export default function WhatsAppInboxPage() { return <WaLockGate><WhatsAppInbox /></WaLockGate>; }

function WhatsAppInbox() {
  const [d, setD] = useState(null);
  const [tab, setTab] = useState("inbox");
  const [cur, setCur] = useState(null); const [msgs, setMsgs] = useState([]);
  const [q, setQ] = useState(""); const [filter, setFilter] = useState("all");
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const [edit, setEdit] = useState(null); // draft being edited
  const [newChat, setNewChat] = useState(null);
  const end = useRef(null);

  const load = async () => { const r = await api("/api/wa-inbox"); if (r.ok) setD(r.data); };
  const loadThread = async (id) => { const r = await api("/api/wa-inbox?c=" + encodeURIComponent(id)); if (r.ok) setMsgs(r.data.messages); };
  useEffect(() => { load(); const t = setInterval(load, 6000); return () => clearInterval(t); }, []);
  useEffect(() => { if (!cur) return; loadThread(cur); const t = setInterval(() => loadThread(cur), 4000); return () => clearInterval(t); }, [cur]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs.length, cur]);
  useEffect(() => { const u = new URLSearchParams(location.search); if (u.get("c")) setCur(u.get("c")); if (u.get("new")) setNewChat({ to: u.get("to") || "", name: "", text: "" }); }, []);

  const chats = useMemo(() => (d?.chats || []).map((c) => ({ ...c, w: waLabel(c.id, c.name) })).filter((c) => (filter === "waiting" ? c.draft || c.waiting : filter === "groups" ? c.group : filter === "people" ? !c.group : true) && (!q || (c.name + " " + c.w.digits + " " + c.last).toLowerCase().includes(q.toLowerCase().replace(/[^\w\s]/g, "")))), [d, q, filter]);
  if (!d) return <p className="muted">Loading…</p>;
  const chat0 = d.chats.find((c) => c.id === cur);
  const chat = chat0 || (cur ? { id: cur, name: "", group: cur.startsWith("wa-g-"), at: new Date().toISOString() } : null);
  const cw = chat ? waLabel(chat.id, chat.name) : null;
  const draft = d.drafts.find((x) => x.conv === cur);

  const send = async () => {
    if (!text.trim() || !cur) return; setBusy(true); setErr("");
    const r = await api("/api/wa-inbox", "POST", { action: "send", c: cur, text }); setBusy(false);
    if (!r.ok) return setErr(r.data.error || "Couldn't send"); setText(""); loadThread(cur); load();
  };
  const act = async (code, op, body) => { setBusy(true); setErr(""); const r = await api("/api/wa-inbox", "POST", { action: "draft", code, op, text: body }); setBusy(false); if (!r.ok) setErr(r.data.error); setEdit(null); load(); if (cur) loadThread(cur); };
  const startNew = async () => { setBusy(true); setErr(""); const r = await api("/api/wa-inbox", "POST", { action: "new", ...newChat }); setBusy(false); if (r.data.id) { setCur(r.data.id); setNewChat(null); load(); } if (!r.ok) setErr(r.data.error); };

  return (
    <div className="stack wai">
      <section className="panel wai-head">
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <span className={"chip " + (d.linked ? "ok" : "late")}>{d.linked ? "Linked · +" + d.me : "Not linked"}</span>
          {d.drafts.length > 0 && <span className="chip wai-wait"><Clock size={12} /> {d.drafts.length} waiting for your OK</span>}
          <WaLockBar />
          <button className="sm wai-text" onClick={() => { setTab("inbox"); setCur(null); setNewChat({ to: "", name: "", text: "" }); }}><Send size={13} /> Text a number</button>
        </div>
        <div className="wai-tabs" role="tablist">
          {[["inbox", "Chats", MessageCircle], ["rules", "What Modo says", ShieldCheck], ["commands", "Commands", BookOpen]].map(([k, l, I]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}><I size={14} />{l}</button>
          ))}
          <Link href="/admin/whatsapp" className="wai-tablink"><Settings2 size={14} />Link & settings</Link>
        </div>
      </section>

      {!d.linked && <div className="tr-warn small"><span>WhatsApp isn't linked right now — chats are saved, but messages you send are queued until it's linked again in <Link href="/admin/whatsapp">Setup → WhatsApp</Link>.</span></div>}
      {err && <div className="err small">{err}</div>}

      {tab === "inbox" && (
        <div className={"wai-grid" + (cur || newChat ? " has-cur" : "")}>
          <aside className="wai-list panel">
            <div className="wai-search"><Search size={15} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats" /></div>
            <div className="wai-filters">
              {[["all", "All"], ["waiting", "Waiting"], ["people", "People"], ["groups", "Groups"]].map(([k, l]) => <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{l}</button>)}
              <button className="wai-new" onClick={() => setNewChat({ to: "", name: "", text: "" })} title="New chat"><Plus size={15} /></button>
            </div>
            <div className="wai-items">
              {!chats.length && <p className="muted small" style={{ padding: 14 }}>{d.chats.length ? "Nothing matches." : "No WhatsApp chats yet. When someone messages your linked number, the chat appears here."}</p>}
              {chats.map((c) => (
                <button key={c.id} className={"wai-item" + (cur === c.id ? " on" : "")} onClick={() => { setCur(c.id); setEdit(null); setNewChat(null); }}>
                  <span className={"wai-av" + (c.group ? " g" : "")}>{c.group ? <Users size={16} /> : initialsOf(c.w.name)}</span>
                  <span className="wai-it">
                    <b>{c.w.name}</b>{c.w.number && <em>{c.w.number}</em>}
                    <small>{c.draft ? <><Sparkles size={11} /> Reply waiting for your OK</> : (c.lastSide === "me" || c.lastSide === "team" || c.lastSide === "bot" ? "You: " : "") + (c.last || "")}</small>
                  </span>
                  <span className="wai-meta"><small>{ago(c.at)}</small>{c.draft ? <i className="wai-dot amber" /> : c.waiting ? <i className="wai-dot" /> : null}</span>
                </button>
              ))}
            </div>
          </aside>

          <section className="wai-thread panel">
            {newChat ? (
              <div className="stack" style={{ padding: 16 }}>
                <div className="row" style={{ gap: 8 }}><button className="ghost sm icon-btn" onClick={() => setNewChat(null)} aria-label="Back"><ArrowLeft size={15} /></button><b>New WhatsApp chat</b></div>
                <input value={newChat.to} onChange={(e) => setNewChat({ ...newChat, to: e.target.value })} placeholder="Phone number — e.g. 305 555 0199 or +92 300 1234567" inputMode="tel" />
                <input value={newChat.name} onChange={(e) => setNewChat({ ...newChat, name: e.target.value })} placeholder="Name (optional)" />
                <textarea value={newChat.text} onChange={(e) => setNewChat({ ...newChat, text: e.target.value })} placeholder="Message" style={{ minHeight: 90 }} />
                <p className="muted small" style={{ margin: 0 }}>Only message people who expect to hear from you — WhatsApp bans numbers that cold-message.</p>
                <div><button onClick={startNew} disabled={busy || !newChat.to || !newChat.text}><Send size={14} /> Send</button></div>
              </div>
            ) : !chat ? (
              <div className="wai-empty"><MessageCircle size={40} /><b>Pick a chat</b><span className="muted small">Everything on your linked WhatsApp shows here — reply from Modo or OK Modo's suggested answers.</span></div>
            ) : (
              <>
                <header className="wai-th">
                  <button className="ghost sm icon-btn wai-back" onClick={() => setCur(null)} aria-label="Back to chats"><ArrowLeft size={16} /></button>
                  <span className={"wai-av" + (chat.group ? " g" : "")}>{chat.group ? <Users size={16} /> : initialsOf(cw.name)}</span>
                  <span className="wai-it"><b>{cw.name}</b><small>{cw.number || (chat.group ? "WhatsApp group" : "Customer")}</small></span>
                  <span className="wai-acts">
                    {cw.us && <Link className="wai-act" href={"/admin/phone?n=" + cw.digits.slice(1) + "&name=" + encodeURIComponent(cw.name)} title="Call from Modo phone" aria-label="Call"><Phone size={16} /></Link>}
                    {!cw.group && cw.digits && <a className="wai-act wa" href={"https://wa.me/" + cw.digits} target="_blank" rel="noreferrer" title="Open in WhatsApp — call or video call from your phone" aria-label="Open in WhatsApp"><MessageCircle size={16} /></a>}
                  </span>
                </header>
                <div className="wai-msgs">
                  {msgs.map((m) => m.kind === "SYSTEM" ? (
                    m.text?.startsWith("💡") ? null : <div key={m.id} className="wai-sys">{m.text}</div>
                  ) : (
                    <div key={m.id} className={"wai-b " + (m.side === "them" ? "in" : "out")}>
                      {m.side !== "them" && m.side !== "me" && <small className="wai-by">{m.side === "bot" ? "Modo AI" : m.by}</small>}
                      <span>{m.text}</span>
                      <small className="wai-t">{new Date(m.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}{m.side === "me" ? " · from phone" : ""}</small>
                    </div>
                  ))}
                  <div ref={end} />
                </div>
                {draft && (
                  <div className="wai-draft">
                    <div className="row" style={{ gap: 6 }}><Sparkles size={14} /><b>Modo suggests</b><span className="muted small">— not sent yet (#{draft.code})</span></div>
                    {edit != null ? <textarea value={edit} onChange={(e) => setEdit(e.target.value)} style={{ minHeight: 70 }} autoFocus /> : <p>{draft.draft}</p>}
                    <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                      <button className="sm" disabled={busy} onClick={() => act(draft.code, "send", edit ?? undefined)}><Check size={14} /> {edit != null ? "Send my version" : "Send"}</button>
                      {edit == null && <button className="ghost sm" onClick={() => setEdit(draft.draft)}><Pencil size={13} /> Edit</button>}
                      <button className="ghost sm" disabled={busy} onClick={() => act(draft.code, "skip")}><X size={14} /> Don't send</button>
                    </div>
                  </div>
                )}
                <div className="wai-compose">
                  <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a WhatsApp message…" rows={1}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
                  <button onClick={send} disabled={busy || !text.trim()} aria-label="Send"><Send size={16} /></button>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {tab === "rules" && <Rules d={d} onSaved={load} />}
      {tab === "commands" && <WaCommands />}
    </div>
  );
}

function Rules({ d, onSaved }) {
  const [r, setR] = useState(d.rules); const [msg, setMsg] = useState("");
  const save = async () => { const x = await api("/api/wa-inbox", "POST", { action: "rules", ...r }); setMsg(x.ok ? "Saved — Modo follows these from the next message." : x.data.error); if (x.ok) { setR(x.data.rules); onSaved(); } setTimeout(() => setMsg(""), 3000); };
  const modes = [["ask", "Ask me first", "Modo writes a reply and sends it to you (WhatsApp + here). Nothing reaches the customer until you say YES or type your own words."], ["auto", "Reply by itself", "Modo AI answers customers straight away, inside your rules. Faster, less control."], ["off", "AI off", "Only you and the team reply."]];
  return (
    <div className="stack">
      <section className="panel stack">
        <b>When a customer messages</b>
        <div className="wai-modes">
          {modes.map(([k, l, h]) => (
            <button key={k} className={"wai-mode" + (r.mode === k ? " on" : "")} onClick={() => setR({ ...r, mode: k })} aria-pressed={r.mode === k}>
              <b>{l}{k === "ask" ? " · recommended" : ""}</b><small>{h}</small>
            </button>
          ))}
        </div>
      </section>
      <section className="panel stack">
        <b className="row" style={{ gap: 6 }}><Check size={15} style={{ color: "var(--green)" }} /> Modo may say</b>
        <p className="muted small" style={{ margin: 0 }}>Facts and phrases you approve: hours, what happens next, how long shipping takes, how you sign off. One per line.</p>
        <textarea value={r.say} onChange={(e) => setR({ ...r, say: e.target.value })} style={{ minHeight: 120 }} placeholder={"- Our team is available 9am–9pm Eastern, Monday to Saturday.\n- Your order is being processed; we'll message you with the tracking number.\n- Sign off with: — Team Modo"} />
      </section>
      <section className="panel stack">
        <b className="row" style={{ gap: 6 }}><Ban size={15} style={{ color: "var(--red, #ff6b6b)" }} /> Modo must never say</b>
        <textarea value={r.dont} onChange={(e) => setR({ ...r, dont: e.target.value })} style={{ minHeight: 140 }} />
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button className="ghost sm" onClick={() => setR({ ...r, dont: d.defaultDont })}>Reset to safe defaults</button>
        </div>
      </section>
      <section className="panel row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <span className="row" style={{ gap: 8 }}><Link2 size={15} /><span><b>Links in Modo's replies</b><br /><small className="muted">{r.allowLinks ? "Allowed" : "Blocked — any link the AI writes is removed before you even see it"}</small></span></span>
        <button role="switch" aria-checked={r.allowLinks} className={"toggle" + (r.allowLinks ? " on" : "")} onClick={() => setR({ ...r, allowLinks: !r.allowLinks })}><span /></button>
      </section>
      <div className="row" style={{ gap: 8 }}><button onClick={save}>Save rules</button>{msg && <span className="small muted">{msg}</span>}</div>
      <p className="muted small" style={{ margin: 0 }}>You can change these from your phone too: text <b>rule say: …</b>, <b>rule never: …</b>, <b>links off</b> or <b>mode ask</b> to the business number.</p>
    </div>
  );
}
