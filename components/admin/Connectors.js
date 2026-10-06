"use client";
// Admin → Connectors: plug Modo into other tools.
import { useEffect, useState } from "react";
import { api } from "./api";
import { Plug, Plus, Trash2, Zap, X, Save } from "lucide-react";

const LOOKUP_PRESETS = [
  { name: "Utility company at an address", url: "https://developer.nrel.gov/api/utility_rates/v3.json?api_key={key}&address={q}", hint: "Street, city, state or ZIP", get: "Free key: developer.nrel.gov/signup" },
  { name: "Electricity rates (OpenEI)", url: "https://api.openei.org/utility_rates?version=latest&format=json&api_key={key}&address={q}&limit=3&detail=minimal", hint: "Address or ZIP", get: "Free key: openei.org/services/api/signup" },
  { name: "Phone carrier (NumVerify)", url: "http://apilayer.net/api/validate?access_key={key}&number=1{q}", hint: "10-digit phone", get: "Free key: numverify.com" },
  { name: "Phone check (Abstract)", url: "https://phonevalidation.abstractapi.com/v1/?api_key={key}&phone=1{q}", hint: "10-digit phone", get: "Free key: abstractapi.com" },
  { name: "Email verifier (Hunter)", url: "https://api.hunter.io/v2/email-verifier?email={q}&api_key={key}", hint: "email address", get: "Free key: hunter.io" },
  { name: "Email check (Abstract)", url: "https://emailvalidation.abstractapi.com/v1/?api_key={key}&email={q}", hint: "email address", get: "Free key: abstractapi.com" },
  { name: "ZIP → city/state (Zippopotam)", url: "https://api.zippopotam.us/us/{q}", hint: "5-digit ZIP", get: "No key needed — leave key blank" },
  { name: "Address autocomplete (Geoapify)", url: "https://api.geoapify.com/v1/geocode/search?text={q}&format=json&apiKey={key}", hint: "any address", get: "Free key: geoapify.com" },
  { name: "IP location", url: "https://ipapi.co/{q}/json/", hint: "an IP address", get: "No key needed — leave key blank" },
  { name: "Company by name (OpenCorporates)", url: "https://api.opencorporates.com/v0.4/companies/search?q={q}&api_token={key}", hint: "company name", get: "Free token: opencorporates.com/api_accounts/new" },
  { name: "Business EIN (US)", url: "https://api.thecompaniesapi.com/v1/companies?search={q}&token={key}", hint: "company name", get: "Free key: thecompaniesapi.com" },
  { name: "Currency rate", url: "https://api.exchangerate.host/convert?from=USD&to={q}", hint: "currency code e.g. EUR", get: "No key needed — leave key blank" },
  { name: "Bank by routing number", url: "https://www.routingnumbers.info/api/data.json?rn={q}", hint: "9-digit routing number", get: "No key needed — leave key blank" },
  { name: "Weather at a place", url: "https://api.openweathermap.org/data/2.5/weather?q={q}&appid={key}&units=imperial", hint: "city name", get: "Free key: openweathermap.org/api" },
];
const ICON = { lookup: "🔎", smtp: "✉️", slack: "💬", discord: "🎮", teams: "🟣", googlechat: "💠", mattermost: "🟦", rocketchat: "🚀", telegram: "✈️", ntfy: "🔔", pushover: "📲", twilio: "📱", whatsapp: "🟢", sms: "📨", sheets: "📊", webhook: "🔗", ai: "✨", vicidial: "☎️", turn: "🎧", tracking: "📦" };
const FIELD = { trackToken: "Live token for tracking (shippo_live_…) — used only to read UPS scans", campaigns: "Your campaign(s) — only these agents show (comma-separated, e.g. BUDGET,VERIZON)", userGroups: "Or your user group(s) (comma-separated) — leave blank to use campaigns", agentUrl: "Agent screen URL (optional, default …/agc/vicidial.php)", dispositions: "Dispositions for the Modo dialer, e.g. SALE:Sale, NI:Not interested, CALLBK:Callback, NA:No answer, DNC:Do not call", pauseCodes: "Pause codes, e.g. BREAK:Break, LUNCH:Lunch, TRAIN:Training", monitorPhone: "Your phone login for listening (e.g. 350a)", serverIp: "Dialer server IP (only if listening says it needs it)", proxy: "Proxy for the dialer (optional) — if your host firewalls Modo, put a fixed-IP proxy here (http://user:pass@host:port) and whitelist that IP with your dialer host", header: "Key header name (optional, e.g. x-api-key)", hint: "What to type (shown to agents)", host: "SMTP host", port: "Port (465 or 587)", fromName: "From name", fromEmail: "From email", url: "URL", secret: "Secret (optional, sent as x-modo-secret header)", apiKey: "API key", provider: "Provider", model: "Model (optional)", baseUrl: "Base URL (only for Ollama / custom / OpenAI-compatible — leave blank for the rest)", user: "Username", pass: "Password", token: "Token", chatId: "Chat ID", userKey: "User key", sid: "Account SID", from: "From number (e.g. +1…)", to: "To number (e.g. +1…)", phoneId: "Phone-number ID", template: "Template name (optional, default hello_world)", verifyToken: "Webhook verify token (make one up; paste the same in Meta)", portal: "Firewall page (optional, e.g. https://your-dialer:446/login.php — automatic for dialerlab)", clientId: "App key / client ID", clientSecret: "App secret / client secret", toName: "Return to: name", toCompany: "Return to: company (optional)", toStreet: "Return to: street", toStreet2: "Return to: apt / suite (optional)", toCity: "Return to: city", toState: "Return to: state (2 letters, e.g. TX)", toZip: "Return to: ZIP", toPhone: "Return to: phone", toEmail: "Return to: email (optional)", carrierPref: "Carrier", weightLb: "Package weight in lb (default 1)", boxSize: "Box size in inches L x W x H (default 10x7x4)", maxPrice: "Max price per label in $ (default 25)", auto: "Make a label automatically when a sale is marked Active", emailCustomer: "Email the label to the customer" };

