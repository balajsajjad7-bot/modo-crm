"use client";
// Team → Agent access: turn features on or off for all agents. Enforced on the server, not just hidden.
import { useEffect, useState } from "react";
import { api } from "./api";
import { ShieldCheck, Save } from "lucide-react";

export default function Access() {
  const [d, setD] = useState(null); const [v, setV] = useState({}); const [msg, setMsg] = useState("");
  useEffect(() => { api("/api/access").then((r) => { if (r.ok) { setD(r.data); setV(r.data.values); } }); }, []);
  async function save() { setMsg(""); const r = await api("/api/access", "PATCH", v); setMsg(r.ok ? "Saved. Agents get the new access within a minute (or when they refresh)." : r.data.error); }
  if (!d) return <p className="muted">Loading…</p>;
  return (
    <section className="panel stack">
      <div className="row" style={{ gap: 8 }}><ShieldCheck size={18} /><h2><ShieldCheck size={17} /> What agents can do</h2></div>
      <p className="muted small" style={{ margin: 0 }}>Applies to every agent. Admins can always do everything. Turned-off actions are blocked by the server, not just hidden.</p>
      <div className="action-list">
        {Object.entries(d.perms).map(([k, p]) => (
          <div key={k}><div><b>{p.label}</b>{k === "editCustomers" && <div className="muted small">When off, the customer's name and details are read-only for agents.</div>}{k === "seeContactInfo" && <div className="muted small">When off, phone numbers show as •••• 42.</div>}</div>
            <button role="switch" aria-checked={!!v[k]} className={"toggle" + (v[k] ? " on" : "")} onClick={() => setV({ ...v, [k]: !v[k] })}><span /></button></div>
        ))}
      </div>
      {msg && <div className="receipt">{msg}</div>}
      <div><button onClick={save}><Save size={15} /> Save access</button></div>
    </section>
  );
}
