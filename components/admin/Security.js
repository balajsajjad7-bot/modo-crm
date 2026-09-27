"use client";
// Settings → Security: 2-step sign-in policy and the emergency stop.
import { useEffect, useState } from "react";
import { api } from "./api";
import { ShieldCheck, Power, Lock } from "lucide-react";

export default function Security() {
  const [s, setS] = useState(null); const [msg, setMsg] = useState("");
  useEffect(() => { api("/api/settings").then((r) => r.ok && setS(r.data)); }, []);
  if (!s) return null;
  const save = async (patch, ok) => { const r = await api("/api/settings", "PATCH", patch); if (r.ok) { setS({ ...s, ...patch }); setMsg(ok); } else setMsg(r.data.error); };
  return (
    <section className="panel stack">
      <h2><Lock size={17} /> Security</h2>
      <div className="action-list">
        <div><div><b className="row" style={{ gap: 6 }}><ShieldCheck size={15} /> 2-step sign-in (one-time code)</b>
          <div className="muted small">After the password, people type a 6-digit code from Google or Microsoft Authenticator. The first time, they scan a QR code on the sign-in screen.</div></div>
          <select value={s.require2fa} onChange={(e) => save({ require2fa: e.target.value }, "2-step sign-in updated.")} style={{ maxWidth: 220 }}>
            <option value="none">Off</option><option value="admins">Admins only</option><option value="everyone">Everyone (admins + agents)</option></select></div>
        <div><div><b className="row" style={{ gap: 6 }}><Power size={15} /> Emergency stop</b>
          <div className="muted small">{s.lockdown ? "ON: agents are locked out right now. Only admins can use the CRM." : "Locks every agent out instantly (and ends calls). Admins keep full access. Also in your user menu at the top right."}</div></div>
          {s.lockdown ? <button onClick={() => confirm("Turn the CRM back on for everyone?") && save({ lockdown: false }, "CRM is back on.")}>Turn CRM back on</button>
            : <button className="danger" onClick={() => { const m = prompt("Message agents will see:", "CRM Modo is paused by admin."); if (m !== null) save({ lockdown: true, lockdownMsg: m }, "Emergency stop is ON."); }}><Power size={15} /> Stop the CRM</button>}</div>
        <div><div><b className="row" style={{ gap: 6 }}>🎧 Tell agents when you listen</b>
          <div className="muted small">When on, an agent sees "Supervisor listening" while you listen to their call. When off, listening is silent (like VICIdial's monitor). Agents always see a notice that calls may be monitored.</div></div>
          <button role="switch" aria-checked={!!s.monitorNotice} className={"toggle" + (s.monitorNotice ? " on" : "")} onClick={() => save({ monitorNotice: !s.monitorNotice }, "Saved.")}><span /></button></div>
        <div><div><b>Encryption</b><div className="muted small">Traffic is HTTPS/TLS, the database connection is TLS, and Neon encrypts stored data (AES-256). Passwords are one-way hashed (bcrypt). SMTP passwords, API keys and 2-step keys are also encrypted inside the database (AES-256-GCM).</div></div><span className="chip ok">on</span></div>
      </div>
      {msg && <div className="receipt">{msg}</div>}
    </section>
  );
}
