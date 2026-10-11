"use client";
// Admin: sale password (agents type it to submit a sale) + switch Submit sale off for chosen agents.
import { useEffect, useState } from "react";
import { KeyRound, ShieldCheck, Search, Loader2, ChevronDown } from "lucide-react";

const api = (url, method = "GET", body) => fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" }).then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }));

export default function SaleControls({ startOpen = false }) {
  const [d, setD] = useState(null); const [open, setOpen] = useState(startOpen); const [pw, setPw] = useState(""); const [q, setQ] = useState("");
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState("");
  const load = () => api("/api/sales/lock").then((r) => r.ok && setD(r.data));
  useEffect(() => { load(); }, []);
  const say = (t) => { setMsg(t); setTimeout(() => setMsg(""), 3500); };
  if (!d || !d.agents) return null;
  const off = new Set(d.blocked);
  const shown = d.agents.filter((a) => !q || (a.name + " " + a.agentId).toLowerCase().includes(q.toLowerCase()));
  const toggle = async (a) => { setBusy(a.id); const r = await api("/api/sales/lock", "POST", { action: "agent", uid: a.id, off: !off.has(a.id) }); setBusy(""); if (r.ok) setD({ ...d, blocked: r.data.blocked }); else say(r.data.error); };
  return (
    <section className="panel stack sc">
      <button type="button" data-plain className="sc-head" onClick={() => setOpen(!open)}>
        <span className="gt gt-sm" style={{ "--g1": "#fda4af", "--g2": "#e11d48" }}><ShieldCheck size={17} /></span>
        <span><b>Submit sale controls</b><small>{d.hasPassword ? "🔐 Sale password ON" : "No sale password"} · {off.size ? `${off.size} agent${off.size > 1 ? "s" : ""} can't submit` : "every agent can submit"}</small></span>
        <ChevronDown size={16} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
      </button>
      {open && <>
        <div className="sc-box">
          <b><KeyRound size={14} /> Sale password</b>
          <p className="muted small" style={{ margin: 0 }}>When it's on, agents must type this password every time they submit a sale. 5 wrong tries lock them out for 15 minutes and you get an alert.</p>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder={d.hasPassword ? "New sale password" : "Set a sale password"} autoComplete="new-password" style={{ maxWidth: 260 }} />
            <button disabled={pw.length < 4 || busy === "pw"} onClick={async () => { setBusy("pw"); const r = await api("/api/sales/lock", "POST", { action: "password", password: pw }); setBusy(""); if (r.ok) { setPw(""); say("✓ Sale password is on"); load(); } else say(r.data.error); }}>{busy === "pw" ? <Loader2 size={14} className="spin" /> : <KeyRound size={14} />} {d.hasPassword ? "Change" : "Turn on"}</button>
            {d.hasPassword && <button className="ghost" onClick={async () => { if (!confirm("Turn off the sale password? Agents will submit without it.")) return; await api("/api/sales/lock", "POST", { action: "clearPassword" }); say("Sale password is off"); load(); }}>Turn off</button>}
          </div>
        </div>
        <div className="sc-box">
          <div className="row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <b>Who can submit sales</b>
            <span className="cp-search"><Search size={13} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find agent" /></span>
          </div>
          <div className="sc-list">
            {shown.map((a) => (
              <label key={a.id} className={"sc-row" + (off.has(a.id) ? " off" : "")}>
                <span><b>{a.name}</b><small>{a.agentId}</small></span>
                <span className="sc-state">{off.has(a.id) ? "Off" : "On"}</span>
                <button type="button" data-plain role="switch" aria-checked={!off.has(a.id)} className={"sc-sw" + (off.has(a.id) ? "" : " on")} disabled={busy === a.id} onClick={() => toggle(a)}><i /></button>
              </label>
            ))}
            {!shown.length && <p className="muted small">No agents.</p>}
          </div>
        </div>
        {msg && <span className="small">{msg}</span>}
      </>}
    </section>
  );
}
