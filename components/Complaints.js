"use client";
// Customer complaints. Agent: listen to the customer, type or speak what's wrong, send — admin is alerted at once.
// Admin: every complaint with status, priority, replies (each reply goes to the agent's Modo bot).
import { useEffect, useState } from "react";
import { MessageSquareWarning, Send, Sparkles, Phone, CheckCircle2, Clock3, AlertTriangle, Loader2, Trash2, ChevronDown, User, Hash, Search } from "lucide-react";
import VoiceRecord from "@/components/VoiceRecord";

const api = (url, method = "GET", body) => fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" }).then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }));
const when = (t) => new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const PRI = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" };
const BLANK = { customer: "", phone: "", account: "", category: "Billing / charges", priority: "normal", text: "", wants: "" };

export default function Complaints({ admin = false }) {
  const [d, setD] = useState(null); const [f, setF] = useState(BLANK); const [busy, setBusy] = useState(""); const [msg, setMsg] = useState("");
  const [open, setOpen] = useState(null); const [filter, setFilter] = useState(admin ? "active" : "all"); const [q, setQ] = useState("");
  const load = () => api("/api/complaints").then((r) => r.ok && setD(r.data));
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);
  const say = (t) => { setMsg(t); setTimeout(() => setMsg(""), 4000); };
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const send = async (e) => {
    e.preventDefault(); setBusy("send");
    const r = await api("/api/complaints", "POST", f); setBusy("");
    if (r.ok) { setF(BLANK); say(`✓ Complaint #${r.data.complaint.no} sent — your admin has it now.`); load(); } else say(r.data.error);
  };
  const tidy = async () => {
    setBusy("tidy"); const r = await api("/api/complaints/tidy", "POST", { text: f.text }); setBusy("");
    if (r.ok) setF({ ...f, text: r.data.text }); else say(r.data.error);
  };
  const patch = async (id, body) => { const r = await api("/api/complaints", "PATCH", { id, ...body }); if (!r.ok) say(r.data.error); load(); return r.ok; };

  if (!d) return <p className="muted">Loading complaints…</p>;
  const list = d.complaints.filter((c) => (filter === "all" ? true : filter === "active" ? c.status === "open" || c.status === "in progress" : c.status === filter))
    .filter((c) => !q || JSON.stringify([c.customer, c.phone, c.account, c.text, c.by?.name, c.no]).toLowerCase().includes(q.toLowerCase()));
  const n = (s) => d.complaints.filter((c) => c.status === s).length;
  const urgent = d.complaints.filter((c) => c.priority === "urgent" && (c.status === "open" || c.status === "in progress")).length;

  return (
    <div className="stack">
      {admin && (
        <div className="cp-kpis">
          <div><span className="gt gt-sm" style={{ "--g1": "#fda4af", "--g2": "#e11d48" }}><AlertTriangle size={17} /></span><b>{urgent}</b><small>urgent & not done</small></div>
          <div><span className="gt gt-sm" style={{ "--g1": "#fdba74", "--g2": "#ea580c" }}><MessageSquareWarning size={17} /></span><b>{n("open")}</b><small>new / open</small></div>
          <div><span className="gt gt-sm" style={{ "--g1": "#7dd3fc", "--g2": "#0284c7" }}><Clock3 size={17} /></span><b>{n("in progress")}</b><small>in progress</small></div>
          <div><span className="gt gt-sm" style={{ "--g1": "#34d399", "--g2": "#059669" }}><CheckCircle2 size={17} /></span><b>{n("resolved") + n("closed")}</b><small>resolved</small></div>
        </div>
      )}

      {!admin && (
        <section className="panel stack">
          <h2><MessageSquareWarning size={17} /> File a customer complaint</h2>
          <p className="muted small" style={{ margin: 0 }}>Listen to the customer, then type what they said, or press <b>Speak it</b> and say it in your own words. It goes straight to your admin.</p>
          <form className="cp-form" onSubmit={send}>
            <label>Customer name<input value={f.customer} onChange={set("customer")} placeholder="e.g. John Miller" /></label>
            <label>Phone<input value={f.phone} onChange={set("phone")} inputMode="tel" placeholder="(555) 123-4567" /></label>
            <label>Order / account #<input value={f.account} onChange={set("account")} /></label>
            <label>What's it about?<select value={f.category} onChange={set("category")}>{(d.categories || []).map((c) => <option key={c}>{c}</option>)}</select></label>
            <div className="cp-wide">
              <span className="small muted">How serious?</span>
              <div className="cp-pri">{Object.entries(PRI).map(([k, l]) => <button type="button" data-plain key={k} className={"pri-" + k + (f.priority === k ? " on" : "")} onClick={() => setF({ ...f, priority: k })}>{l}</button>)}</div>
            </div>
            <label className="cp-wide">What did the customer say?
              <textarea rows={6} value={f.text} onChange={set("text")} placeholder="The customer says they were charged twice this month and nobody called them back…" required />
            </label>
            <div className="cp-wide row" style={{ gap: 6, flexWrap: "wrap" }}>
              <VoiceRecord label="Speak it" onText={(t) => setF((x) => ({ ...x, text: (x.text ? x.text.trim() + " " : "") + t }))} />
              <button type="button" className="ghost sm" onClick={tidy} disabled={!f.text.trim() || busy === "tidy"}>{busy === "tidy" ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />} Make it clear with AI</button>
            </div>
            <label className="cp-wide">What does the customer want? (optional)<input value={f.wants} onChange={set("wants")} placeholder="Refund of the extra charge, a call back from a manager…" /></label>
            <div className="cp-wide row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <button disabled={busy === "send"}><Send size={14} /> {busy === "send" ? "Sending…" : "Send to admin"}</button>
              {msg && <span className="small">{msg}</span>}
            </div>
          </form>
        </section>
      )}

      <section className="panel stack">
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <h2><MessageSquareWarning size={17} /> {admin ? "Customer complaints" : "My complaints"}</h2>
          <span className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            <span className="cp-search"><Search size={13} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" /></span>
            <select style={{ width: "auto" }} value={filter} onChange={(e) => setFilter(e.target.value)}>
              {admin && <option value="active">Open + in progress</option>}
              <option value="all">All ({d.complaints.length})</option>
              {["open", "in progress", "resolved", "closed"].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)} ({n(s)})</option>)}
            </select>
          </span>
        </div>
        {admin && msg && <span className="small">{msg}</span>}
        <div className="cp-list">
          {list.map((c) => <Item key={c.id} c={c} admin={admin} open={open === c.id} toggle={() => setOpen(open === c.id ? null : c.id)} patch={patch} onDelete={async () => { if (confirm(`Delete complaint #${c.no}?`)) { await api("/api/complaints?id=" + c.id, "DELETE"); load(); } }} />)}
          {!list.length && <p className="muted small">{admin ? "No complaints here. 🎉" : "You haven't filed any complaints yet."}</p>}
        </div>
      </section>
    </div>
  );
}

