"use client";
// Modo WhatsApp: link a normal WhatsApp number by scanning a QR (like WhatsApp Web) — no Meta, no API key.
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import Link from "next/link";
import WaCommands from "@/components/WaCommands";
import WaLockGate, { WaLockBar } from "@/components/WaLockGate";
import { Smartphone, CheckCircle2, RefreshCw, LogOut, AlertTriangle, KeyRound, Save, Copy, Inbox } from "lucide-react";

const api = (url, method = "GET", body) => fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" }).then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }));
const LABEL = { installing: "Installing on the relay…", open: "Connected", qr: "Waiting for you to scan", reconnecting: "Reconnecting…", starting: "Starting…", logged_out: "Not linked", not_set_up: "Not linked", error: "Problem" };

export default function WhatsAppSetupPage() { return <WaLockGate><WhatsAppPage /></WaLockGate>; }

function WhatsAppPage() {
  const [d, setD] = useState(null);
  const [img, setImg] = useState("");
  const [admins, setAdmins] = useState(""); const [saved, setSaved] = useState("");
  const [num, setNum] = useState(""); const [pairMsg, setPairMsg] = useState(""); const [busy, setBusy] = useState(false); const [copied, setCopied] = useState(false);
  const [diag, setDiag] = useState(null); const [diagBusy, setDiagBusy] = useState(false);
  const check = async () => { setDiagBusy(true); const r = await api("/api/wa-link", "POST", { action: "diagnose" }); setDiagBusy(false); setDiag(r.ok ? r.data.relay : { error: r.data.error }); };
  const restart = async (fresh) => { if (fresh && !confirm("Start a fresh link? Any half-finished link is cleared and a new QR is made.")) return; setDiagBusy(true); const r = await api("/api/wa-link", "POST", { action: "restart", fresh }); setDiagBusy(false); setDiag(r.ok ? { note: "Restarting… a QR should appear within a minute." } : { error: r.data.error }); load(); };
  const loaded = useRef(false);

  const load = async () => {
    const r = await api("/api/wa-link"); if (!r.ok) return;
    setD(r.data);
    if (!loaded.current) { loaded.current = true; setAdmins(r.data.settings?.admins || ""); }
  };
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, []);
  useEffect(() => { const q = d?.status?.qr; if (!q) { setImg(""); return; } QRCode.toDataURL(q, { margin: 1, width: 280 }).then(setImg).catch(() => setImg("")); }, [d?.status?.qr]);

  if (!d) return <p className="muted">Loading…</p>;
  const st = d.status || {}; const state = st.state || "not_set_up"; const relay = d.relay;
  const saveSettings = async () => { const r = await api("/api/wa-link", "POST", { action: "settings", admins }); setSaved(r.ok ? "Saved" : r.data.error || "Couldn't save"); if (r.ok) setAdmins(r.data.settings.admins); setTimeout(() => setSaved(""), 2500); };
  const pair = async () => { setBusy(true); setPairMsg(""); const r = await api("/api/wa-link", "POST", { action: "pair", number: num }); setBusy(false); setPairMsg(r.ok ? (r.data.code ? "" : "Getting your code… it appears here in a few seconds.") : r.data.error); load(); };
  const logout = async () => { if (!confirm("Unlink this WhatsApp number from Modo? Bots, alerts and customer chats on WhatsApp stop until you link again.")) return; await api("/api/wa-link", "POST", { action: "logout" }); load(); };

  return (
    <div className="stack">
      <section className="panel stack">
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <h2 className="row" style={{ gap: 8 }}><Smartphone size={18} /> WhatsApp</h2>
          <WaLockBar />
          <span className={"chip " + (state === "open" ? "ok" : state === "qr" ? "" : "late")}>{LABEL[state] || state}{state === "open" && st.me ? " · +" + st.me : ""}</span>
        </div>
        <p className="muted small" style={{ margin: 0 }}>Link a normal WhatsApp number to Modo the same way as WhatsApp Web — no Meta account and no API key. Then the bots send you alerts, you can text Modo commands from your phone, and customer WhatsApp chats show up in Chat.</p>
        <div className="tr-warn small"><AlertTriangle size={14} /><span>Use a <b>separate business number</b> (a spare SIM), not your personal WhatsApp. This works like WhatsApp Web but isn't an official WhatsApp product, so WhatsApp can ban numbers used for bots or bulk messages. Never mass-message people who didn't ask to hear from you.</span></div>
      </section>

      {!relay ? (
        <section className="panel stack"><b>First, set up the Modo Cloud Relay</b><p className="muted small" style={{ margin: 0 }}>WhatsApp runs on the same free relay as your dialer. Save your VICIdial connection in <a href="/admin/dialer">Dialer setup</a> first, then deploy the relay there.</p></section>
      ) : !relay.online ? (
        <section className="panel stack">
          <b>Step 1 · Turn on the free cloud relay</b>
          <ol className="drive-steps">
            <li>Copy your relay key: <code className="relay-key">{relay.key ? relay.key.slice(0, 10) + "…" : "…"}</code> <button className="ghost sm" onClick={() => { navigator.clipboard?.writeText(relay.key || ""); setCopied(true); setTimeout(() => setCopied(false), 1500); }}><Copy size={13} /> {copied ? "Copied" : "Copy key"}</button></li>
            <li>Tap <a className="btn-link" href="https://render.com/deploy?repo=https://github.com/balajsajjad7-bot/modo-crm" target="_blank" rel="noreferrer">Deploy free relay on Render</a>, sign in with GitHub, paste the key as <b>RELAY_KEY</b> and press <b>Deploy Blueprint</b> (Free plan).</li>
            <li>Already have the relay? It updates by itself from GitHub; if it doesn't, open it on render.com → <b>Manual Deploy</b> → <b>Deploy latest commit</b> (Build Command must be <code>npm install --omit=dev</code>).</li>
            <li>Wait 2–3 minutes. A QR code appears here.</li>
          </ol>
          <button className="ghost sm" style={{ justifySelf: "start" }} onClick={() => api("/api/wa-link", "POST", { action: "refresh" }).then(load)}><RefreshCw size={13} /> Check again</button>
        </section>
      ) : state === "open" ? (
        <section className="panel stack">
          <b className="row" style={{ gap: 8 }}><CheckCircle2 size={18} style={{ color: "var(--green)" }} /> Linked to +{st.me}</b>
          <p className="muted small" style={{ margin: 0 }}>Keep this phone charged and connected to the internet now and then (like WhatsApp Web). If WhatsApp is ever unlinked on the phone, a new QR appears here.</p>
          <button className="ghost sm" style={{ justifySelf: "start" }} onClick={logout}><LogOut size={13} /> Unlink this number</button>
        </section>
      ) : (
        <section className="panel stack">
          <b>Step 2 · Link your WhatsApp number</b>
          <div className="wa-link">
            <div className="wa-qr">{img ? <img src={img} alt="WhatsApp QR code" width={280} height={280} /> : <div className="wa-qr-wait"><RefreshCw size={22} className="spin" /><span className="small muted">{state === "reconnecting" || state === "starting" ? "Connecting to WhatsApp…" : "Waiting for a QR code from the relay…"}</span></div>}</div>
            <ol className="drive-steps">
              <li>On the business phone open <b>WhatsApp</b> → <b>Settings</b> (or ⋮) → <b>Linked devices</b> → <b>Link a device</b>.</li>
              <li>Point the phone at this QR code. It refreshes every ~20 seconds.</li>
              <li>Opening Modo on that same phone? Use a <b>pairing code</b> instead: on the phone choose <b>Link with phone number instead</b> and type the code below.</li>
            </ol>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <input value={num} onChange={(e) => setNum(e.target.value)} placeholder="Business WhatsApp number, e.g. 923001234567" style={{ flex: "1 1 220px" }} inputMode="tel" />
            <button className="ghost" onClick={pair} disabled={busy || !num.trim()}><KeyRound size={14} /> {busy ? "Asking…" : "Get pairing code"}</button>
          </div>
          {st.pairCode && <div className="wa-code">Pairing code: <b>{st.pairCode}</b></div>}
          {pairMsg && <p className="small muted" style={{ margin: 0 }}>{pairMsg}</p>}
          {st.error && <div className="err small">{st.error}</div>}
          <div className="wa-diag">
            <span className="small muted">Relay says: <b>{LABEL[state] || state}</b>{st.at ? " · last update " + new Date(st.at).toLocaleTimeString() : " · no update from the relay yet"}</span>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              <button className="ghost sm" onClick={check} disabled={diagBusy}><RefreshCw size={13} /> Check relay</button>
              <button className="ghost sm" onClick={() => restart(false)} disabled={diagBusy}>Restart WhatsApp</button>
              <button className="ghost sm" onClick={() => restart(true)} disabled={diagBusy}>Start fresh link</button>
            </div>
            {diag && <pre className="wa-diag-out">{diag.error ? "⚠️ " + diag.error : diag.note ? diag.note : `State: ${diag.state}${diag.error ? "\nProblem: " + diag.error : ""}\nQR ready: ${diag.qr ? "yes" : "no"} · retries: ${diag.fails ?? 0}\nWhatsApp library: ${diag.loaded ? "loaded" : "not loaded yet"} (${diag.wa || "?"}) · Node ${diag.node || "?"}`}</pre>}
          </div>
        </section>
      )}

      <section className="panel stack">
        <b>Settings</b>
        <label>Admin WhatsApp numbers (they can text Modo commands and get bot alerts)
          <input value={admins} onChange={(e) => setAdmins(e.target.value)} placeholder="With country code, comma-separated, e.g. 923001234567, 923331112233" inputMode="tel" />
        </label>
        <div className="row" style={{ gap: 8 }}><button onClick={saveSettings}><Save size={14} /> Save</button>{saved && <span className="small muted">{saved}</span>}</div>
        <p className="muted small" style={{ margin: 0 }}>What Modo may say to customers (and whether it asks you first) is set in <Link href="/admin/whatsapp/inbox">WhatsApp inbox → What Modo says</Link>. By default Modo asks you before every reply and never sends links.</p>
      </section>
      <section className="panel row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <span><b>Your whole WhatsApp in Modo</b><br /><small className="muted">Every chat and group on the linked number — read and reply from here, OK Modo's suggested replies.</small></span>
        <Link className="btn-link" href="/admin/whatsapp/inbox"><Inbox size={14} /> Open WhatsApp inbox</Link>
      </section>
      <WaCommands />
    </div>
  );
}
