"use client";
// The WhatsApp password screen. Wraps every WhatsApp page (inbox, setup, WhatsApp chats in Chat).
// First time: set the password. After that: unlock for 30 minutes. Forgot it: reset with your Modo login password.
import { useCallback, useEffect, useState } from "react";
import { Lock, LockOpen, ShieldCheck, Eye, EyeOff, KeyRound } from "lucide-react";

const post = (b) => fetch("/api/wa-lock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) })).catch(() => ({ ok: false, d: { error: "Network problem" } }));
const score = (pw) => { let n = 0; if (pw.length >= 8) n++; if (pw.length >= 12) n++; if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) n++; if (/\d/.test(pw)) n++; if (/[^A-Za-z0-9]/.test(pw)) n++; return Math.min(4, n); };
const LABEL = ["Too weak", "Weak", "OK", "Strong", "Very strong"];

export function useWaLock() {
  const [st, setSt] = useState(null);
  const load = useCallback(() => fetch("/api/wa-lock", { cache: "no-store" }).then((r) => r.json()).then(setSt).catch(() => setSt({ error: true })), []);
  useEffect(() => { load(); }, [load]);
  // Re-lock on screen when the 30-minute pass runs out.
  useEffect(() => { if (!st?.unlocked || !st.until) return; const t = setTimeout(load, Math.max(1000, st.until - Date.now() + 500)); return () => clearTimeout(t); }, [st, load]);
  return [st, load];
}

function Pw({ value, onChange, placeholder, auto }) {
  const [show, setShow] = useState(false);
  return (
    <span className="wl-pw">
      <input type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete={auto || "current-password"} maxLength={200} />
      <button type="button" data-plain className="wl-eye" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"}>{show ? <EyeOff size={15} /> : <Eye size={15} />}</button>
    </span>
  );
}

export default function WaLockGate({ children, compact = false }) {
  const [st, load] = useWaLock();
  const [pw, setPw] = useState(""); const [pw2, setPw2] = useState(""); const [login, setLogin] = useState("");
  const [mode, setMode] = useState("unlock"); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  if (!st) return <p className="muted small">Checking WhatsApp lock…</p>;
  if (st.unlocked) return children;
  if (st.error) return <div className="err small">Only an admin can open WhatsApp.</div>;

  const setting = !st.set || mode === "reset";
  const go = async (e) => {
    e?.preventDefault(); setErr("");
    if (setting && pw !== pw2) return setErr("The two passwords don't match.");
    setBusy(true);
    const r = await post(!st.set ? { action: "set", password: pw } : mode === "reset" ? { action: "reset", loginPassword: login, password: pw } : { action: "unlock", password: pw });
    setBusy(false); setPw(""); setPw2(""); setLogin("");
    if (!r.ok) return setErr(r.d.error || "Didn't work.");
    setMode("unlock"); load();
  };
  const s = score(pw);
  return (
    <form className={"wl" + (compact ? " compact" : "")} onSubmit={go}>
      <div className="wl-ic">{setting ? <ShieldCheck size={compact ? 22 : 30} /> : <Lock size={compact ? 22 : 30} />}</div>
      <h2>{!st.set ? "Protect WhatsApp with a password" : mode === "reset" ? "Reset your WhatsApp password" : "WhatsApp is locked"}</h2>
      <p className="muted small">{!st.set ? "Set a password only you know. Modo asks for it before showing any WhatsApp chat, and again every 30 minutes. It's stored only as a one-way scrypt hash — nobody can read it, not even from the database."
        : mode === "reset" ? "Prove it's you with your Modo login password, then choose a new WhatsApp password." : "Enter your WhatsApp password to open chats for 30 minutes."}</p>
      {st.blockedFor > 0 && <div className="err small">Too many wrong tries — locked for {Math.ceil(st.blockedFor / 60)} more minute(s).</div>}
      {mode === "reset" && <Pw value={login} onChange={setLogin} placeholder="Your Modo login password" />}
      <Pw value={pw} onChange={setPw} placeholder={setting ? "New WhatsApp password" : "WhatsApp password"} auto={setting ? "new-password" : "current-password"} />
      {setting && (
        <>
          <span className="wl-meter" aria-label={"Strength: " + LABEL[s]}><i style={{ width: (s / 4) * 100 + "%", background: ["#ef4444", "#f97316", "#eab308", "#22c55e", "#10b981"][s] }} /></span>
          <small className="muted">{pw ? LABEL[s] : "8+ characters with upper- and lower-case, a number and a symbol"}</small>
          <Pw value={pw2} onChange={setPw2} placeholder="Type it again" auto="new-password" />
        </>
      )}
      {err && <div className="err small">{err}</div>}
      <button type="submit" disabled={busy || !pw || (setting && !pw2) || (mode === "reset" && !login)}>{setting ? <><KeyRound size={15} /> {busy ? "Saving…" : "Save password"}</> : <><LockOpen size={15} /> {busy ? "Checking…" : "Unlock"}</>}</button>
      {st.set && <button type="button" className="ghost sm" onClick={() => { setMode(mode === "reset" ? "unlock" : "reset"); setErr(""); }}>{mode === "reset" ? "Back" : "Forgot it?"}</button>}
    </form>
  );
}

// Small "Lock now" + "Change password" controls for unlocked WhatsApp pages.
export function WaLockBar({ onLocked }) {
  const [st, load] = useWaLock();
  const [chg, setChg] = useState(false); const [cur, setCur] = useState(""); const [pw, setPw] = useState(""); const [msg, setMsg] = useState("");
  if (!st?.unlocked) return null;
  const mins = st.until ? Math.max(1, Math.round((st.until - Date.now()) / 60000)) : 30;
  const lock = async () => { await post({ action: "lock" }); onLocked?.(); load(); location.reload(); };
  const change = async () => { const r = await post({ action: "set", current: cur, password: pw }); setMsg(r.ok ? "Password changed." : r.d.error); if (r.ok) { setChg(false); setCur(""); setPw(""); } };
  return (
    <span className="wl-bar">
      <span className="chip ok"><LockOpen size={12} /> Unlocked · {mins} min</span>
      <button type="button" className="ghost sm" onClick={lock}><Lock size={13} /> Lock now</button>
      <button type="button" className="ghost sm" onClick={() => setChg(!chg)}><KeyRound size={13} /> Password</button>
      {chg && (
        <span className="wl-chg">
          <Pw value={cur} onChange={setCur} placeholder="Current password" />
          <Pw value={pw} onChange={setPw} placeholder="New password" auto="new-password" />
          <button type="button" className="sm" onClick={change} disabled={!cur || !pw}>Change</button>
        </span>
      )}
      {msg && <small className="muted">{msg}</small>}
    </span>
  );
}