export default function Connectors() {
  const [data, setData] = useState(null); const [adding, setAdding] = useState(null); const [editing, setEditing] = useState(null); const [msg, setMsg] = useState({});
  const load = () => api("/api/connectors").then(({ ok, data }) => ok && setData(data));
  useEffect(() => { load(); }, []);
  if (!data) return <p className="muted">Loading connectors…</p>;

  const test = async (c) => { setMsg((m) => ({ ...m, [c.id]: "Testing…" })); const r = await api(`/api/connectors/${c.id}`, "POST"); setMsg((m) => ({ ...m, [c.id]: r.data.status || r.data.error })); load(); };
  const toggle = async (c) => { await api(`/api/connectors/${c.id}`, "PATCH", { enabled: !c.enabled }); load(); };
  const remove = async (c) => { if (confirm(`Remove ${c.name}?`)) { await api(`/api/connectors/${c.id}`, "DELETE"); load(); } };

  return (
    <div className="stack">
      <section className="panel stack">
        <div className="row" style={{ justifyContent: "space-between" }}><h2>Add a connector</h2></div>
        <p className="muted small" style={{ margin: 0 }}>Send CRM events to Slack, Discord, Google Sheets, Zapier or Make, or set up your AI key, VICIdial and call relay here instead of the .env file.</p>
        {(() => {
          const entries = Object.entries(data.types);
          const groups = [...new Set(entries.map(([, t]) => t.group || "Other"))];
          const tile = (k, t) => (
            <button key={k} className="conn-tile" onClick={() => setAdding({ type: k, name: k === "ai" ? "Groq" : t.label, config: k === "ai" ? { provider: "groq", model: "openai/gpt-oss-120b" } : {}, events: t.events ? Object.keys(data.events) : [] })}>
              <span className="conn-ico">{ICON[k]}</span><b>{t.label}</b><span className="muted small">{t.hint}</span><span className="conn-add"><Plus size={14} /> Add</span>
            </button>
          );
          return groups.map((g) => (
            <div key={g} className="stack" style={{ gap: 8 }}>
              <span className="sf-l" style={{ opacity: 0.7 }}>{g}</span>
              <div className="conn-grid">{entries.filter(([, t]) => (t.group || "Other") === g).map(([k, t]) => tile(k, t))}</div>
            </div>
          ));
        })()}
      </section>

      {adding && <Editor title={`Add ${data.types[adding.type].label}`} value={adding} types={data.types} events={data.events} onClose={() => setAdding(null)}
        onSave={async (v) => { const r = await api("/api/connectors", "POST", v); if (!r.ok) return r.data.error; setAdding(null); load(); }} />}
      {editing && <Editor title={`Edit ${editing.name}`} value={editing} types={data.types} events={data.events} onClose={() => setEditing(null)}
        onSave={async (v) => { const r = await api(`/api/connectors/${editing.id}`, "PATCH", v); if (!r.ok) return r.data.error; setEditing(null); load(); }} />}

      <section className="panel stack">
        <h2>Connected ({data.connectors.length})</h2>
        {!data.connectors.length && <p className="muted">Nothing connected yet. Pick one above.</p>}
        {data.connectors.map((c) => (
          <div key={c.id} className="conn-row">
            <span className="conn-ico">{ICON[c.type]}</span>
            <div style={{ minWidth: 0 }}>
              <b>{c.name}</b> <span className={"chip " + (c.enabled ? "ok" : "")}>{c.enabled ? "on" : "off"}</span>
              <div className="muted small ellipsis">{data.types[c.type]?.label}{c.events.length ? " · " + c.events.map((e) => data.events[e]).join(", ") : ""}</div>
              {(msg[c.id] || c.lastStatus) && <div className="small ellipsis" style={{ color: /OK|Saved/.test(msg[c.id] || c.lastStatus) ? "var(--green)" : "var(--amber)" }}>{msg[c.id] || c.lastStatus}{!msg[c.id] && c.lastAt ? " · " + new Date(c.lastAt).toLocaleString() : ""}</div>}
            </div>
            <div className="row" style={{ marginLeft: "auto", flexWrap: "nowrap" }}>
              <button className="ghost sm" onClick={() => test(c)}><Zap size={13} /> Test</button>
              <button className="ghost sm" onClick={() => setEditing({ ...c })}>Edit</button>
              <button className="ghost sm" onClick={() => toggle(c)}>{c.enabled ? "Turn off" : "Turn on"}</button>
              <button className="ghost sm" aria-label="Remove" onClick={() => remove(c)}><Trash2 size={13} /></button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function Editor({ title, value, types, events, onClose, onSave }) {
  const [v, setV] = useState(value); const [err, setErr] = useState("");
  const t = types[v.type];
  const setCfg = (k, x) => setV({ ...v, config: { ...v.config, [k]: x } });
  const toggleEv = (e) => setV({ ...v, events: v.events.includes(e) ? v.events.filter((x) => x !== e) : [...v.events, e] });
  return (
    <section className="panel stack" style={{ borderColor: "var(--accent)" }}>
      <div className="row" style={{ justifyContent: "space-between" }}><h2><Plug size={17} /> {title}</h2><button className="ghost icon-btn" aria-label="Close" onClick={onClose}><X size={16} /></button></div>
      <p className="muted small" style={{ margin: 0 }}>{t.hint}</p>
      <div className="form">
        <label>Name<input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></label>
        {t.fields.map((f) => f === "secure"
          ? <label key={f}>Security<select value={v.config.secure ?? "true"} onChange={(e) => setCfg("secure", e.target.value)}><option value="true">SSL/TLS (port 465)</option><option value="false">STARTTLS (port 587)</option></select></label>
          : f === "auto" || f === "emailCustomer"
          ? <label key={f}>{FIELD[f]}<select value={v.config[f] ?? (f === "auto" ? "no" : "yes")} onChange={(e) => setCfg(f, e.target.value)}><option value="yes">Yes</option><option value="no">No</option></select></label>
          : f === "carrierPref"
          ? <label key={f}>{FIELD[f]}<select value={v.config[f] || "UPS"} onChange={(e) => setCfg(f, e.target.value)}><option value="UPS">UPS (cheapest UPS rate)</option><option value="USPS">USPS (cheapest USPS rate)</option><option value="cheapest">Cheapest of any carrier</option></select></label>
          : f === "provider"
          ? <label key={f}>{FIELD[f]}<select value={v.config.provider || "groq"} onChange={(e) => setCfg("provider", e.target.value)}>
              <option value="groq">Groq (free tier, fastest)</option>
              <option value="gemini">Google Gemini (free tier)</option>
              <option value="openai">OpenAI (GPT-4o / GPT-4o-mini)</option>
              <option value="anthropic">Anthropic Claude</option>
              <option value="openrouter">OpenRouter (any model, one key)</option>
              <option value="deepseek">DeepSeek (very cheap)</option>
              <option value="mistral">Mistral</option>
              <option value="xai">xAI · Grok</option>
              <option value="together">Together AI</option>
              <option value="ollama">Ollama (runs on your PC, no key)</option>
              <option value="custom">Custom (any OpenAI-compatible URL)</option>
            </select></label>
          : <label key={f}>{FIELD[f]}<input type={["pass", "apiKey", "secret", "trackToken", "clientSecret"].includes(f) ? "password" : "text"} value={v.config[f] || ""} placeholder={String(v.config[f] || "").startsWith("••••") ? "Leave as is to keep" : ""} onChange={(e) => setCfg(f, e.target.value)} autoComplete="off" /></label>)}
      </div>
      {v.type === "ai" && (
        <p className="muted small" style={{ margin: 0 }}>{(() => { const p = v.config.provider || "groq"; return (
          p === "groq" ? <>Free key at <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer">console.groq.com/keys</a> (<code>gsk_</code>). Model: <code>openai/gpt-oss-120b</code> (smartest) or <code>openai/gpt-oss-20b</code> (fastest). If a model is retired, <b>Test</b> auto-switches.</>
          : p === "gemini" ? <>Free key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a>. Model: <code>gemini-2.5-flash</code>.</>
          : p === "openai" ? <>Key at <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">platform.openai.com</a>. Model: <code>gpt-4o-mini</code> (cheap) or <code>gpt-4o</code>.</>
          : p === "anthropic" ? <>Key at console.anthropic.com. Use a model name from your account, e.g. <code>claude-sonnet-4-5</code>.</>
          : p === "openrouter" ? <>Key at <a href="https://openrouter.ai/keys" target="_blank" rel="noreferrer">openrouter.ai/keys</a>. Any model, e.g. <code>openai/gpt-4o-mini</code>, <code>anthropic/claude-3.5-sonnet</code>.</>
          : p === "deepseek" ? <>Key at <a href="https://platform.deepseek.com" target="_blank" rel="noreferrer">platform.deepseek.com</a>. Model: <code>deepseek-chat</code>.</>
          : p === "mistral" ? <>Key at <a href="https://console.mistral.ai" target="_blank" rel="noreferrer">console.mistral.ai</a>. Model: <code>mistral-small-latest</code>.</>
          : p === "xai" ? <>Key at <a href="https://console.x.ai" target="_blank" rel="noreferrer">console.x.ai</a>. Model: <code>grok-2-latest</code>.</>
          : p === "together" ? <>Key at <a href="https://api.together.ai" target="_blank" rel="noreferrer">api.together.ai</a>. Pick any model from their list.</>
          : p === "ollama" ? <>Runs on your own PC — no key needed. Install <a href="https://ollama.com" target="_blank" rel="noreferrer">ollama.com</a>, run <code>ollama pull llama3.1</code>, set Base URL to <code>http://localhost:11434/v1</code> and Model to <code>llama3.1</code>.</>
          : <>Custom: paste any OpenAI-compatible <b>Base URL</b> (ending in <code>/v1</code>), the key if it needs one, and the model name.</>
        ); })()}
          {" "}Press <b>Test</b> after saving. Only one AI connector is used: the newest one that's turned on.</p>
      )}
      {v.type === "lookup" && (
        <div className="stack" style={{ gap: 6 }}>
          <span className="sf-l">Quick presets (free keys)</span>
          <div className="row" style={{ gap: 6 }}>{LOOKUP_PRESETS.map((p) => (
            <button key={p.name} type="button" className="ghost sm" title={p.get} onClick={() => setV({ ...v, name: p.name, config: { ...v.config, url: p.url, header: p.header || "", hint: p.hint } })}>{p.name}</button>
          ))}</div>
          <span className="small muted">Pick one, paste your key from the site shown when you hover, then Save.</span>
        </div>
      )}
      {v.type === "lookup" && <p className="muted small" style={{ margin: 0 }}>Example (NumVerify phone carrier): <code>{"http://apilayer.net/api/validate?access_key={key}&number={q}&country_code=US"}</code>. If the API wants the key in a header instead, leave <code>{"{key}"}</code> out of the URL and fill "Key header name".</p>}
      {t.events && (
        <div className="stack" style={{ gap: 6 }}>
          <b className="small">Send these events</b>
          <div className="row">{Object.entries(events).map(([k, l]) => <label key={k} className="row" style={{ color: "var(--foreground)", fontWeight: 500 }}><input type="checkbox" style={{ width: "auto" }} checked={v.events.includes(k)} onChange={() => toggleEv(k)} />{l}</label>)}</div>
        </div>
      )}
      {err && <div className="err">{err}</div>}
      <div className="row"><button onClick={async () => { setErr(""); const e = await onSave(v); if (e) setErr(e); }}><Save size={15} /> Save</button><button className="ghost" onClick={onClose}>Cancel</button></div>
    </section>
  );
}
