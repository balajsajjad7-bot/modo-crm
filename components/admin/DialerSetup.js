"use client";
// Admin → Tools → Dialer setup: pick the dialer, connect it, link agents, set results and pause codes. All in one place.
import { useEffect, useState } from "react";
import { api } from "./api";
import { PhoneCall, Plug, Users, ListChecks, CheckCircle2, Circle, Zap, Save, Plus, Trash2, Wand2, Search } from "lucide-react";

const PROVIDERS = [["vicidial", "VICIdial", "Built in. Modo drives VICIdial through its Agent API."], ["custom", "Other dialer", "Any dialer with a web API (future-proof): you type its URLs below."], ["off", "Off", "Hide the dialer from agents."]];
const V_FIELDS = [["url", "VICIdial address", "https://dialer.yourcompany.com"], ["user", "API user", "a VICIdial user with API access"], ["pass", "API password", ""], ["agentUrl", "Agent screen URL (optional)", "defaults to …/agc/vicidial.php"], ["monitorPhone", "Your phone login (for Listen/Whisper/Barge)", "e.g. 350a"], ["serverIp", "Dialer server IP (only if needed)", ""]];
const ACT_HELP = { status: "Returns JSON about the agent's current call", dial: "Call {number}", hangup: "Hang up", pause: "Pause the agent ({code} = reason)", resume: "Make the agent ready", dispo: "Save the result {code} / {label}, note {note}", park: "Put the customer on hold", grab: "Take the customer off hold", transfer: "Transfer to {number} ({type} = blind/warm)", dtmf: "Send keypad tones {digits}", record: "Recording on/off ({on} = 1/0)" };

