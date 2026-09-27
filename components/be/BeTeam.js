"use client";
// Budget Ease → Team: switch agents onto the Budget Ease campaign. Their "Submit sale" becomes the Budget Ease form.
import { useEffect, useState } from "react";
import { api } from "@/components/admin/api";
import { Users } from "lucide-react";

export default function BeTeam() {
  const [d, setD] = useState(null); const [open, setOpen] = useState(false); const [msg, setMsg] = useState("");
  const load = () => api("/api/budgetease/team").then((r) => r.ok && setD(r.data));
  useEffect(() => { load(); }, []);
  if (!d) return null;
  const on = d.agents.filter((a) => a.on);
  const flip = async (a) => { const r = await api("/api/budgetease/team", "PATCH", { userIds: [a.id], on: !a.on }); setMsg(r.ok ? `${a.name} ${a.on ? "removed from" : "added to"} Budget Ease. They'll see it within a minute (or when they refresh).` : r.data.error); load(); };
  return (
    <section className="panel stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2><Users size={17} /> Budget Ease agents <span className="muted small">{on.length} of {d.agents.length}</span></h2>
        <button className={open ? "ghost sm" : "sm"} onClick={() => setOpen(!open)}>{open ? "Done" : "Add or remove agents"}</button>
      </div>
      {!open ? (
        <p className="muted small" style={{ margin: 0 }}>{on.length ? on.map((a) => a.name).join(", ") : "No one yet. Press “Add or remove agents”."} Budget Ease agents get the Budget Ease form instead of the telecom Submit sale.</p>
      ) : (
        <div className="be-team">{d.agents.map((a) => (
          <div key={a.id} style={a.active ? undefined : { opacity: .5 }}>
            <div style={{ minWidth: 0 }}><b className="ellipsis" style={{ display: "block" }}>{a.name}</b><span className="muted small">{a.agentId}{a.other ? ` · now on ${a.other}` : ""}</span></div>
            <button role="switch" aria-checked={a.on} aria-label={`Budget Ease: ${a.name}`} className={"toggle" + (a.on ? " on" : "")} onClick={() => flip(a)}><span /></button>
          </div>
        ))}</div>
      )}
      {msg && <div className="receipt">{msg}</div>}
    </section>
  );
}
