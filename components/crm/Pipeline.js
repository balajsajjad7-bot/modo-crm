"use client";
// Kanban pipeline: drag deals between stages. Admin sees everyone's; agents see their own.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useShell } from "@/components/Shell";
import { api, money, when, Modal, usePeople, OwnerFilter, base } from "./shared";
import { Plus, Trash2, User } from "lucide-react";

export default function Pipeline() {
  const { me } = useShell(); const isAdmin = me?.role === "ADMIN";
  const people = usePeople(isAdmin);
  const [owner, setOwner] = useState(""); const [data, setData] = useState(null); const [over, setOver] = useState(null);
  const [edit, setEdit] = useState(null); const [q, setQ] = useState("");
  const load = useCallback(() => api("/api/crm/deals" + (owner ? "?owner=" + owner : "")).then((r) => r.ok && setData(r.data)), [owner]);
  useEffect(() => { load(); }, [load]);

  const move = async (id, stage) => {
    let lostReason;
    if (stage === "lost") { lostReason = prompt("Why was it lost? (optional)") || ""; }
    setData((d) => ({ ...d, deals: d.deals.map((x) => x.id === id ? { ...x, stage } : x) }));
    await api(`/api/crm/deals/${id}`, "PATCH", { stage, lostReason, position: Date.now() }); load();
  };
  if (!data) return <p className="muted">Loading pipeline…</p>;
  const deals = data.deals.filter((d) => !q || (d.title + " " + (d.contact?.name || "") + " " + (d.owner || "")).toLowerCase().includes(q.toLowerCase()));
  const open = deals.filter((d) => !["won", "lost"].includes(d.stage));
  return (
    <div className="stack">
      <div className="toolbar">
        {me?.perms?.deals && <button onClick={() => setEdit({ stage: "lead", value: "", title: "", service: "" })}><Plus size={15} /> New deal</button>}
        <input type="search" placeholder="Search deals or customers" value={q} onChange={(e) => setQ(e.target.value)} />
        {isAdmin && <OwnerFilter people={people} value={owner} onChange={setOwner} />}
        <span className="muted small" style={{ marginLeft: "auto" }}>{open.length} open · {money(open.reduce((t, d) => t + d.value, 0))} in pipeline</span>
      </div>
      <div className="kanban">
        {data.stages.map((st) => {
          const list = deals.filter((d) => d.stage === st.id);
          return (
            <div key={st.id} className={"kcol stage-" + st.id + (over === st.id ? " over" : "")}
              onDragOver={(e) => { e.preventDefault(); setOver(st.id); }} onDragLeave={() => setOver(null)}
              onDrop={(e) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("text/plain"); if (id) move(id, st.id); }}>
              <div className="kcol-head"><b>{st.label}</b><span>{list.length} · {money(list.reduce((t, d) => t + d.value, 0))}</span></div>
              {list.map((d) => (
                <div key={d.id} className="kcard" draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", d.id)} onClick={() => setEdit({ ...d, expectedClose: d.expectedClose?.slice(0, 10) || "" })}
                  tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setEdit({ ...d, expectedClose: d.expectedClose?.slice(0, 10) || "" })}>
                  <b className="ellipsis">{d.title}</b>
                  {d.contact && <span className="small muted ellipsis">{d.contact.name}{d.contact.phone ? " · " + d.contact.phone : ""}</span>}
                  <div className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                    <span className="val">{money(d.value)}</span>
                    <span className="small muted">{isAdmin ? d.owner : d.expectedClose ? "closes " + new Date(d.expectedClose).toLocaleDateString([], { month: "short", day: "numeric" }) : ""}</span>
                  </div>
                  <select aria-label="Move to stage" value={d.stage} onClick={(e) => e.stopPropagation()} onChange={(e) => move(d.id, e.target.value)} style={{ padding: "3px 8px", fontSize: 12 }}>
                    {data.stages.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
              ))}
              {!list.length && <p className="muted small" style={{ textAlign: "center", margin: "12px 0" }}>Drop deals here</p>}
            </div>
          );
        })}
      </div>
      {edit && <DealEditor deal={edit} stages={data.stages} people={people} isAdmin={isAdmin} role={me?.role} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
    </div>
  );
}

