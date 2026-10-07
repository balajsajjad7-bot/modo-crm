"use client";
import WaButton from "@/components/WaButton";
import AiButton from "@/components/AiButton";
// Customers list with search, tags, owner filter, CSV import; and the customer 360 page.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useShell } from "@/components/Shell";
import { api, money, when, Modal, usePeople, OwnerFilter, base, toLocalInput } from "./shared";
import { DealEditor } from "./Pipeline";
import EmailComposer from "@/components/EmailComposer";
import { Plus, Upload, Phone, Mail, MapPin, Building2, Tag, ArrowLeft, Copy, PhoneCall, StickyNote, AlarmClock, Trash2, Calculator, Check, Handshake, History, ListChecks } from "lucide-react";

const OUTCOMES = ["Reached", "No answer", "Voicemail", "Call back later", "Not interested", "Wrong number"];

export default function Contacts() {
  const { me } = useShell(); const isAdmin = me?.role === "ADMIN"; const router = useRouter();
  const people = usePeople(isAdmin);
  const [q, setQ] = useState(""); const [owner, setOwner] = useState(""); const [list, setList] = useState(null);
  const [adding, setAdding] = useState(false); const [msg, setMsg] = useState(""); const fileRef = useRef(null);
  const load = useCallback(() => api(`/api/crm/contacts?q=${encodeURIComponent(q)}${owner ? "&owner=" + owner : ""}`).then((r) => r.ok && setList(r.data)), [q, owner]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  async function importCSV(e) {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
    const r = await api("/api/crm/import", "POST", { csv: await f.text() });
    setMsg(r.ok ? `Imported ${r.data.imported} customers.` : r.data.error); load();
  }
  return (
    <div className="stack">
      <div className="toolbar">
        {me?.perms?.addCustomers && <button onClick={() => setAdding(true)}><Plus size={15} /> New customer</button>}
        {me?.perms?.importCSV && <button className="ghost" onClick={() => fileRef.current.click()}><Upload size={15} /> Import CSV</button>}
        <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={importCSV} />
        <input type="search" placeholder="Search name, phone, email, city, tag" value={q} onChange={(e) => setQ(e.target.value)} />
        {isAdmin && <OwnerFilter people={people} value={owner} onChange={setOwner} />}
        <span className="muted small" style={{ marginLeft: "auto" }}>{list ? list.length : "…"} customers</span>
      </div>
      {msg && <div className="receipt">{msg}</div>}
      <section className="panel tablewrap" style={{ padding: 0 }}>
        <table>
          <thead><tr><th>Customer</th><th>Phone</th><th>City</th><th>Tags</th><th className="r">Open deals</th><th className="r">Tasks</th>{isAdmin && <th>Owner</th>}<th>Updated</th></tr></thead>
          <tbody>{(list || []).map((c) => (
            <tr key={c.id} style={{ cursor: "pointer" }} onClick={() => router.push(`${base(me?.role)}/contacts/${c.id}`)}>
              <td><b>{c.name}</b>{c.company && <div className="muted small">{c.company}</div>}</td>
              <td className="small">{c.phone || "—"}</td><td className="small">{c.city || "—"}</td>
              <td>{c.tags.split(",").filter((t) => t.trim()).slice(0, 3).map((t) => <span key={t} className="chip" style={{ marginRight: 4 }}>{t.trim()}</span>)}</td>
              <td className="r">{c.openDeals ? `${c.openDeals} · ${money(c.pipeline)}` : "—"}</td><td className="r">{c.openTasks || "—"}</td>
              {isAdmin && <td className="small">{c.owner}</td>}<td className="small muted">{when(c.updatedAt)}</td>
            </tr>))}
          </tbody>
        </table>
        {list && !list.length && <p className="muted" style={{ padding: 16 }}>No customers yet. Add one, or import a CSV with columns like name, phone, email, city, tags.</p>}
      </section>
      {adding && <ContactForm people={people} isAdmin={isAdmin} onClose={() => setAdding(false)} onSaved={(c) => { setAdding(false); router.push(`${base(me?.role)}/contacts/${c.id}`); }} />}
    </div>
  );
}

function ContactForm({ contact, people, isAdmin, onClose, onSaved }) {
  const { me } = useShell();
  const [c, setC] = useState(contact || { name: "", phone: "", email: "", address: "", city: "", company: "", tags: "" }); const [err, setErr] = useState(""); const [dup, setDup] = useState(null);
  const set = (k) => (e) => setC({ ...c, [k]: e.target.value });
  async function save(force) {
    setErr("");
    const r = c.id ? await api(`/api/crm/contacts/${c.id}`, "PATCH", c) : await api("/api/crm/contacts", "POST", { ...c, force });
    if (r.status === 409) { setDup(r.data.duplicateId); return setErr(r.data.error); }
    if (!r.ok) return setErr(r.data.error); onSaved(r.data);
  }
  return (
    <Modal title={c.id ? "Edit customer" : "New customer"} onClose={onClose}>
      <div className="form">
        <label>Full name<input value={c.name} onChange={set("name")} autoFocus /></label>
        <label>Phone<input value={c.phone || ""} onChange={set("phone")} /></label>
        <label>Email<input type="email" value={c.email || ""} onChange={set("email")} /></label>
        <label>Company<input value={c.company || ""} onChange={set("company")} /></label>
        <label>Address<input value={c.address || ""} onChange={set("address")} /></label>
        <label>City / State<input value={c.city || ""} onChange={set("city")} /></label>
        <label>Tags (comma separated)<input value={c.tags || ""} onChange={set("tags")} placeholder="hot, internet, callback" /></label>
        {isAdmin && c.id && <label>Owner<select value={c.ownerId} onChange={set("ownerId")}>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
      </div>
      {err && <div className="err">{err} {dup && <><Link href={`${base(me?.role)}/contacts/${dup}`}>Open it</Link> or <button className="ghost sm" onClick={() => save(true)}>add anyway</button></>}</div>}
      <div className="row" style={{ justifyContent: "flex-end" }}><button className="ghost" onClick={onClose}>Cancel</button><button onClick={() => save(false)}>{c.id ? "Save" : "Add customer"}</button></div>
    </Modal>
  );
}

export function ContactDetail({ id }) {
  const { me } = useShell(); const isAdmin = me?.role === "ADMIN"; const router = useRouter();
  const people = usePeople(isAdmin);
  const [d, setD] = useState(null); const [err, setErr] = useState(""); const [editing, setEditing] = useState(false);
  const [deal, setDeal] = useState(null); const [task, setTask] = useState(null);
  const [note, setNote] = useState(""); const [outcome, setOutcome] = useState(""); const [stages, setStages] = useState([]); const [mail, setMail] = useState(false);
  const P = me?.perms || {};
  const load = useCallback(() => api(`/api/crm/contacts/${id}`).then((r) => r.ok ? setD(r.data) : setErr(r.data.error)), [id]);
  useEffect(() => { load(); api("/api/crm/deals?contact=" + id).then((r) => r.ok && setStages(r.data.stages)); }, [load, id]);
  if (err) return <p className="err">{err}</p>;
  if (!d) return <p className="muted">Loading customer…</p>;
  const c = d.contact; const B = base(me?.role);
  const log = async (kind) => { const r = await api("/api/crm/activity", "POST", { contactId: id, kind, text: note, outcome: kind === "call" ? outcome : undefined }); if (r.ok) { setNote(""); setOutcome(""); load(); } };
  const toggleTask = async (t) => { await api(`/api/crm/tasks/${t.id}`, "PATCH", { done: !t.done }); load(); };
  const del = async () => { if (confirm(`Delete ${c.name} and their tasks and notes?`)) { await api(`/api/crm/contacts/${id}`, "DELETE"); router.push(B + "/contacts"); } };
  return (
    <div className="stack">
      <section className="panel profile-head">
        <Link href={B + "/contacts"} className="ghost icon-btn" aria-label="All customers"><ArrowLeft size={18} /></Link>
        <span className="sl-avatar" style={{ width: 56, height: 56, borderRadius: 16, background: "var(--grad)", fontSize: 20 }}>{c.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 24 }}>{c.name}</h1>
          <div className="row small muted" style={{ gap: 12 }}>
            {c.phone && <span className="row" style={{ gap: 4 }}><Phone size={13} />{c.phone}<button className="ghost sm icon-btn" aria-label="Copy phone" onClick={() => navigator.clipboard?.writeText(c.phone)}><Copy size={12} /></button><WaButton phone={c.phone} text={`Hi ${String(c.name || "").split(" ")[0] || "there"}, `} iconOnly /></span>}
            {c.email && <a href={`mailto:${c.email}`} className="row" style={{ gap: 4 }}><Mail size={13} />{c.email}</a>}
            {(c.address || c.city) && <span className="row" style={{ gap: 4 }}><MapPin size={13} />{[c.address, c.city].filter(Boolean).join(", ")}</span>}
            {c.company && <span className="row" style={{ gap: 4 }}><Building2 size={13} />{c.company}</span>}
            <span>Owner: {c.owner}</span>
          </div>
          {c.tags && <div className="row" style={{ gap: 4, marginTop: 6 }}><Tag size={13} className="muted" />{c.tags.split(",").filter((t) => t.trim()).map((t) => <span key={t} className="chip">{t.trim()}</span>)}</div>}
        </div>
        <div className="row" style={{ marginLeft: "auto" }}>
          {P.scheduleCallbacks && <button onClick={() => setTask({ type: "callback", title: `Call back ${c.name}`, dueAt: toLocalInput(new Date(Date.now() + 3600000)) })}><AlarmClock size={15} /> Schedule callback</button>}
          {P.emailCustomers && c.email && <button className="ghost" onClick={() => setMail(true)}><Mail size={15} /> Email</button>}
          <AiButton task="brief_customer" payload={{ contactId: c.id }} label="AI brief" />
          <Link href={B + "/calculator"} className="btn-link"><Calculator size={14} /> Quote</Link>
          {P.editCustomers && <button className="ghost" onClick={() => setEditing(true)}>Edit</button>}
          {isAdmin && <button className="ghost" onClick={del} aria-label="Delete customer"><Trash2 size={15} /></button>}
        </div>
      </section>

      <div className="two-col">
        <div className="stack">
          {P.addNotes && <section className="panel stack">
            <h2><PhoneCall size={17} /> Log a call or note</h2>
            <div className="row">{OUTCOMES.map((o) => <button key={o} className={outcome === o ? "sm" : "ghost sm"} onClick={() => setOutcome(outcome === o ? "" : o)}>{o}</button>)}</div>
            <textarea style={{ minHeight: 70 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened on the call, what they need, next steps…" />
            <div className="row"><button onClick={() => log("call")} disabled={!outcome && !note.trim()}><PhoneCall size={15} /> Log call</button><button className="ghost" onClick={() => log("note")} disabled={!note.trim()}><StickyNote size={15} /> Save note</button></div>
          </section>}
          <section className="panel stack">
            <h2><History size={17} /> Timeline</h2>
            <div className="timeline">
              {d.activity.map((a) => <div key={a.id}><span className="dot" /><div><div style={{ whiteSpace: "pre-wrap" }}>{a.text}</div><div className="small muted">{a.by} · {when(a.createdAt)}</div></div></div>)}
              {!d.activity.length && <p className="muted small">Nothing yet.</p>}
            </div>
          </section>
        </div>
        <div className="stack">
          <section className="panel stack">
            <div className="row" style={{ justifyContent: "space-between" }}><h2><Handshake size={17} /> Deals</h2><button className="ghost sm" onClick={() => setDeal({ stage: "lead", title: "", value: "", service: "" })}><Plus size={14} /> Deal</button></div>
            {d.deals.map((x) => (
              <button key={x.id} className="kcard" style={{ textAlign: "left", color: "var(--foreground)", fontWeight: 400 }} onClick={() => setDeal({ ...x, expectedClose: x.expectedClose?.slice(0, 10) || "" })}>
                <b>{x.title}</b><div className="row" style={{ justifyContent: "space-between" }}><span className="val">{money(x.value)}</span><span className={"chip " + (x.stage === "won" ? "ok" : x.stage === "lost" ? "red" : "")}>{stages.find((s) => s.id === x.stage)?.label || x.stage}</span></div>
              </button>
            ))}
            {!d.deals.length && <p className="muted small" style={{ margin: 0 }}>No deals yet.</p>}
          </section>
          <section className="panel stack">
            <div className="row" style={{ justifyContent: "space-between" }}><h2><ListChecks size={17} /> Tasks</h2><button className="ghost sm" onClick={() => setTask({ type: "task", title: "", dueAt: "" })}><Plus size={14} /> Task</button></div>
            {d.tasks.map((t) => {
              const over = !t.done && t.dueAt && new Date(t.dueAt) < new Date();
              return (
                <div key={t.id} className="row" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
                  <button className={"task-check" + (t.done ? " on" : "")} aria-label={t.done ? "Mark not done" : "Mark done"} onClick={() => toggleTask(t)}>{t.done && <Check size={13} />}</button>
                  <div style={{ minWidth: 0 }}><div style={t.done ? { textDecoration: "line-through", opacity: .6 } : undefined}>{t.title}</div>
                    <div className={"small " + (over ? "due-over" : "muted")}>{t.type}{t.dueAt ? " · " + when(t.dueAt) : ""}{isAdmin ? " · " + t.assignee : ""}</div></div>
                </div>
              );
            })}
            {!d.tasks.length && <p className="muted small" style={{ margin: 0 }}>No tasks yet.</p>}
          </section>
        </div>
      </div>
      {editing && <ContactForm contact={c} people={people} isAdmin={isAdmin} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />}
      {deal && <DealEditor deal={deal} stages={stages} people={people} isAdmin={isAdmin} role={me?.role} contactId={id} onClose={() => setDeal(null)} onSaved={() => { setDeal(null); load(); }} />}
      {mail && <EmailComposer to={c.email} contactId={c.id} sender={me?.name} data={{ customer: c.name.split(" ")[0] }} onClose={() => setMail(false)} onSent={load} />}
      {task && <TaskForm initial={{ ...task, contactId: id }} people={people} isAdmin={isAdmin} onClose={() => setTask(null)} onSaved={() => { setTask(null); load(); }} />}
    </div>
  );
}

export function TaskForm({ initial, people, isAdmin, onClose, onSaved, contacts }) {
  const [t, setT] = useState({ type: "callback", title: "", dueAt: "", notes: "", ...initial }); const [err, setErr] = useState("");
  const set = (k) => (e) => setT({ ...t, [k]: e.target.value });
  async function save() {
    const r = await api("/api/crm/tasks", "POST", { ...t, dueAt: t.dueAt ? new Date(t.dueAt).toISOString() : null });
    if (!r.ok) return setErr(r.data.error); onSaved();
  }
  return (
    <Modal title={t.type === "callback" ? "Schedule a callback" : "New task"} onClose={onClose}>
      <div className="form">
        <label>What<input value={t.title} onChange={set("title")} autoFocus /></label>
        <label>Type<select value={t.type} onChange={set("type")}><option value="callback">Callback</option><option value="task">Task</option><option value="email">Email</option><option value="meeting">Meeting</option></select></label>
        <label>Due<input type="datetime-local" value={t.dueAt} onChange={set("dueAt")} /></label>
        {contacts && <label>Customer<select value={t.contactId || ""} onChange={set("contactId")}><option value="">— none —</option>{contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
        {isAdmin && <label>Assign to<select value={t.assigneeId || ""} onChange={set("assigneeId")}><option value="">Me</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
      </div>
      <label>Notes<textarea style={{ minHeight: 60 }} value={t.notes || ""} onChange={set("notes")} /></label>
      <p className="muted small" style={{ margin: 0 }}>You'll get a ring and a reminder in the CRM when it's due.</p>
      {err && <div className="err">{err}</div>}
      <div className="row" style={{ justifyContent: "flex-end" }}><button className="ghost" onClick={onClose}>Cancel</button><button onClick={save}>Save</button></div>
    </Modal>
  );
}
