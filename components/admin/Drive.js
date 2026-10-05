"use client";
// Modo Drive: private files and daily backups, stored only in your Google Drive or Dropbox.
import { useEffect, useRef, useState } from "react";
import { HardDrive, Folder, FileText, Upload, FolderPlus, Download, Trash2, Pencil, ChevronRight, RefreshCw, DatabaseBackup, Unplug, Copy, Check, Cloud, ExternalLink } from "lucide-react";

const api = (url, method = "GET", body) => fetch(url, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, cache: "no-store" }).then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }));
const size = (n) => (n == null ? "" : n < 1024 ? n + " B" : n < 1048576 ? (n / 1024).toFixed(0) + " KB" : n < 1073741824 ? (n / 1048576).toFixed(1) + " MB" : (n / 1073741824).toFixed(2) + " GB");
const when = (d) => (d ? new Date(d).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "");

const STEPS = {
  dropbox: [
    <>Go to <a href="https://www.dropbox.com/developers/apps/create" target="_blank" rel="noreferrer">dropbox.com/developers/apps <ExternalLink size={11} /></a> → <b>Scoped access</b> → <b>App folder</b> → name it e.g. “Modo Files” → Create.</>,
    <>Open the <b>Permissions</b> tab, tick <i>files.metadata.read</i>, <i>files.content.read</i>, <i>files.content.write</i> and <i>account_info.read</i>, then <b>Submit</b>.</>,
    <>On the <b>Settings</b> tab, under <b>Redirect URIs</b>, add the address below.</>,
    <>Copy the <b>App key</b> and <b>App secret</b> into the boxes below and press Connect.</>,
  ],
  gdrive: [
    <>Go to <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">console.cloud.google.com <ExternalLink size={11} /></a> and create a project (e.g. “Modo”).</>,
    <>In <b>APIs & Services → Library</b>, enable <b>Google Drive API</b>.</>,
    <>In <b>OAuth consent screen</b>: External, fill in the app name and your email, then <b>Publish app</b> (otherwise Google disconnects it after 7 days).</>,
    <>In <b>Credentials → Create credentials → OAuth client ID → Web application</b>, add the address below as an <b>Authorized redirect URI</b>.</>,
    <>Copy the <b>Client ID</b> and <b>Client secret</b> into the boxes below and press Connect.</>,
  ],
};

function Setup({ info, onDone }) {
  const [prov, setProv] = useState(info?.provider || "gdrive"); const [id, setId] = useState(""); const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [copied, setCopied] = useState(false);
  const redirect = typeof window !== "undefined" ? location.origin + "/api/drive/oauth" : "";
  const reconnect = info && !info.setup && info.provider === prov;
  async function connect() {
    setBusy(true); setErr("");
    const r = await api("/api/drive/setup", "POST", { provider: prov, clientId: id, clientSecret: secret });
    setBusy(false);
    if (!r.ok) return setErr(r.data.error || "Couldn't start.");
    location.href = r.data.url;
  }
  return (
    <section className="panel stack drive-setup">
      <h2><Cloud size={17} /> Connect your private storage</h2>
      <p className="muted small" style={{ margin: 0 }}>Modo Drive keeps files and daily backups <b>only in your own</b> Google Drive or Dropbox. Modo can see just its own folder, nothing else in your account.</p>
      <div className="prov-grid">
        {[["gdrive", "Google Drive", "15 GB free with any Google account"], ["dropbox", "Dropbox", "2 GB free, simplest setup"]].map(([k, l, h]) => (
          <button key={k} className={"prov" + (prov === k ? " on" : "")} onClick={() => setProv(k)}><b>{l}</b><span>{h}</span></button>))}
      </div>
      <ol className="drive-steps">{STEPS[prov].map((x, i) => <li key={i}>{x}</li>)}</ol>
      <label>Redirect address (copy this)
        <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}><input readOnly value={redirect} onFocus={(e) => e.target.select()} />
          <button className="ghost sm" onClick={() => { navigator.clipboard?.writeText(redirect); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check size={13} /> : <Copy size={13} />}</button></div></label>
      {prov === "gdrive" && (
        <label className="drive-json">Easiest: upload the JSON file Google lets you download for the client (Download JSON)
          <input type="file" accept=".json,application/json" onChange={async (e) => {
            const f = e.target.files?.[0]; if (!f) return;
            try { const j = JSON.parse(await f.text()); const c = j.web || j.installed || j; if (!c.client_id || !c.client_secret) throw 0; setId(c.client_id); setSecret(c.client_secret); setErr(""); }
            catch { setErr("That file isn't a Google OAuth client JSON. Download it from Credentials → your OAuth client → Download JSON."); }
          }} /></label>
      )}
      <div className="form">
        <label>{prov === "dropbox" ? "App key" : "Client ID"}<input value={id} onChange={(e) => setId(e.target.value)} placeholder={reconnect ? "saved (leave empty to keep)" : ""} autoComplete="off" /></label>
        <label>{prov === "dropbox" ? "App secret" : "Client secret"}<input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={reconnect ? "saved (leave empty to keep)" : ""} autoComplete="off" /></label>
      </div>
      {err && <p className="err small">{err}</p>}
      <div className="row"><button onClick={connect} disabled={busy || (!reconnect && (!id.trim() || !secret.trim()))}><Cloud size={15} /> {busy ? "Opening…" : `Connect ${prov === "dropbox" ? "Dropbox" : "Google Drive"}`}</button>
        {onDone && <button className="ghost" onClick={onDone}>Cancel</button>}</div>
    </section>
  );
}