export function DealEditor({ deal, stages, people, isAdmin, role, onClose, onSaved, contactId }) {
  const [d, setD] = useState({ ...deal }); const [err, setErr] = useState(""); const [rates, setRates] = useState({});
  const [contacts, setContacts] = useState([]); const [newC, setNewC] = useState({ name: "", phone: "" }); const [mode, setMode] = useState(deal.contactId || contactId ? "existing" : "new");
  useEffect(() => { api("/api/settings").then((r) => { if (r.ok) { const x = r.data.discountRates; setRates(typeof x === "string" ? JSON.parse(x || "{}") : x || {}); } }); api("/api/crm/contacts").then((r) => r.ok && setContacts(r.data)); }, []);
  const set = (k) => (e) => setD({ ...d, [k]: e.target.value });
  async function save() {
    setErr("");
    const body = { title: d.title, value: d.value, service: d.service, stage: d.stage, expectedClose: d.expectedClose || null, ownerId: d.ownerId || undefined };
    if (!d.id) { if (contactId) body.contactId = contactId; else if (mode === "existing") body.contactId = d.contactId || null; else if (newC.name.trim()) body.newContact = newC; }
    const r = d.id ? await api(`/api/crm/deals/${d.id}`, "PATCH", body) : await api("/api/crm/deals", "POST", body);
    if (!r.ok) return setErr(r.data.error); onSaved();
  }
  async function del() { if (confirm("Delete this deal?")) { await api(`/api/crm/deals/${d.id}`, "DELETE"); onSaved(); } }
  return (
    <Modal title={d.id ? "Edit deal" : "New deal"} onClose={onClose}>
      <div className="form">
        <label>Title<input value={d.title} onChange={set("title")} placeholder="e.g. Internet 300 Mbps, 12 months" autoFocus /></label>
        <label>Service<select value={d.service || ""} onChange={set("service")}><option value="">—</option>{Object.keys(rates).map((s) => <option key={s}>{s}</option>)}</select></label>
        <label>Value ($)<input type="number" min="0" value={d.value} onChange={set("value")} /></label>
        <label>Stage<select value={d.stage} onChange={set("stage")}>{stages.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>
        <label>Expected close<input type="date" value={d.expectedClose || ""} onChange={set("expectedClose")} /></label>
        {isAdmin && <label>Owner<select value={d.ownerId || ""} onChange={set("ownerId")}><option value="">Me</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>}
      </div>
      {!d.id && !contactId && (
        <div className="stack" style={{ gap: 8 }}>
          <div className="seg" role="tablist" style={{ width: "max-content" }}>{[["new", "New customer"], ["existing", "Existing customer"]].map(([k, l]) => <button key={k} role="tab" aria-selected={mode === k} onClick={() => setMode(k)}>{l}</button>)}</div>
          {mode === "new" ? <div className="form"><label>Customer name<input value={newC.name} onChange={(e) => setNewC({ ...newC, name: e.target.value })} /></label><label>Phone<input value={newC.phone} onChange={(e) => setNewC({ ...newC, phone: e.target.value })} /></label></div>
            : <label>Customer<select value={d.contactId || ""} onChange={set("contactId")}><option value="">— none —</option>{contacts.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? " · " + c.phone : ""}</option>)}</select></label>}
        </div>
      )}
      {d.id && d.contact && <Link href={`${base(role)}/contacts/${d.contact.id}`} className="btn-link" style={{ width: "max-content" }}><User size={14} /> {d.contact.name}</Link>}
      {d.stage === "lost" && d.lostReason && <p className="small muted" style={{ margin: 0 }}>Lost because: {d.lostReason}</p>}
      {err && <div className="err">{err}</div>}
      <div className="row" style={{ justifyContent: "space-between" }}>
        {d.id ? <button className="ghost" onClick={del}><Trash2 size={15} /> Delete</button> : <span />}
        <div className="row"><button className="ghost" onClick={onClose}>Cancel</button><button onClick={save}>{d.id ? "Save" : "Create deal"}</button></div>
      </div>
    </Modal>
  );
}
