"use client";
// Admin → Tools → Dialer setup: pick the dialer, connect it, link agents, set results and pause codes. All in one place.
import { useEffect, useState } from "react";
import { api } from "./api";
import DownloadLink from "@/components/DownloadLink";
import PhonesSetup from "./PhonesSetup";
import { PhoneCall, Plug, Users, ListChecks, CheckCircle2, Circle, Zap, Save, Plus, Trash2, Wand2, Search, Stethoscope, XCircle, AlertTriangle, Router, Download, Headset, MonitorSmartphone, PauseCircle } from "lucide-react";
import ViciFix from "@/components/ViciFix";

// Office relay: gets Modo past the dialer's IP firewall by sending requests through a PC in the office.
function Relay() {
  const [r, setR] = useState(null); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false); const [copied, setCopied] = useState(false);
  const load = () => api("/api/relay").then((x) => setR(x.ok ? x.data : { error: x.data.error }));
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []);
  const test = async () => { setBusy(true); setMsg(""); const x = await api("/api/relay", "POST", { action: "test" }); setBusy(false); setMsg(x.ok ? `Works: the dialer answered through the relay in ${x.data.ms}ms (${x.data.text || "HTTP " + x.data.status})` : x.data.error); };
  const renew = async () => { if (!confirm("Make a new relay key? Running relays stop until you give them the new key.")) return; await api("/api/relay", "POST", { action: "newkey" }); setMsg("New key made."); load(); };
  if (!r || r.setup) return null;
  return (
    <section className="panel stack">
      <div className="row" style={{ justifyContent: "space-between" }}><h2><Router size={17} /> Relay (gets Modo past the dialer's firewall) <span className={"chip " + (r.online ? "ok" : "late")}>{r.online ? (r.kind === "cloud" ? "Cloud relay online" : "Office relay online") : "Offline"}</span></h2>
        <button className="ghost sm" onClick={test} disabled={busy || !r.online}><Zap size={13} /> {busy ? "Testing…" : "Test"}</button></div>
      <p className="muted small" style={{ margin: 0 }}>Your dialer only lets in IPs that signed in on its firewall page, and Modo's server has no fixed IP. A relay has a fixed IP: Modo sends dialer requests through it and signs it in on the firewall page by itself. Passwords stay on Modo's server; the relay only talks to your dialer.</p>
      <div className="relay-opts">
        <div className="relay-opt">
          <b>Cloud relay — free, works from your phone (recommended)</b>
          <ol className="drive-steps">
            <li>Copy your relay key: <span className="row" style={{ gap: 6, display: "inline-flex", flexWrap: "nowrap", verticalAlign: "middle" }}><code className="relay-key">{r.key ? r.key.slice(0, 10) + "…" : "…"}</code><button className="ghost sm" onClick={() => { navigator.clipboard?.writeText(r.key || ""); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? "Copied" : "Copy key"}</button></span></li>
            <li>Tap <a className="btn-link" href="https://render.com/deploy?repo=https://github.com/balajsajjad7-bot/modo-crm" target="_blank" rel="noreferrer">Deploy free relay on Render</a> and sign in with GitHub (allow access to the modo-crm repo if asked).</li>
            <li>Render asks for <b>RELAY_KEY</b>: paste the key, then press <b>Deploy Blueprint</b> (Free plan).</li>
            <li>Wait about 2 minutes. This badge turns <b>Cloud relay online</b>, then press <b>Check connection</b> below.</li>
          </ol>
        </div>
        <div className="relay-opt">
          <b>Or: Office relay on a PC</b>
          <p className="muted small" style={{ margin: 0 }}>On an office PC that opens the dialer, <DownloadLink api="/api/relay/bat" className="">download Modo Relay</DownloadLink>, double-click it and leave the window open.</p>
        </div>
      </div>
      {r.lastSeen && <span className="small muted">Last check-in {new Date(r.lastSeen).toLocaleString()}{r.url ? " · " + r.url.replace("https://", "") : ""}</span>}
      {msg && <p className="small" style={{ margin: 0 }}>{msg}</p>}
      <button className="ghost sm" style={{ justifySelf: "start" }} onClick={renew}>Make a new relay key</button>
    </section>
  );
}

// VICIdial screen inside Modo: shared agent password + campaign so everyone is signed in automatically
function EmbedSettings({ d, save }) {
  const [e, setE] = useState(d.embed || {});
  useEffect(() => setE(d.embed || {}), [d.embed]);
  return (
    <section className="panel stack">
      <h2><MonitorSmartphone size={17} /> VICIdial screen inside Modo</h2>
      <p className="muted small" style={{ margin: 0 }}>The Dialer page shows the real VICIdial agent screen, signed in for each person. It runs in their own browser, so it works past the dialer's firewall and VICIdial's own phone works in it. Fill these once:</p>
      <div className="form">
        <label>Agent password (if all agents share one)<input type="password" value={e.agentPass || ""} onChange={(x) => setE({ ...e, agentPass: x.target.value })} placeholder="VICIdial agent password" autoComplete="off" /></label>
        <label>Campaign (optional)<input value={e.campaign || ""} onChange={(x) => setE({ ...e, campaign: x.target.value })} placeholder="e.g. VERIZON" /></label>
      </div>
      <span className="small muted">Phone login = each person's dialer login (Agents below). Phone password = "Phone password" in Modo phone below.</span>
      <button className="sm" style={{ justifySelf: "start" }} onClick={() => save({ embed: e }, "Saved. The Dialer page signs everyone in automatically.")}><Save size={13} /> Save</button>
    </section>
  );
}

// Modo phone (WebRTC on the VICIdial lines): shared settings
function WebPhone({ d, save }) {
  const [w, setW] = useState(d.webphone || {});
  useEffect(() => setW(d.webphone || {}), [d.webphone]);
  let host = ""; try { host = new URL(d.vicidial?.config?.url || "").hostname; } catch {}
  return (
    <section className="panel stack">
      <div className="row" style={{ justifyContent: "space-between" }}><h2><Headset size={17} /> Modo phone (calls inside Modo)</h2>
        <button role="switch" aria-checked={w.on !== false} className={"toggle" + (w.on !== false ? " on" : "")} onClick={() => { const n = { ...w, on: w.on === false }; setW(n); save({ webphone: n }, n.on ? "Modo phone on." : "Modo phone off."); }}><span /></button></div>
      <p className="muted small" style={{ margin: 0 }}>A phone inside Modo on your VICIdial lines. People only allow the microphone. In VICIdial, each phone login must be a <b>WebRTC phone</b> (Admin → Phones → Set As Webphone = Y). When someone logs into VICIdial, it rings their Modo phone and Modo answers by itself.</p>
      <div className="form">
        <label>Phone server (WebSocket)<input value={w.wss || ""} onChange={(e) => setW({ ...w, wss: e.target.value })} placeholder={host ? `wss://${host}:8089/ws` : "wss://your-dialer:8089/ws"} /></label>
        <label>SIP domain<input value={w.domain || ""} onChange={(e) => setW({ ...w, domain: e.target.value })} placeholder={host || "your-dialer"} /></label>
        <label>Dial prefix for manual calls<input value={w.prefix ?? "9"} onChange={(e) => setW({ ...w, prefix: e.target.value })} placeholder="9" /></label>
        <label>Phone password (if all phones share one)<input type="password" value={w.pass || ""} onChange={(e) => setW({ ...w, pass: e.target.value })} placeholder="phone registration password" autoComplete="off" /></label>
      </div>
      <label className="row" style={{ gap: 8 }}><input type="checkbox" style={{ width: "auto" }} checked={w.autoAnswer !== false} onChange={(e) => setW({ ...w, autoAnswer: e.target.checked })} /> Answer calls from the dialer automatically</label>
      <button className="sm" style={{ justifySelf: "start" }} onClick={() => save({ webphone: w }, "Modo phone saved. Everyone's phone reconnects on their next page load.")}><Save size={13} /> Save phone settings</button>
      <span className="small muted">Each person's phone login and password (if different) are under Agents below. Empty phone login = their VICIdial user.</span>
    </section>
  );
}

// Connection check: every step Modo needs from VICIdial, with what's blocked and how to fix it.
function Health() {
  const [h, setH] = useState(null); const [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); const r = await api("/api/vicidial/health"); setBusy(false); setH(r.ok ? r.data : { error: r.data.error || "Check failed." }); };
  return (
    <section className="panel stack">
      <div className="row" style={{ justifyContent: "space-between" }}><h2><Stethoscope size={17} /> Connection check</h2>
        <button className="sm" onClick={run} disabled={busy}><Zap size={13} /> {busy ? "Checking…" : h ? "Check again" : "Check connection"}</button></div>
      <p className="muted small" style={{ margin: 0 }}>Tests the dialer from Modo's live server, step by step. Modo also protects your API user: after a wrong password it stops calling VICIdial for 5 minutes, so the account can't get locked.</p>
      {h?.error && <p className="err small">{h.error}</p>}
      {h?.held && <p className="small" style={{ color: "var(--amber)", margin: 0 }}><AlertTriangle size={13} /> Dialer requests are paused for {h.held.seconds}s: {h.held.msg}</p>}
      {h?.steps && <div className="health-list">{h.steps.map((x) => (
        <div key={x.name} className={"health-row " + (!x.ok ? "bad" : x.warn ? "warn" : "ok")}>
          {!x.ok ? <XCircle size={16} /> : x.warn ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
          <div><b>{x.name}</b> <span className="muted small">{x.ms}ms</span><div className="small">{x.detail}</div>{x.fix && (!x.ok || x.warn) && <div className="small muted">Fix: {x.fix}</div>}</div>
        </div>))}</div>}
    </section>
  );
}

const PROVIDERS = [["vicidial", "VICIdial", "Built in. Modo drives VICIdial through its Agent API."], ["custom", "Other dialer", "Any dialer with a web API (future-proof): you type its URLs below."], ["off", "Off", "Hide the dialer from agents."]];
const V_FIELDS = [["url", "VICIdial address", "https://dialer.yourcompany.com"], ["user", "API user", "a VICIdial user with API access"], ["pass", "API password", ""], ["agentUrl", "Agent screen URL (optional)", "defaults to …/agc/vicidial.php"], ["monitorPhone", "Your phone login (for Listen/Whisper/Barge)", "e.g. 350a"], ["serverIp", "Dialer server IP (only if needed)", ""], ["portal", "Firewall page (filled in automatically for dialerlab)", "https://your-dialer:446/login.php"], ["proxy", "Fixed-IP proxy (only if your dialer host blocks Modo)", "http://user:pass@host:port"]];
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
  const [d, setD] = useState(null); const [v, setV] = useState({}); const [links, setLinks] = useState({}); const [phones, setPhones] = useState({}); const [msg, setMsg] = useState(""); const [test, setTest] = useState(""); const [custom, setCustom] = useState({}); const [tAgent, setTAgent] = useState("");
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
      {d.provider === "vicidial" && <ViciFix />}
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

      {d.provider === "vicidial" && d.vicidial && <PhonesSetup />}
      {d.provider === "vicidial" && d.vicidial && <Relay />}
      {d.provider === "vicidial" && <Health />}
      {d.provider === "vicidial" && d.vicidial && <EmbedSettings d={d} save={save} />}
      {d.provider === "vicidial" && d.vicidial && <WebPhone d={d} save={save} />}

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
                <button className="sm" onClick={() => save({ links: d.agents.map((a) => ({ id: a.id, user: links[a.id] || "", ...(phones[a.id]?.phone !== undefined ? { phone: phones[a.id].phone } : {}), ...(phones[a.id]?.pass ? { phonePass: phones[a.id].pass } : {}) })) }, "Agent logins saved.")}><Save size={13} /> Save logins</button></div></div>
            <p className="muted small" style={{ margin: 0 }}>Type each agent's login on the dialer ({d.provider === "vicidial" ? "their VICIdial user" : "their dialer login"}).</p>
            <div className="link-grid">{d.agents.map((a) => (
              <label key={a.id} style={a.active ? undefined : { opacity: .5 }}><span><b>{a.name}</b> <span className="muted small">{a.agentId}</span>{a.role === "ADMIN" && <span className="chip" style={{ marginLeft: 6 }}>admin</span>}</span>
                <input value={links[a.id] || ""} onChange={(e) => setLinks({ ...links, [a.id]: e.target.value })} placeholder="dialer login" />
                <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                  <input value={phones[a.id]?.phone ?? a.sipUser ?? ""} onChange={(e) => setPhones({ ...phones, [a.id]: { ...phones[a.id], phone: e.target.value } })} placeholder="phone login (optional)" style={{ minWidth: 0 }} />
                  <input type="password" value={phones[a.id]?.pass ?? ""} onChange={(e) => setPhones({ ...phones, [a.id]: { ...phones[a.id], pass: e.target.value } })} placeholder={a.sipPassSet ? "phone pass saved" : "phone pass (optional)"} style={{ minWidth: 0 }} autoComplete="off" />
                </span></label>
            ))}</div>
          </section>
          <div className="two-col">
            <section className="panel stack"><h2><ListChecks size={17} /> Call results</h2><p className="muted small" style={{ margin: 0 }}>The buttons agents tap after a call. Codes must match your dialer's statuses.</p>
              <CodeList items={d.dispositions} onChange={(x) => setD({ ...d, dispositions: x })} /><div><button className="sm" onClick={() => save({ dispositions: d.dispositions }, "Call results saved.")}><Save size={13} /> Save results</button></div></section>
            <section className="panel stack"><h2><PauseCircle size={17} /> Pause reasons</h2><p className="muted small" style={{ margin: 0 }}>Codes must match your dialer's pause codes.</p>
              <CodeList items={d.pauseCodes} onChange={(x) => setD({ ...d, pauseCodes: x })} /><div><button className="sm" onClick={() => save({ pauseCodes: d.pauseCodes }, "Pause reasons saved.")}><Save size={13} /> Save pause reasons</button></div></section>
          </div>
        </>
      )}
    </div>
  );
}
