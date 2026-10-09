"use client";
// Sign in: ID + password, then (if turned on) a 6-digit code from an authenticator app.
import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { ShieldCheck, KeyRound } from "lucide-react";
import AppearanceToggle from "@/components/Appearance";
import UsClocks from "@/components/UsClocks";
import LoginAura from "@/components/LoginAura";
import ModoLogo from "@/components/ModoLogo";

export default function Login() {
  const [agentId, setId] = useState(""); const [password, setPw] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("creds"); const [ticket, setTicket] = useState(""); const [code, setCode] = useState(""); const [enroll, setEnroll] = useState(null);
  const [lock, setLock] = useState(null); const codeRef = useRef(null);
  // Company workspace (their own Modo). Empty = the main Modo. Comes from ?w= in the sign-in link, then remembered.
  const [ws, setWs] = useState(""); const [wsOpen, setWsOpen] = useState(false);
  useEffect(() => { let w = ""; try { w = new URLSearchParams(location.search).get("w") || localStorage.getItem("modo-ws") || ""; } catch {} w = w.toLowerCase().replace(/[^a-z0-9]/g, ""); if (w) { setWs(w); setWsOpen(true); } }, []);
  useEffect(() => { fetch("/api/status").then((r) => r.json()).then((d) => d.lockdown && setLock(d.message || "Modo is paused by admin.")).catch(() => {}); }, []);
  useEffect(() => { if (step !== "creds") setTimeout(() => codeRef.current?.focus(), 50); }, [step]);
  const go = (role) => { location.href = role === "ADMIN" ? "/admin" : "/agent"; };

  async function post(url, body) {
    setBusy(true); setErr("");
    try {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({ error: `Server error (${r.status}). Check the terminal running npm run dev.` }));
      setBusy(false);
      if (!r.ok) { setErr(d.error); return null; }
      return d;
    } catch { setBusy(false); setErr("Can't reach the server. Is it running?"); return null; }
  }
  async function signIn(e) {
    e.preventDefault();
    const w = ws.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    const d = await post("/api/auth/login", { agentId, password, ...(w ? { workspace: w } : {}) }); if (!d) return;
    try { if (w) localStorage.setItem("modo-ws", w); else localStorage.removeItem("modo-ws"); } catch {}
    if (d.step === "otp") { setTicket(d.ticket); setStep("otp"); return; }
    if (d.step === "enroll") { setTicket(d.ticket); setEnroll({ secret: d.secret, svg: await QRCode.toString(d.uri, { type: "svg", margin: 1, color: { dark: "#07080a", light: "#ffffff" } }) }); setStep("enroll"); return; }
    go(d.role);
  }
  async function verify(e) {
    e.preventDefault();
    const d = await post("/api/auth/otp", { ticket, code }); if (!d) { setCode(""); return; }
    go(d.role);
  }

  return (
    <main className="login">
      <LoginAura />
      <div className="corner-toggle"><AppearanceToggle /></div>
      <div className="panel login-card">
        <div className="ova-hero">
          <h1 className="sr-only">Modo</h1>
          <ModoLogo size={76} stack />
        </div>
        {lock && <div className="err small">{lock} Only admins can sign in right now.</div>}
        {step === "creds" && (
          <form className="stack" onSubmit={signIn}>
            <h2 className="ova-welcome">Welcome back</h2>
            <p className="muted small" style={{ margin: 0 }}>Signing in starts your shift. Your time is recorded from this moment.</p>
            {wsOpen ? (
              <label>Company workspace<span className="login-ws"><input value={ws} onChange={(e) => setWs(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))} placeholder="e.g. acmecalls" autoCapitalize="off" autoCorrect="off" spellCheck={false} /><button type="button" className="ghost sm" onClick={() => { setWs(""); setWsOpen(false); }}>Clear</button></span></label>
            ) : (
              <button type="button" className="ghost sm login-ws-link" onClick={() => setWsOpen(true)}>Signing in to your company's workspace?</button>
            )}
            <label>{ws ? "ID" : "Agent ID"}<input value={agentId} onChange={(e) => setId(e.target.value.toUpperCase())} autoComplete="username" required /></label>
            <label>Password<input type="password" value={password} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required /></label>
            {err && <div className="err">{err}</div>}
            <button disabled={busy}><KeyRound size={15} /> {busy ? "Signing in…" : "Sign in"}</button>
            <a href="/" className="login-plans">← Back to Modo home · <b>See plans & pricing</b></a>
          </form>
        )}
        {step === "otp" && (
          <form className="stack" onSubmit={verify}>
            <h1 style={{ fontSize: 22 }}><ShieldCheck size={20} /> Enter your code</h1>
            <p className="muted small" style={{ margin: 0 }}>Open your authenticator app and type the 6-digit code for Modo.</p>
            <input ref={codeRef} className="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="000000" aria-label="6-digit code" />
            {err && <div className="err">{err}</div>}
            <button disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Verify and sign in"}</button>
            <button type="button" className="ghost" onClick={() => { setStep("creds"); setCode(""); setErr(""); }}>Back</button>
          </form>
        )}
        {step === "enroll" && enroll && (
          <form className="stack" onSubmit={verify}>
            <h1 style={{ fontSize: 22 }}><ShieldCheck size={20} /> Set up 2-step sign-in</h1>
            <p className="muted small" style={{ margin: 0 }}>Admin requires a code every time you sign in. Install <b>Google Authenticator</b> or <b>Microsoft Authenticator</b> on your phone, tap +, and scan this:</p>
            <div className="qr" style={{ width: 200, margin: "0 auto", padding: 10 }} dangerouslySetInnerHTML={{ __html: enroll.svg }} aria-label="Setup QR code" />
            <p className="small muted" style={{ margin: 0, textAlign: "center" }}>Can't scan? Enter this key: <code style={{ userSelect: "all" }}>{enroll.secret.match(/.{1,4}/g).join(" ")}</code></p>
            <input ref={codeRef} className="otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="000000" aria-label="6-digit code from the app" />
            {err && <div className="err">{err}</div>}
            <button disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Confirm and sign in"}</button>
          </form>
        )}
      </div>
      <UsClocks />
    </main>
  );
}
