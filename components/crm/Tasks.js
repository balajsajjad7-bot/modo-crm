"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useShell } from "@/components/Shell";
import { api, when, usePeople, OwnerFilter, base } from "./shared";
import { TaskForm } from "./Contacts";
import { Plus, Check, Trash2, Phone, Mail, Users, ListTodo } from "lucide-react";

const ICON = { callback: Phone, email: Mail, meeting: Users, task: ListTodo };
const VIEWS = [["today", "Due today"], ["overdue", "Overdue"], ["open", "All open"], ["done", "Done"]];

export default function Tasks() {
  const { me } = useShell(); const isAdmin = me?.role === "ADMIN";
  const people = usePeople(isAdmin);
  const [view, setView] = useState("today"); const [owner, setOwner] = useState(""); const [d, setD] = useState(null); const [adding, setAdding] = useState(false); const [contacts, setContacts] = useState([]);
  const load = useCallback(() => api(`/api/crm/tasks?view=${view}${owner ? "&owner=" + owner : ""}`).then((r) => r.ok && setD(r.data)), [view, owner]);
  useEffect(() => { load(); const t = setInterval(load, 60000); return () => clearInterval(t); }, [load]);
  useEffect(() => { api("/api/crm/contacts").then((r) => r.ok && setContacts(r.data)); }, []);
  const toggle = async (t) => { setD((x) => ({ ...x, tasks: x.tasks.map((y) => y.id === t.id ? { ...y, done: !t.done } : y) })); await api(`/api/crm/tasks/${t.id}`, "PATCH", { done: !t.done }); load(); };
  const del = async (t) => { await api(`/api/crm/tasks/${t.id}`, "DELETE"); load(); };
  const snooze = async (t, mins) => { await api(`/api/crm/tasks/${t.id}`, "PATCH", { dueAt: new Date(Date.now() + mins * 60000).toISOString() }); load(); };
  return (
    <div className="stack">
      <div className="toolbar">
        <button onClick={() => setAdding(true)}><Plus size={15} /> New task</button>
        <nav className="seg" role="tablist">{VIEWS.map(([k, l]) => <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)}>{l}{k === "overdue" && d?.counts.overdue ? ` (${d.counts.overdue})` : ""}</button>)}</nav>
        {isAdmin && <OwnerFilter people={people} value={owner} onChange={setOwner} label="Everyone" />}
      </div>
      <section className="panel" style={{ padding: 0 }}>
        {!d ? <p className="muted" style={{ padding: 16 }}>Loading…</p> : !d.tasks.length ? <p className="muted" style={{ padding: 16 }}>{view === "done" ? "Nothing completed yet." : "You're all caught up."}</p> : d.tasks.map((t) => {
          const I = ICON[t.type] || ListTodo; const now = new Date(); const due = t.dueAt && new Date(t.dueAt);
          const cls = !t.done && due ? (due < now ? "due-over" : due.toDateString() === now.toDateString() ? "due-today" : "muted") : "muted";
          return (
            <div key={t.id} className="row-card">
              <button className={"task-check" + (t.done ? " on" : "")} aria-label={t.done ? "Mark not done" : "Mark done"} onClick={() => toggle(t)}>{t.done && <Check size={13} />}</button>
              <I size={16} className="muted" />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={t.done ? { textDecoration: "line-through", opacity: .6 } : undefined}><b>{t.title}</b></div>
                <div className="small muted">
                  {t.contact && <Link href={`${base(me?.role)}/contacts/${t.contact.id}`}>{t.contact.name}</Link>}{t.contact?.phone ? " · " + t.contact.phone : ""}
                  {isAdmin ? " · " + t.assignee : ""}{t.notes ? " · " + t.notes : ""}
                </div>
              </div>
              <span className={"small " + cls} style={{ whiteSpace: "nowrap" }}>{due ? when(due) : "no due date"}</span>
              {!t.done && due && <button className="ghost sm" onClick={() => snooze(t, 60)} title="Snooze 1 hour">+1h</button>}
              <button className="ghost sm" aria-label="Delete task" onClick={() => del(t)}><Trash2 size={13} /></button>
            </div>
          );
        })}
      </section>
      {adding && <TaskForm initial={{}} contacts={contacts} people={people} isAdmin={isAdmin} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
    </div>
  );
}
