"use client";
import AiButton from "@/components/AiButton";
import ModoPad from "@/components/ModoPad";
// Callback notepad: customer name (read-only), the last thing you talked about, and when to call back.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useShell } from "@/components/Shell";
import { api, when, usePeople, OwnerFilter, toLocalInput } from "./shared";
import { Search, PhoneCall, AlarmClock, StickyNote, Lock, Check, UserPlus, NotebookPen, Pencil, Trash2 } from "lucide-react";

const OUTCOMES = ["Reached", "No answer", "Voicemail", "Call back later", "Not interested", "Wrong number"];
const QUICK = [["In 1 hour", 60], ["In 3 hours", 180], ["Tomorrow", 1440]];

export default function Notepad() {
  const { me } = useShell(); const isAdmin = me?.role === "ADMIN";
  const people = usePeople(isAdmin);
  const [owner, setOwner] = useState(""); const [d, setD] = useState(null); const [err, setErr] = useState("");
  const [sel, setSel] = useState(null); const [q, setQ] = useState(""); const [filter, setFilter] = useState("all");
  const [note, setNote] = useState(""); const [outcome, setOutcome] = useState(""); const [cb, setCb] = useState(""); const [cbLabel, setCbLabel] = useState(""); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState(null); const [editText, setEditText] = useState("");
  const saveEdit = async () => { const r = await api(`/api/crm/activity/${editing}`, "PATCH", { text: editText }); if (!r.ok) return alert(r.data.error); setEditing(null); load(); };
  const delNote = async (id) => { if (!confirm("Delete this note?")) return; const r = await api(`/api/crm/activity/${id}`, "DELETE"); if (!r.ok) return alert(r.data.error); load(); };
  const [view, setViewRaw] = useState("customers");
  useEffect(() => { try { const v = localStorage.getItem("modo-notepad-view"); if (v === "pad") setViewRaw("pad"); } catch {} }, []);
  const setView = (v) => { setViewRaw(v); try { localStorage.setItem("modo-notepad-view", v); } catch {} }; const [adding, setAdding] = useState(false); const [nc, setNc] = useState({ name: "", phone: "" });
  async function addCustomer() {
    const r = await api("/api/crm/contacts", "POST", { ...nc, force: true });
    if (!r.ok) return alert(r.data.error);
    setAdding(false); setNc({ name: "", phone: "" }); await load(); setSel(r.data.id); setView("customers");
  }
  const load = useCallback(() => api("/api/crm/notepad" + (owner ? "?owner=" + owner : "")).then((r) => (r.ok ? setD(r.data) : setErr(r.data.error))), [owner]);
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);
  const p = d?.perms || {};
  const now = Date.now();
  const rows = useMemo(() => (d?.rows || []).filter((r) => (!q || (r.name + " " + (r.phone || "") + " " + (r.city || "")).toLowerCase().includes(q.toLowerCase())) &&
    (filter === "all" || (filter === "due" && r.nextCallback?.dueAt && new Date(r.nextCallback.dueAt) <= now + 86400000) || (filter === "none" && !r.lastNote)))
    .sort((a, b) => (a.nextCallback?.dueAt ? new Date(a.nextCallback.dueAt) : 9e15) - (b.nextCallback?.dueAt ? new Date(b.nextCallback.dueAt) : 9e15)), [d, q, filter, now]);
  const cur = d?.rows.find((r) => r.id === sel) || null;
  useEffect(() => { if (!sel && rows.length && typeof window !== "undefined" && window.innerWidth > 900) setSel(rows[0].id); }, [rows, sel]);

  async function save() {
    setBusy(true); setMsg("");
    if (note.trim() || outcome) {
      const r = await api("/api/crm/activity", "POST", { contactId: cur.id, kind: outcome ? "call" : "note", text: note, outcome: outcome || undefined });
      if (!r.ok) { setBusy(false); return setMsg(r.data.error); }
    }
    if (cb) {
      const r = await api("/api/crm/tasks", "POST", { type: "callback", title: `Call back ${cur.name}`, dueAt: new Date(cb).toISOString(), contactId: cur.id, notes: note || undefined });
      if (!r.ok) { setBusy(false); return setMsg(r.data.error); }
    }
    setBusy(false); setNote(""); setOutcome(""); setCb(""); setCbLabel(""); setMsg("Saved."); load(); setTimeout(() => setMsg(""), 2000);
  }
  async function doneCallback() { await api(`/api/crm/tasks/${cur.nextCallback.id}`, "PATCH", { done: true }); load(); }

  if (err) return <section className="panel"><p className="err" style={{ margin: 0 }}>{err}</p></section>;
  if (!d) return <p className="muted">Loading your notepad…</p>;
  return (
    <div className="stack">
    <div className="toolbar">
      <nav className="seg" role="tablist">{[["customers", "Customer notes"], ["pad", "My scratchpad"]].map(([k, l]) => <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)}>{l}</button>)}</nav>
      {view === "customers" && p.addCustomers && <button className="ghost sm" onClick={() => setAdding(!adding)}><UserPlus size={14} /> New customer</button>}
    </div>
    {adding && view === "customers" && (
      <section className="panel row" style={{ gap: 8, alignItems: "flex-end" }}>
        <label style={{ flex: 1, minWidth: 180 }}>Customer name<input value={nc.name} onChange={(e) => setNc({ ...nc, name: e.target.value })} autoFocus /></label>
        <label style={{ flex: 1, minWidth: 160 }}>Phone<input value={nc.phone} onChange={(e) => setNc({ ...nc, phone: e.target.value })} inputMode="tel" /></label>
        <button onClick={addCustomer} disabled={!nc.name.trim()}>Add</button><button className="ghost" onClick={() => setAdding(false)}>Cancel</button>
      </section>
    )}
    {view === "pad" ? <Scratchpad /> : (
    <div className={"notepad" + (cur ? " has-open" : "")}>
      <aside className="panel np-list">
        <div className="np-tools">
          <label className="sl-search np-search" style={{ margin: 0 }}><Search size={14} /><input placeholder="Search customers" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <nav className="seg" role="tablist">{[["all", "All"], ["due", "Callbacks due"], ["none", "No notes yet"]].map(([k, l]) => <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}>{l}</button>)}</nav>
          {isAdmin && <OwnerFilter people={people} value={owner} onChange={setOwner} />}
        </div>
        <div className="np-items">
          {rows.map((r) => {
            const due = r.nextCallback?.dueAt && new Date(r.nextCallback.dueAt);
            return (
              <button key={r.id} className={"np-item" + (r.id === sel ? " on" : "")} onClick={() => setSel(r.id)}>
                <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap", gap: 8 }}><b className="ellipsis">{r.name}</b>
                  {due && <span className={"small " + (due < now ? "due-over" : "due-today")} style={{ whiteSpace: "nowrap" }}><AlarmClock size={11} /> {when(due)}</span>}</div>
                <span className="small muted ellipsis">{r.lastNote ? r.lastNote.text : "No notes yet"}</span>
              </button>
            );
          })}
          {!rows.length && <p className="muted small" style={{ padding: 12 }}>{d.rows.length ? "Nothing matches." : "No customers assigned to you yet."}</p>}
        </div>
      </aside>

      {cur ? (
        <section className="panel np-page">
          <button className="ghost sm np-back" onClick={() => setSel(null)}>← All customers</button>
          <div className="row" style={{ justifyContent: "space-between" }}><div className="np-name"><Lock size={14} aria-label="Name can't be changed" /><span>{cur.name}</span></div>
            <AiButton task="brief_customer" payload={{ contactId: cur.id }} label="Brief me before I call" /></div>
          <div className="row small muted" style={{ gap: 12 }}>{cur.phone && <span>📞 {cur.phone}</span>}{cur.city && <span>📍 {cur.city}</span>}{isAdmin && <span>Agent: {cur.owner}</span>}</div>

          <div className="np-last">
            <span className="sf-l">Last time you talked</span>
            {cur.lastNote ? <><p>{cur.lastNote.text}</p><span className="small muted row" style={{ gap: 8 }}>{cur.lastNote.by} · {when(cur.lastNote.at)}{cur.lastNote.canEdit && <button className="ghost sm" onClick={() => { setEditing(cur.lastNote.id); setEditText(cur.lastNote.text); }}><Pencil size={12} /> Edit</button>}</span></> : <p className="muted">No notes yet. Add the first one below.</p>}
          </div>
          {cur.nextCallback && (
            <div className="np-cb"><AlarmClock size={16} /><div style={{ flex: 1 }}><b>Callback {cur.nextCallback.dueAt ? when(cur.nextCallback.dueAt) : "(no time set)"}</b><div className="small muted">{cur.nextCallback.title}</div></div>
              {p.scheduleCallbacks && <button className="ghost sm" onClick={doneCallback}><Check size={13} /> Done</button>}</div>
          )}

          {p.addNotes ? (
            <div className="np-write">
              <div className="row" style={{ gap: 6 }}>{OUTCOMES.map((o) => <button key={o} className={outcome === o ? "sm" : "ghost sm"} onClick={() => setOutcome(outcome === o ? "" : o)}>{o}</button>)}</div>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What did you talk about? What do they need? What should happen on the next call?" />
              {note.trim().length > 15 && <AiButton task="tidy_note" payload={() => ({ text: note })} label="Tidy my note" onResult={(d) => setNote(d.text)} useLabel="Use this" inline />}
              {p.scheduleCallbacks && (
                <div className="row" style={{ gap: 6 }}>
                  <span className="small muted"><AlarmClock size={13} /> Call back:</span>
                  {QUICK.map(([l, m]) => <button key={l} className={cbLabel === l ? "sm" : "ghost sm"} onClick={() => { if (cbLabel === l) { setCb(""); setCbLabel(""); } else { setCb(toLocalInput(new Date(Date.now() + m * 60000))); setCbLabel(l); } }}>{l}</button>)}
                  <input type="datetime-local" value={cb} onChange={(e) => { setCb(e.target.value); setCbLabel(""); }} style={{ maxWidth: 220, padding: "5px 9px" }} aria-label="Exact callback time" />
                </div>
              )}
              <div className="row"><button onClick={save} disabled={busy || (!note.trim() && !outcome && !cb)}><StickyNote size={15} /> {busy ? "Saving…" : cb ? "Save note & set callback" : "Save note"}</button>{msg && <span className="small" style={{ color: msg === "Saved." ? "var(--green)" : "var(--red)" }}>{msg}</span>}</div>
            </div>
          ) : <p className="muted small">Admin has turned off adding notes for agents.</p>}

          <div className="stack" style={{ gap: 0 }}>
            <span className="sf-l" style={{ marginBottom: 6 }}>History</span>
            <div className="timeline">{cur.history.map((h) => <div key={h.id}><span className="dot" /><div style={{ minWidth: 0 }}>
              {editing === h.id ? (
                <div className="stack" style={{ gap: 6 }}><textarea value={editText} onChange={(e) => setEditText(e.target.value)} style={{ minHeight: 70 }} autoFocus />
                  <div className="row"><button className="sm" onClick={saveEdit}>Save</button><button className="ghost sm" onClick={() => setEditing(null)}>Cancel</button></div></div>
              ) : <div style={{ whiteSpace: "pre-wrap" }}>{h.kind === "call" ? <PhoneCall size={12} style={{ marginRight: 4 }} /> : null}{h.text}</div>}
              <div className="small muted row" style={{ gap: 8 }}>{h.by} · {when(h.at)}
                {h.canEdit && editing !== h.id && <><button className="ghost sm icon-btn" aria-label="Edit note" title="Edit" onClick={() => { setEditing(h.id); setEditText(h.text); }}><Pencil size={12} /></button><button className="ghost sm icon-btn" aria-label="Delete note" title="Delete" onClick={() => delNote(h.id)}><Trash2 size={12} /></button></>}</div>
            </div></div>)}
              {!cur.history.length && <p className="muted small">Nothing yet.</p>}</div>
          </div>
        </section>
      ) : <section className="panel np-page np-empty"><p className="muted">{d.rows.length ? "Pick a customer on the left." : "No customers yet. Customers from your sales appear here automatically, or add one with New customer."}</p></section>}
    </div>
    )}
    </div>
  );
}

// Personal notes: Modo Pad (pages, checklists, tap-to-copy numbers, my campaign speech). Saves by itself.
function Scratchpad() {
  return (
    <section className="panel stack">
      <div className="row" style={{ justifyContent: "space-between" }}><h2><NotebookPen size={17} /> My scratchpad</h2><span className="small muted">Only you and your admin can see this</span></div>
      <ModoPad />
    </section>
  );
}