function CodeList({ items, onChange }) {
  return (
    <div className="stack" style={{ gap: 6 }}>
      {items.map((x, i) => (
        <div key={i} className="row" style={{ flexWrap: "nowrap", gap: 6 }}>
          <input value={x.code} onChange={(e) => onChange(items.map((y, j) => (j === i ? { ...y, code: e.target.value.toUpperCase() } : y)))} placeholder="CODE" style={{ maxWidth: 120, fontFamily: "ui-monospace,monospace" }} aria-label="Code" />
          <input value={x.label} onChange={(e) => onChange(items.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} placeholder="What agents see" aria-label="Label" />
          <button className="ghost sm icon-btn" aria-label="Remove" onClick={() => onChange(items.filter((_, j) => j !== i))}><Trash2 size={13} /></button>
        </div>
      ))}
      <div><button className="ghost sm" onClick={() => onChange([...items, { code: "", label: "" }])}><Plus size={13} /> Add</button></div>
    </div>
  );
}

export default function DialerSetup() {
  const [dz, setDz] = useState(null); const [dzBusy, setDzBusy] = useState(false); const [dzErr, setDzErr] = useState(""); const [dzQ, setDzQ] = useState("");
  const [d, setD] = useState(null); const [v, setV] = useState({}); const [links, setLinks] = useState({}); const [msg, setMsg] = useState(""); const [test, setTest] = useState(""); const [custom, setCustom] = useState({}); const [tAgent, setTAgent] = useState("");
  const load = () => api("/api/dialer/config").then((r) => { if (!r.ok) return; setD(r.data); setV(r.data.vicidial?.config || {}); setCustom(r.data.custom || {}); setLinks(Object.fromEntries(r.data.agents.map((a) => [a.id, a.vicidialUser || ""]))); });
  useEffect(() => { load(); }, []);
  async function detectAgents() {
    setDzBusy(true); setDzErr(""); setDz(null);
    const r = await api("/api/vicidial/agents");
    setDzBusy(false); if (r.ok) setDz(r.data); else setDzErr(r.data.error || "Couldn't read agents.");
  }
  async function applyCampaign(camp) {
    if (!d.vicidial?.id) { setDzErr("Save the VICIdial connection first."); return; }
    const r = await api(`/api/connectors/${d.vicidial.id}`, "PATCH", { config: { campaigns: camp } });
    if (r.ok) setV((x) => ({ ...x, campaigns: camp }));
    setMsg(r.ok ? `Now showing only campaign "${camp}". Refresh the home screen.` : (r.data.error || "Couldn't save."));
  }
  if (!d) return <p className="muted">Loading dialer setup…</p>;
  const say = (m) => { setMsg(m); setTimeout(() => setMsg(""), 4000); };
  const save = async (patch, ok = "Saved.") => { const r = await api("/api/dialer/config", "PATCH", patch); say(r.ok ? ok : r.data.error); load(); return r; };
  async function saveVici() {
    const body = { type: "vicidial", name: "VICIdial", config: v, enabled: true };
    const r = d.vicidial ? await api(`/api/connectors/${d.vicidial.id}`, "PATCH", { config: v, enabled: true }) : await api("/api/connectors", "POST", body);
    if (!r.ok) return say(r.data.error); say("VICIdial connection saved."); await load(); testVici(r.data.id || d.vicidial?.id);
  }
  async function testVici(id) { if (!id) return; setTest("Testing…"); const r = await api(`/api/connectors/${id}`, "POST"); setTest(r.data.status || r.data.error); }
  const linked = d.agents.filter((a) => links[a.id]).length;
  const steps = d.provider === "off" ? [] : [
    [d.provider === "vicidial" ? !!d.vicidial : !!custom.status?.url, "Connection saved"],
    [d.provider === "vicidial" ? /^OK/.test(test || d.vicidial?.lastStatus?.replace("test: ", "") || "") : true, "Connection tested"],
    [linked > 0, `Agents linked (${linked} of ${d.agents.length})`],
    [d.dispositions.length > 0, "Call results set"],
  ];
  const setAct = (a, k, val) => setCustom((c) => ({ ...c, [a]: { ...(c[a] || {}), [k]: val } }));
  return (
    <div className="stack">
      <section className="panel stack">
        <h2><PhoneCall size={17} /> Which dialer?</h2>
        <div className="prov-grid">{PROVIDERS.map(([k, l, h]) => (
          <button key={k} className={"prov" + (d.provider === k ? " on" : "")} onClick={() => save({ provider: k }, `Dialer: ${l}.`)}><b>{l}</b><span>{h}</span></button>
        ))}</div>
        {d.provider !== "off" && (
          <div className="action-list"><div><div><b>Show the Dialer to agents</b><div className="muted small">Adds "Dialer" to every agent's top bar.</div></div>
            <button role="switch" aria-checked={d.agentsSeeDialer} className={"toggle" + (d.agentsSeeDialer ? " on" : "")} onClick={() => save({ agentsSeeDialer: !d.agentsSeeDialer })}><span /></button></div></div>
        )}
        {steps.length > 0 && <div className="setup-steps">{steps.map(([ok, l], i) => <span key={i} className={ok ? "ok" : ""}>{ok ? <CheckCircle2 size={14} /> : <Circle size={14} />} {l}</span>)}</div>}
      </section>
      {msg && <div className="receipt">{msg}</div>}

      {d.provider === "vicidial" && (
        <section className="panel stack">
          <h2><Plug size={17} /> Connect VICIdial</h2>
          <div className="form">{V_FIELDS.map(([k, l, ph]) => <label key={k}>{l}<input type={k === "pass" ? "password" : "text"} value={v[k] || ""} placeholder={k === "pass" && d.vicidial ? "saved (type to change)" : ph} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></label>)}</div>
          <p className="muted small" style={{ margin: 0 }}>In VICIdial: Admin → Users → your API user → set User Level 8+, turn on <b>API Access</b>, <b>Agent API Access</b> and <b>View Reports</b>.</p>
          <div className="row"><button onClick={saveVici}><Save size={15} /> Save & test</button>{d.vicidial && <button className="ghost" onClick={() => testVici(d.vicidial.id)}><Zap size={14} /> Test again</button>}{test && <span className="small" style={{ color: /^OK/.test(test) ? "var(--green)" : "var(--amber)" }}>{test}</span>}</div>
        </section>
      )}

      {d.provider === "vicidial" && d.vicidial && (
        <section className="panel stack">
          <h2><Users size={17} /> Find your agents & campaign</h2>
          <p className="muted small" style={{ margin: 0 }}>Seeing agents that aren't yours? Show everyone on the dialer right now, find your people (e.g. Tom), then tap their campaign to show only that team on the home screen.</p>
          <div className="row"><button onClick={detectAgents} disabled={dzBusy}><Search size={15} /> {dzBusy ? "Reading dialer…" : "Show agents on my dialer"}</button>{dz && <input placeholder="Filter by name or user…" value={dzQ} onChange={(e) => setDzQ(e.target.value)} style={{ flex: 1, minWidth: 160 }} />}</div>
          {dzErr && <p className="err small" style={{ margin: 0 }}>{dzErr}</p>}
          {dz && (
            <>
              {dz.campaigns.length > 0 && (
                <div className="stack" style={{ gap: 6 }}>
                  <span className="sf-l">Campaigns on the dialer — tap yours to show only it:</span>
                  <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
                    {dz.campaigns.map((c) => <button key={c} className="chip" style={v.campaigns === c ? { outline: "2px solid var(--accent, #7aa2ff)", fontWeight: 700, cursor: "pointer" } : { cursor: "pointer" }} onClick={() => applyCampaign(c)}>{c} — use this</button>)}
                  </div>
                </div>
              )}
              <div className="tablewrap">
                <table><thead><tr><th>Name</th><th>Dialer user</th><th>Campaign</th><th>Group</th><th>Status</th></tr></thead>
                  <tbody>{dz.agents.filter((a) => { const q = dzQ.toLowerCase(); return !q || (a.name + " " + a.user).toLowerCase().includes(q); }).map((a, i) => (
                    <tr key={i}><td>{a.name || "—"}</td><td>{a.user}</td><td><b>{a.campaign || "—"}</b></td><td>{a.group || "—"}</td><td className="muted small">{a.status}</td></tr>
                  ))}</tbody>
                </table>
              </div>
              <p className="muted small" style={{ margin: 0 }}>{dz.count} agent(s) live on the dialer.</p>
            </>
          )}
        </section>
      )}

      {d.provider === "custom" && (
        <section className="panel stack">
          <h2><Plug size={17} /> Connect another dialer</h2>
          <p className="muted small" style={{ margin: 0 }}>For each action, paste the dialer's API address. Use placeholders: <code>{"{agent}"}</code> (the agent's dialer login), <code>{"{number}"}</code>, <code>{"{code}"}</code>, <code>{"{label}"}</code>, <code>{"{note}"}</code>, <code>{"{digits}"}</code>, <code>{"{type}"}</code>, <code>{"{on}"}</code>, <code>{"{key}"}</code>. Leave an action empty if the dialer can't do it.</p>
          <div className="form">
            <label>Dialer name<input value={custom.nameTmp ?? d.name ?? ""} onChange={(e) => setCustom({ ...custom, nameTmp: e.target.value })} placeholder="e.g. Convoso" /></label>
            <label>Agent screen URL<input value={custom.agentUrl || ""} onChange={(e) => setCustom({ ...custom, agentUrl: e.target.value })} /></label>
            <label>API key<input type="password" value={custom.key || ""} onChange={(e) => setCustom({ ...custom, key: e.target.value })} /></label>
            <label>Key header (if the key goes in a header)<input value={custom.keyHeader || ""} onChange={(e) => setCustom({ ...custom, keyHeader: e.target.value })} placeholder="e.g. Authorization or x-api-key" /></label>
          </div>
          <div className="act-table">{d.actions.map((a) => (
            <div key={a}><b>{a}</b><span className="muted small">{ACT_HELP[a]}</span>
              <select value={custom[a]?.method || "GET"} onChange={(e) => setAct(a, "method", e.target.value)} aria-label={a + " method"}><option>GET</option><option>POST</option></select>
              <input value={custom[a]?.url || ""} onChange={(e) => setAct(a, "url", e.target.value)} placeholder="https://…" aria-label={a + " URL"} />
              {custom[a]?.method === "POST" && <input value={custom[a]?.body || ""} onChange={(e) => setAct(a, "body", e.target.value)} placeholder='JSON body, e.g. {"agent":"{agent}","number":"{number}"}' aria-label={a + " body"} />}
            </div>
          ))}</div>
          <details><summary className="small">Map the status answer (if its fields have different names)</summary>
            <div className="form" style={{ marginTop: 8 }}>{["status", "phone", "name", "campaign", "callsToday", "address", "zip", "email", "leadId", "loggedIn"].map((k) => <label key={k}>{k}<input value={custom.map?.[k] || ""} placeholder={k} onChange={(e) => setCustom({ ...custom, map: { ...(custom.map || {}), [k]: e.target.value } })} /></label>)}</div>
          </details>
          <div className="row">
            <button onClick={() => { const { nameTmp, ...c } = custom; save({ custom: c, ...(nameTmp != null ? { name: nameTmp } : {}) }, "Dialer settings saved."); }}><Save size={15} /> Save</button>
            <input value={tAgent} onChange={(e) => setTAgent(e.target.value)} placeholder="agent login to test" style={{ maxWidth: 200 }} />
            <button className="ghost" onClick={async () => { const r = await api("/api/dialer/config", "PATCH", { testAgent: tAgent }); setTest(r.ok ? "OK: " + JSON.stringify(r.data.test) : r.data.error); }} disabled={!tAgent}><Zap size={14} /> Test status</button>
          </div>
          {test && <pre className="raw small">{test}</pre>}
        </section>
      )}

      {d.provider !== "off" && (
        <>
          <section className="panel stack">
            <div className="row" style={{ justifyContent: "space-between" }}><h2><Users size={17} /> Agents <span className="muted small">{linked} of {d.agents.length} linked</span></h2>
              <div className="row"><button className="ghost sm" onClick={() => save({ autoMatch: true }, "Empty ones filled with each agent's Modo ID.")}><Wand2 size={13} /> Fill empty with Modo IDs</button>
                <button className="sm" onClick={() => save({ links: Object.entries(links).map(([id, user]) => ({ id, user })) }, "Agent logins saved.")}><Save size={13} /> Save logins</button></div></div>
            <p className="muted small" style={{ margin: 0 }}>Type each agent's login on the dialer ({d.provider === "vicidial" ? "their VICIdial user" : "their dialer login"}).</p>
            <div className="link-grid">{d.agents.map((a) => (
              <label key={a.id} style={a.active ? undefined : { opacity: .5 }}><span><b>{a.name}</b> <span className="muted small">{a.agentId}</span></span>
                <input value={links[a.id] || ""} onChange={(e) => setLinks({ ...links, [a.id]: e.target.value })} placeholder="dialer login" /></label>
            ))}</div>
          </section>
          <div className="two-col">
            <section className="panel stack"><h2><ListChecks size={17} /> Call results</h2><p className="muted small" style={{ margin: 0 }}>The buttons agents tap after a call. Codes must match your dialer's statuses.</p>
              <CodeList items={d.dispositions} onChange={(x) => setD({ ...d, dispositions: x })} /><div><button className="sm" onClick={() => save({ dispositions: d.dispositions }, "Call results saved.")}><Save size={13} /> Save results</button></div></section>
            <section className="panel stack"><h2>Pause reasons</h2><p className="muted small" style={{ margin: 0 }}>Codes must match your dialer's pause codes.</p>
              <CodeList items={d.pauseCodes} onChange={(x) => setD({ ...d, pauseCodes: x })} /><div><button className="sm" onClick={() => save({ pauseCodes: d.pauseCodes }, "Pause reasons saved.")}><Save size={13} /> Save pause reasons</button></div></section>
          </div>
        </>
      )}
    </div>
  );
}