function Item({ c, admin, open, toggle, patch, onDelete }) {
  const [note, setNote] = useState(""); const [busy, setBusy] = useState(false);
  const add = async () => { if (!note.trim()) return; setBusy(true); if (await patch(c.id, { note })) setNote(""); setBusy(false); };
  return (
    <div className={"cp-item pr-" + c.priority + " st-" + c.status.replace(" ", "-") + (open ? " open" : "")}>
      <button type="button" data-plain className="cp-head" onClick={toggle}>
        <span className="cp-no"><Hash size={11} />{c.no}</span>
        <span className="cp-main"><b>{c.customer || "Customer"} · {c.category}</b><small>{c.text.slice(0, 110)}{c.text.length > 110 ? "…" : ""}</small></span>
        <span className="cp-meta"><span className={"cp-st " + c.status.replace(" ", "-")}>{c.status}</span><small>{admin ? c.by?.name + " · " : ""}{when(c.at)}</small></span>
        <ChevronDown size={16} className="cp-chev" />
      </button>
      {open && (
        <div className="cp-body stack">
          <div className="cp-facts">
            <span><User size={13} /> {c.customer || "—"}</span>
            {c.phone && <a href={"tel:" + c.phone.replace(/[^\d+]/g, "")}><Phone size={13} /> {c.phone}</a>}
            {c.account && <span><Hash size={13} /> {c.account}</span>}
            <span className={"cp-pr " + c.priority}>{PRI[c.priority]}</span>
            {admin && <span className="muted">Filed by {c.by?.name} ({c.by?.agentId})</span>}
          </div>
          <p className="cp-text">{c.text}</p>
          {c.wants && <p className="small" style={{ margin: 0 }}><b>Customer wants:</b> {c.wants}</p>}
          {!!c.notes?.length && <div className="cp-notes">{c.notes.map((n, i) => <div key={i} className={n.admin ? "adm" : ""}><small>{n.by} · {when(n.at)}</small><span>{n.text}</span></div>)}</div>}
          {admin && (
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              {["open", "in progress", "resolved", "closed"].map((s) => <button key={s} className={"sm " + (c.status === s ? "" : "ghost")} onClick={() => patch(c.id, { status: s })}>{s === "resolved" ? <CheckCircle2 size={13} /> : null} {s[0].toUpperCase() + s.slice(1)}</button>)}
              <select style={{ width: "auto" }} value={c.priority} onChange={(e) => patch(c.id, { priority: e.target.value })}>{Object.entries(PRI).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              <button className="ghost sm icon-btn" title="Delete" onClick={onDelete}><Trash2 size={13} /></button>
            </div>
          )}
          <div className="cp-reply">
            <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder={admin ? "Reply to the agent (they get it in Modo bot)…" : "Add an update for admin…"} />
            <button className="sm" onClick={add} disabled={busy || !note.trim()}><Send size={13} /></button>
          </div>
        </div>
      )}
    </div>
  );
}
