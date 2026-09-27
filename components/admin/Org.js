"use client";
// Departments (each with its own email) and campaigns (Budget Ease, Verizon, AT&T…)
import { useEffect, useState } from "react";
import { api } from "./api";
import { Building2, Megaphone, Plus, Trash2, Save } from "lucide-react";

function List({ kind, items, reload, email }) {
  const [rows, setRows] = useState(items); const [add, setAdd] = useState({ name: "", email: "", color: kind === "department" ? "#ff6b4a" : "#ffb347" }); const [err, setErr] = useState("");
  useEffect(() => setRows(items), [items]);
  const save = async (r) => { const res = await api("/api/org", "PATCH", { kind, id: r.id, name: r.name, email: r.email, color: r.color, active: r.active }); if (!res.ok) setErr(res.data.error); reload(); };
  const del = async (r) => { if (confirm(`Delete ${r.name}? People in it will be unassigned.`)) { await api(`/api/org?kind=${kind}&id=${r.id}`, "DELETE"); reload(); } };
  const create = async () => { setErr(""); const res = await api("/api/org", "POST", { kind, ...add }); if (!res.ok) return setErr(res.data.error); setAdd({ ...add, name: "", email: "" }); reload(); };
  const set = (i, k, v) => setRows(rows.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  return (
    <div className="stack" style={{ gap: 8 }}>
      {rows.map((r, i) => (
        <div key={r.id} className="org-row">
          <input type="color" value={r.color} onChange={(e) => set(i, "color", e.target.value)} aria-label="Colour" />
          <input value={r.name} onChange={(e) => set(i, "name", e.target.value)} aria-label="Name" />
          {email && <input type="email" value={r.email || ""} onChange={(e) => set(i, "email", e.target.value)} placeholder="department@yourcompany.com" aria-label="Email" />}
          {kind === "campaign" && <label className="row small" style={{ color: "var(--foreground)", flexWrap: "nowrap" }}><input type="checkbox" style={{ width: "auto" }} checked={r.active} onChange={(e) => set(i, "active", e.target.checked)} /> Active</label>}
          <span className="muted small" style={{ whiteSpace: "nowrap" }}>{r.people} people</span>
          <button className="ghost sm" onClick={() => save(r)}><Save size={13} /></button>
          <button className="ghost sm" onClick={() => del(r)} aria-label="Delete"><Trash2 size={13} /></button>
        </div>
      ))}
      <div className="org-row add">
        <input type="color" value={add.color} onChange={(e) => setAdd({ ...add, color: e.target.value })} aria-label="Colour" />
        <input value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} placeholder={kind === "department" ? "New department" : "New campaign"} />
        {email && <input type="email" value={add.email} onChange={(e) => setAdd({ ...add, email: e.target.value })} placeholder="department@yourcompany.com" />}
        <button className="sm" onClick={create} disabled={!add.name.trim()}><Plus size={13} /> Add</button>
      </div>
      {err && <div className="err">{err}</div>}
    </div>
  );
}

export default function Org() {
  const [d, setD] = useState(null);
  const load = () => api("/api/org").then((r) => r.ok && setD(r.data));
  useEffect(() => { load(); }, []);
  if (!d) return <p className="muted">Loading…</p>;
  return (
    <div className="stack">
      <section className="panel stack">
        <h2><Building2 size={17} /> Departments</h2>
        <p className="muted small" style={{ margin: 0 }}>Each department can have its own email. When you email a customer you pick which department it's from, and replies go to that department's address. Assign people in Team → Users or on an agent's page.</p>
        <List kind="department" items={d.departments} reload={load} email />
      </section>
      <section className="panel stack">
        <h2><Megaphone size={17} /> Campaigns</h2>
        <p className="muted small" style={{ margin: 0 }}>Agents pick the campaign on every sale (their own campaign is pre-selected). Filter sales and reports by campaign.</p>
        <List kind="campaign" items={d.campaigns} reload={load} />
      </section>
    </div>
  );
}
