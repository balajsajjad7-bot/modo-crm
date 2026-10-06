"use client";
// Dialer setup → Phones: your listening phone + every agent's phone, with Listen / Whisper / Barge.
import { useEffect, useState } from "react";
import { Headphones, MessageSquareQuote, PhoneIncoming, Plus, Save, Trash2, RefreshCw, Phone } from "lucide-react";

const api = (url, method = "GET", body) => fetch(url, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, cache: "no-store" }).then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }));

export default function PhonesSetup() {
  const [d, setD] = useState(null); const [mon, setMon] = useState({ login: "", pass: "", serverIp: "" }); const [rows, setRows] = useState({});
  const [msg, setMsg] = useState(null); const [adding, setAdding] = useState(false); const [add, setAdd] = useState({ id: "", vicidialUser: "", phone: "", pass: "" }); const [busy, setBusy] = useState("");
  const load = () => api("/api/dialer/phones").then((r) => { if (!r.ok) return; setD(r.data); setMon({ login: r.data.monitor.login, pass: "", serverIp: r.data.monitor.serverIp }); });
  useEffect(() => { load(); }, []);
  const say = (ok, text) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 6000); };
  if (!d) return null;
  if (!d.connected) return <section className="panel stack"><h2><Phone size={17} /> Phones</h2><p className="muted small" style={{ margin: 0 }}>Connect VICIdial above first.</p></section>;
  const withPhone = d.agents.filter((a) => a.sipUser || a.phonePassSet || a.vicidialUser);
  const without = d.agents.filter((a) => a.role === "AGENT" && !withPhone.includes(a));
  const edit = (id, k, v) => setRows((x) => ({ ...x, [id]: { ...x[id], [k]: v } }));
  async function saveMon() { const r = await api("/api/dialer/phones", "POST", { monitor: mon }); r.ok ? say(true, "Listening phone saved. When you listen in, VICIdial rings this phone (your Modo phone answers it if it's a webphone).") : say(false, r.data.error); load(); }
  async function saveRow(a) { const x = rows[a.id] || {}; const r = await api("/api/dialer/phones", "POST", { agent: { id: a.id, ...("vu" in x ? { vicidialUser: x.vu } : {}), ...("phone" in x ? { phone: x.phone } : {}), ...(x.pass ? { pass: x.pass } : {}) } }); r.ok ? say(true, `${a.name}'s phone saved.`) : say(false, r.data.error); setRows((y) => ({ ...y, [a.id]: {} })); load(); }
  async function saveAdd() { if (!add.id) return say(false, "Pick the agent."); const r = await api("/api/dialer/phones", "POST", { agent: { id: add.id, vicidialUser: add.vicidialUser, phone: add.phone, pass: add.pass } }); if (!r.ok) return say(false, r.data.error); say(true, "Phone added."); setAdding(false); setAdd({ id: "", vicidialUser: "", phone: "", pass: "" }); load(); }
  async function monitor(a, stage) {
    setBusy(a.id + stage);
    const r = await api("/api/vicidial/monitor", "POST", { userId: a.id, stage }); setBusy("");
    r.ok ? say(true, r.data.message) : say(false, r.data.error);
  }
  return (
    <section className="panel stack">
      <div className="row" style={{ justifyContent: "space-between" }}><h2><Phone size={17} /> Phones (listen, whisper, barge)</h2><button className="ghost sm icon-btn" aria-label="Refresh" onClick={load}><RefreshCw size={14} /></button></div>

      <div className="ph-box">
        <b><Headphones size={15} /> Your listening phone</b>
        <span className="muted small">When you press Listen, VICIdial rings this phone and joins you to the agent's call. If it's a webphone, your Modo phone answers it automatically.</span>
        <div className="ph-grid">
          <label>Phone login<input value={mon.login} onChange={(e) => setMon({ ...mon, login: e.target.value })} placeholder="e.g. 2030" /></label>
          <label>Phone password<input type="password" value={mon.pass} onChange={(e) => setMon({ ...mon, pass: e.target.value })} placeholder={d.monitor.passSet ? "saved (type to change)" : "phone password"} autoComplete="off" /></label>
          <label>Dialer server IP<input value={mon.serverIp} onChange={(e) => setMon({ ...mon, serverIp: e.target.value })} placeholder="e.g. 49.12.153.210" /></label>
        </div>
        <button className="sm" style={{ justifySelf: "start" }} onClick={saveMon}><Save size={13} /> Save my phone</button>
      </div>

      <div className="row" style={{ justifyContent: "space-between" }}><b>Agent phones</b><button className="sm" onClick={() => setAdding(!adding)}><Plus size={13} /> Add agent phone</button></div>
      {adding && (
        <div className="ph-box">
          <div className="ph-grid">
            <label>Agent<select value={add.id} onChange={(e) => { const a = d.agents.find((x) => x.id === e.target.value); setAdd({ ...add, id: e.target.value, vicidialUser: a?.vicidialUser || "" }); }}><option value="">Pick an agent…</option>{d.agents.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.agentId})</option>)}</select></label>
            <label>VICIdial user<input value={add.vicidialUser} onChange={(e) => setAdd({ ...add, vicidialUser: e.target.value })} placeholder="e.g. 2001" /></label>
            <label>Phone login<input value={add.phone} onChange={(e) => setAdd({ ...add, phone: e.target.value })} placeholder="e.g. 2001" /></label>
            <label>Phone password<input type="password" value={add.pass} onChange={(e) => setAdd({ ...add, pass: e.target.value })} autoComplete="off" /></label>
          </div>
          <div className="row" style={{ gap: 6 }}><button className="sm" onClick={saveAdd}><Save size={13} /> Add phone</button><button className="ghost sm" onClick={() => setAdding(false)}>Cancel</button></div>
        </div>
      )}
      {d.liveError && <p className="small" style={{ margin: 0, color: "var(--amber)" }}>Live status unavailable: {d.liveError}</p>}
      <div className="ph-list">
        {withPhone.map((a) => { const x = rows[a.id] || {}; const changed = Object.keys(x).length > 0; return (
          <div key={a.id} className="ph-row">
            <div className="ph-who"><b>{a.name}</b><span className="small muted">{a.role === "ADMIN" ? "admin" : a.agentId}{a.live ? ` · ${a.live.status} on VICIdial` : " · not on VICIdial"}</span></div>
            <input value={x.vu ?? a.vicidialUser ?? ""} onChange={(e) => edit(a.id, "vu", e.target.value)} placeholder="VICIdial user" aria-label="VICIdial user" />
            <input value={x.phone ?? a.sipUser ?? ""} onChange={(e) => edit(a.id, "phone", e.target.value)} placeholder="phone login" aria-label="Phone login" />
            <input type="password" value={x.pass ?? ""} onChange={(e) => edit(a.id, "pass", e.target.value)} placeholder={a.phonePassSet ? "pass saved" : "phone pass"} aria-label="Phone password" autoComplete="off" />
            <div className="ph-acts">
              {changed ? <button className="sm" onClick={() => saveRow(a)}><Save size={12} /> Save</button> : <>
                <button className="ghost sm" disabled={!!busy || !a.live} title="Listen silently" onClick={() => monitor(a, "MONITOR")}><Headphones size={13} /> Listen</button>
                <button className="ghost sm" disabled={!!busy || !a.live} title="Talk to the agent only" onClick={() => monitor(a, "WHISPER")}><MessageSquareQuote size={13} /> Whisper</button>
                <button className="ghost sm" disabled={!!busy || !a.live} title="Join the call" onClick={() => monitor(a, "BARGE")}><PhoneIncoming size={13} /> Barge</button>
              </>}
              <button className="ghost sm icon-btn del" aria-label="Remove phone" onClick={async () => { if (confirm(`Remove ${a.name}'s phone?`)) { await api("/api/dialer/phones", "POST", { remove: a.id }); load(); } }}><Trash2 size={13} /></button>
            </div>
          </div>
        ); })}
        {!withPhone.length && <p className="muted small" style={{ margin: 0 }}>No agent phones yet. Press <b>Add agent phone</b>.</p>}
        {without.length > 0 && <span className="small muted">Without a phone: {without.map((a) => a.name).join(", ")}</span>}
      </div>
      {msg && <div className={"receipt" + (msg.ok ? "" : " err")}>{msg.text}</div>}
      <span className="small muted">Listen/Whisper/Barge work when the agent is logged into VICIdial and Modo can reach the dialer (connection check above is green, or a relay is online).</span>
    </section>
  );
}
