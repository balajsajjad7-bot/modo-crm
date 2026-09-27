"use client";
// Team → Users: every sign-in account. Create more admins, reset passwords and 2-step sign-in, suspend.
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "./api";
import { useShell } from "@/components/Shell";
import { UserPlus, ShieldCheck, KeyRound, Ban, RotateCcw, Save } from "lucide-react";

export default function Users() {
  const { me } = useShell();
  const [list, setList] = useState(null); const [org, setOrg] = useState({ departments: [], campaigns: [] });
  const [f, setF] = useState({ name: "", loginId: "", password: "", email: "", departmentId: "" }); const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const load = () => api("/api/users").then((r) => r.ok && setList(r.data));
  useEffect(() => { load(); api("/api/org").then((r) => r.ok && setOrg(r.data)); }, []);
  const act = async (u, body, ok) => { setErr(""); const r = await api(`/api/users/${u.id}`, "PATCH", body); if (!r.ok) return setErr(r.data.error); setMsg(ok); load(); };
  async function create(e) {
    e.preventDefault(); setErr(""); setMsg("");
    const r = await api("/api/users", "POST", f); if (!r.ok) return setErr(r.data.error);
    setMsg(`Admin created. They sign in with ${r.data.agentId}.`); setF({ name: "", loginId: "", password: "", email: "", departmentId: "" }); load();
  }
  const dept = (id) => org.departments.find((d) => d.id === id);
  const camp = (id) => org.campaigns.find((d) => d.id === id);
  return (
    <div className="stack">
      <form className="panel stack" onSubmit={create}>
        <h2><UserPlus size={17} /> Create an admin</h2>
        <p className="muted small" style={{ margin: 0 }}>Admins can see and change everything. To add agents, use <Link href="/admin/agents">Team → Agents</Link>.</p>
        <div className="form">
          <label>Full name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></label>
          <label>Login ID<input value={f.loginId} onChange={(e) => setF({ ...f, loginId: e.target.value.toUpperCase() })} placeholder="e.g. ADM2" required /></label>
          <label>Password (8+ characters)<input type="text" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required minLength={8} autoComplete="new-password" /></label>
          <label>Email<input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
          <label>Department<select value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value })}><option value="">—</option>{org.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        </div>
        {err && <div className="err">{err}</div>}{msg && <div className="receipt">{msg}</div>}
        <div><button><UserPlus size={15} /> Create admin</button></div>
      </form>
      <section className="panel tablewrap">
        <table>
          <thead><tr><th>User</th><th>Role</th><th>Department</th><th>Campaign</th><th>2-step</th><th>Status</th><th></th></tr></thead>
          <tbody>{(list || []).map((u) => (
            <tr key={u.id}>
              <td><b>{u.name}</b>{u.id === me?.uid && <span className="muted small"> (you)</span>}<div className="muted small num">{u.agentId}{u.email ? " · " + u.email : ""}</div></td>
              <td><span className={"chip " + (u.role === "ADMIN" ? "late" : "")}>{u.role === "ADMIN" ? "Admin" : "Agent"}</span></td>
              <td><select value={u.departmentId || ""} onChange={(e) => act(u, { departmentId: e.target.value }, "Department updated.")} style={{ padding: "4px 8px", minWidth: 150 }}><option value="">—</option>{org.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></td>
              <td><select value={u.campaignId || ""} onChange={(e) => act(u, { campaignId: e.target.value }, "Campaign updated.")} style={{ padding: "4px 8px", minWidth: 130 }}><option value="">—</option>{org.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></td>
              <td>{u.totpEnabled ? <span className="chip ok"><ShieldCheck size={11} /> on</span> : <span className="muted small">off</span>}</td>
              <td><span className={"chip " + (u.active ? "ok" : "red")}>{u.active ? "active" : "suspended"}</span></td>
              <td className="row" style={{ flexWrap: "nowrap", gap: 4 }}>
                <button className="ghost sm" title="Reset password" onClick={() => { const p = prompt(`New password for ${u.name}`); if (p) act(u, { password: p }, `Password changed for ${u.name}.`); }}><KeyRound size={13} /></button>
                {u.totpEnabled && <button className="ghost sm" title="Reset 2-step sign-in" onClick={() => confirm(`Reset 2-step sign-in for ${u.name}? They'll set it up again next time.`) && act(u, { reset2fa: true }, "2-step sign-in reset.")}><ShieldCheck size={13} /></button>}
                {u.id !== me?.uid && <button className="ghost sm" onClick={() => confirm(`${u.active ? "Suspend" : "Restore"} ${u.name}?`) && act(u, { active: !u.active }, u.active ? "Suspended." : "Restored.")}>{u.active ? <Ban size={13} /> : <RotateCcw size={13} />}</button>}
              </td>
            </tr>
          ))}</tbody>
        </table>
      </section>
    </div>
  );
}