export default function Drive() {
  const [info, setInfo] = useState(null); const [path, setPath] = useState([{ id: "", name: "Modo" }]);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(null); const [ups, setUps] = useState([]); const [drag, setDrag] = useState(false); const [setup, setSetup] = useState(false);
  const file = useRef(null);
  const folder = path[path.length - 1].id;
  const say = (ok, text) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 5000); };
  const load = async (f = folder) => { setBusy(true); const r = await api("/api/drive?folder=" + encodeURIComponent(f)); setBusy(false); setInfo(r.data); if (r.data.error) say(false, r.data.error); };
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get("connected")) say(true, "Connected! Your files now live in your own cloud.");
    if (q.get("error")) say(false, q.get("error"));
    if (q.get("connected") || q.get("error")) history.replaceState(null, "", location.pathname);
    load("");
  }, []); // eslint-disable-line
  const open = (it) => { const p = [...path, { id: it.id, name: it.name }]; setPath(p); load(it.id); };
  const goto = (i) => { const p = path.slice(0, i + 1); setPath(p); load(p[p.length - 1].id); };

  async function upload(files) {
    for (const f of [...files]) {
      const key = f.name + Date.now(); setUps((u) => [...u, { key, name: f.name, pct: 0 }]);
      const t = await api("/api/drive", "POST", { action: "upload", parent: folder, name: f.name, size: f.size, type: f.type });
      if (!t.ok) { say(false, t.data.error || "Upload failed."); setUps((u) => u.filter((x) => x.key !== key)); continue; }
      await new Promise((done) => {
        const x = new XMLHttpRequest(); x.open(t.data.method, t.data.url);
        Object.entries(t.data.headers || {}).forEach(([k, v]) => x.setRequestHeader(k, v));
        x.upload.onprogress = (e) => e.lengthComputable && setUps((u) => u.map((y) => (y.key === key ? { ...y, pct: Math.round((e.loaded / e.total) * 100) } : y)));
        x.onload = () => { if (x.status >= 300) say(false, `${f.name}: upload failed (${x.status}).`); done(); };
        x.onerror = () => { say(false, `${f.name}: upload was blocked. Try again, or upload it in ${info?.label} directly.`); done(); };
        x.send(f);
      });
      setUps((u) => u.filter((x) => x.key !== key));
    }
    load();
  }
  async function act(body, ok) { setBusy(true); const r = await api("/api/drive", "POST", body); setBusy(false); if (!r.ok) return say(false, r.data.error); if (ok) say(true, ok); load(); }
  async function backup() { setBusy(true); const r = await api("/api/drive/backup", "POST"); setBusy(false); r.ok ? say(true, `Backup saved: ${r.data.name}`) : say(false, r.data.error); load(); }
  async function disconnect() { if (!confirm(`Disconnect ${info.label}? Your files stay in ${info.label}; Modo just stops using it.`)) return; await api("/api/drive/setup", "DELETE"); setPath([{ id: "", name: "Modo" }]); load(""); }

  if (!info) return <p className="muted">Loading Drive…</p>;
  if (info.setup || setup || !info.connected) return <div className="stack">{msg && <div className={"receipt" + (msg.ok ? "" : " err")}>{msg.text}</div>}<Setup info={info} onDone={setup ? () => setSetup(false) : null} /></div>;

  const items = [...(info.items || [])].sort((a, b) => b.folder - a.folder || a.name.localeCompare(b.name));
  return (
    <div className="stack drive" onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={(e) => e.currentTarget === e.target && setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.length) upload(e.dataTransfer.files); }}>
      <section className="panel drive-head">
        <span className="drive-ico"><HardDrive size={20} /></span>
        <div style={{ flex: 1, minWidth: 0 }}><b>{info.label}</b><div className="muted small ellipsis">{info.account || "connected"} · last backup {info.lastBackupAt ? when(info.lastBackupAt) : "never"} · daily backup at 2:00 am</div></div>
        <div className="row" style={{ gap: 6 }}>
          <button className="ghost sm" onClick={backup} disabled={busy}><DatabaseBackup size={14} /> Back up now</button>
          <button className="ghost sm" onClick={() => setSetup(true)}>Reconnect</button>
          <button className="ghost sm" onClick={disconnect}><Unplug size={14} /> Disconnect</button>
        </div>
      </section>
      {msg && <div className={"receipt" + (msg.ok ? "" : " err")}>{msg.text}</div>}
      <section className={"panel stack drive-files" + (drag ? " drag" : "")}>
        <div className="row drive-bar">
          <nav className="drive-crumbs">{path.map((p, i) => <span key={p.id + i}>{i > 0 && <ChevronRight size={13} />}<button className="ghost sm" onClick={() => goto(i)} disabled={i === path.length - 1}>{p.name}</button></span>)}</nav>
          <div className="row" style={{ gap: 6, marginLeft: "auto" }}>
            <button className="ghost sm icon-btn" aria-label="Refresh" onClick={() => load()}><RefreshCw size={14} className={busy ? "spin" : ""} /></button>
            <button className="ghost sm" onClick={() => { const n = prompt("Folder name:"); if (n?.trim()) act({ action: "mkdir", parent: folder, name: n.trim() }, "Folder created."); }}><FolderPlus size={14} /> New folder</button>
            <button className="sm" onClick={() => file.current?.click()}><Upload size={14} /> Upload</button>
            <input ref={file} type="file" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
          </div>
        </div>
        {ups.map((u) => <div key={u.key} className="drive-up"><span className="ellipsis">{u.name}</span><div className="drive-prog"><i style={{ width: u.pct + "%" }} /></div><span className="small num">{u.pct}%</span></div>)}
        {!items.length ? <div className="drive-empty muted"><Upload size={22} /><span>Empty folder. Drop files here or press Upload.</span></div> : (
          <div className="drive-list">{items.map((it) => (
            <div key={it.id} className="drive-row">
              <button className="ghost drive-name" onClick={() => (it.folder ? open(it) : window.open("/api/drive/file?id=" + encodeURIComponent(it.id), "_blank"))}>
                {it.folder ? <Folder size={18} className="drive-f" /> : <FileText size={18} />}<span className="ellipsis">{it.name}</span></button>
              <span className="small muted drive-meta">{it.folder ? "Folder" : size(it.size)}</span>
              <span className="small muted drive-meta">{when(it.modified)}</span>
              <span className="row drive-acts" style={{ gap: 4 }}>
                {!it.folder && <a className="ghost sm icon-btn btn-link" href={"/api/drive/file?id=" + encodeURIComponent(it.id)} aria-label="Download"><Download size={13} /></a>}
                <button className="ghost sm icon-btn" aria-label="Rename" onClick={() => { const n = prompt("New name:", it.name); if (n?.trim() && n !== it.name) act({ action: "rename", id: it.id, name: n.trim() }, "Renamed."); }}><Pencil size={13} /></button>
                <button className="ghost sm icon-btn del" aria-label="Delete" onClick={() => confirm(`Delete “${it.name}”?${info.provider === "gdrive" ? " (It goes to your Google Drive trash.)" : ""}`) && act({ action: "delete", id: it.id }, "Deleted.")}><Trash2 size={13} /></button>
              </span>
            </div>))}</div>
        )}
      </section>
    </div>
  );
}
