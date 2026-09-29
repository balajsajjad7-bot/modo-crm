"use client";
// Team → Users: sign-in accounts. Create admins and supervisors, choose a supervisor's access, reset passwords/2-step, suspend.
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "./api";
import { useShell } from "@/components/Shell";
import { UserPlus, ShieldCheck, KeyRound, Ban, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { SECTIONS } from "@/lib/supaccess";

const EMPTY = { name: "", loginId: "", password: "", email: "", departmentId: "", role: "ADMIN", supAccess: [] };
const roleLabel = (r) => (r === "ADMIN" ? "Admin" : r === "SUPERVISOR" ? "Supervisor" : "Agent");

export default function Users() {
  const { me } = useShell();
  const [list, setList] = useState(null); const [org, setOrg] = useState({ departments: [], campaigns: [] });
  const [f, setF] = useState(EMPTY); const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const [editAccess, setEditAccess] = useState(null);
  const load = () => api("/api/users").then((r) => r.ok && setList(r.data));
  useEffect(() => { load(); api("/api/org").then((r) => r.ok && setOrg(r.data)); }, []);
  const act = async (u, body, ok) => { setErr(""); const r = await api(`/api/users/${u.id}`, "PATCH", body); if (!r.ok) return setErr(r.data.error); setMsg(ok); load(); };
  const toggleSec = (k) => setF((x) => ({ ...x, supAccess: x.supAccess.includes(k) ? x.supAccess.filter((s) => s !== k) : [...x.supAccess, k] }));
  async function create(e) {
    e.preventDefault(); setErr(""); setMsg("");
    const r = await api("/api/users", "POST", f); if (!r.ok) return setErr(r.data.error);
    setMsg(`${roleLabel(r.data.role)} created. They sign in with ${r.data.agentId}.`); setF(EMPTY); load();
  }
  return (
    <div className="stack">
      <form className="panel stack" onSubmit={create}>
        <h2><UserPlus size={17} /> Create a login</h2>
        <p className="muted small" style={{ margin: 0 }}>Admins can do everything. Supervisors get only the sections you tick below. To add agents, use <Link href="/admin/agents">Team → Agents</Link>.</p>
        <div className="form">
          <label>Role<select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}><option value="ADMIN">Admin (full access)</option><option value="SUPERVISOR">Supervisor (limited)</option></select></label>
          <label>Full name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></label>
          <label>Login ID<input value={f.loginId} onChange={(e) => setF({ ...f, loginId: e.target.value.toUpperCase() })} placeholder="e.g. SUP1" required /></label>
          <label>Password (8+ characters)<input type="text" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required minLength={8} autoComplete="new-password" /></label>
          <label>Email<input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
          <label>Department<select value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value })}><option value="">—</option>{org.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        </div>
        {f.role === "SUPERVISOR" && (
          <div className="stack" style={{ gap: 6 }}>
            <div className="row" style={{ justifyContent: "space-between" }}><b>What this supervisor can open</b>
              <div className="row" style={{ gap: 6 }}><button type="button" className="ghost sm" onClick={() => setF({ ...f, supAccess: SECTIONS.map((s) => s.key) })}>All</button><button type="button" className="ghost sm" onClick={() => setF({ ...f, supAccess: [] })}>None</button></div></div>
            <div className="sup-grid">{SECTIONS.map((s) => (
              <label key={s.key} className="sup-check"><input type="checkbox" checked={f.supAccess.includes(s.key)} onChange={() => toggleSec(s.key)} /> {s.label}</label>
            ))}</div>
            <p className="muted small" style={{ margin: 0 }}>The Overview dashboard is always visible. Login management and settings stay admin-only.</p>
          </div>
        )}
        {err && <div className="err">{err}</div>}{msg && <div className="receipt">{msg}</div>}
        <div><button><UserPlus size={15} /> Create {f.role === "SUPERVISOR" ? "supervisor" : "admin"}</button></div>
      </form>
      <section className="panel tablewrap">
        <table>
          <thead><tr><th>User</th><th>Role</th><th>Department</th><th>Campaign</th><th>2-step</th><th>Status</th><th></th></tr></thead>
          <tbody>{(list || []).map((u) => (
            <tr key={u.id}>
              <td><b>{u.name}</b>{u.id === me?.uid && <span className="muted small"> (you)</span>}<div className="muted small num">{u.agentId}{u.email ? " · " + u.email : ""}</div></td>
              <td><span className={"chip " + (u.role === "ADMIN" ? "late" : u.role === "SUPERVISOR" ? "" : "ok")}>{roleLabel(u.role)}</span></td>
              <td><select value={u.departmentId || ""} onChange={(e) => act(u, { departmentId: e.target.value }, "Department updated.")} style={{ padding: "4px 8px", minWidth: 150 }}><option value="">—</option>{org.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></td>
              <td><select value={u.campaignId || ""} onChange={(e) => act(u, { campaignId: e.target.value }, "Campaign updated.")} style={{ padding: "4px 8px", minWidth: 130 }}><option value="">—</option>{org.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></td>
              <td>{u.totpEnabled ? <span className="chip ok"><ShieldCheck size={11} /> on</span> : <span className="muted small">off</span>}</td>
              <td><span className={"chip " + (u.active ? "ok" : "red")}>{u.active ? "active" : "suspended"}</span></td>
              <td className="row" style={{ flexWrap: "nowrap", gap: 4 }}>
                {u.role === "SUPERVISOR" && <button className="ghost sm" title="Edit access" onClick={() => setEditAccess(u)}><SlidersHorizontal size={13} /> Access</button>}
                <button className="ghost sm" title="Reset password" onClick={() => { const p = prompt(`New password for ${u.name}`); if (p) act(u, { password: p }, `Password changed for ${u.name}.`); }}><KeyRound size={13} /></button>
                {u.totpEnabled && <button className="ghost sm" title="Reset 2-step sign-in" onClick={() => confirm(`Reset 2-step sign-in for ${u.name}? They'll set it up again next time.`) && act(u, { reset2fa: true }, "2-step sign-in reset.")}><ShieldCheck size={13} /></button>}
                {u.id !== me?.uid && <button className="ghost sm" onClick={() => confirm(`${u.active ? "Suspend" : "Restore"} ${u.name}?`) && act(u, { active: !u.active }, u.active ? "Suspended." : "Restored.")}>{u.active ? <Ban size={13} /> : <RotateCcw size={13} />}</button>}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </section>
      {editAccess && <AccessModal user={editAccess} onClose={() => setEditAccess(null)} onDone={() => { setEditAccess(null); load(); }} />}
    </div>
  );
}

function AccessModal({ user, onClose, onDone }) {
  const [sel, setSel] = useState(() => { try { return JSON.parse(user.supAccess || "[]"); } catch { return []; } });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const toggle = (k) => setSel((s) => s.includes(k) ? s.filter((x) => x !== k) : [...s, k]);
  async function save() { setBusy(true); setErr(""); const r = await api(`/api/users/${user.id}`, "PATCH", { supAccess: sel }); setBusy(false); if (!r.ok) return setErr(r.data.error || "Couldn't save."); onDone(); }
  return (
    <div className="ai-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ai-modal" role="dialog" aria-modal="true">
        <header className="ai-modal-head"><b className="row" style={{ gap: 7 }}><SlidersHorizontal size={15} /> {user.name}'s access</b><button className="ghost sm icon-btn" onClick={onClose} aria-label="Close"><X size={15} /></button></header>
        <div className="ai-modal-body">
          <div className="row" style={{ justifyContent: "flex-end", gap: 6, marginBottom: 8 }}><button className="ghost sm" onClick={() => setSel(SECTIONS.map((s) => s.key))}>All</button><button className="ghost sm" onClick={() => setSel([])}>None</button></div>
          <div className="sup-grid">{SECTIONS.map((s) => <label key={s.key} className="sup-check"><input type="checkbox" checked={sel.includes(s.key)} onChange={() => toggle(s.key)} /> {s.label}</label>)}</div>
          <p className="muted small">Overview is always visible. Changes apply the next time they sign in.</p>
          {err && <div className="err">{err}</div>}
        </div>
        <footer className="ai-modal-foot"><button className="ghost sm" onClick={onClose}>Cancel</button><button className="sm" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save access"}</button></footer>
      </div>
    </div>
  );
}
