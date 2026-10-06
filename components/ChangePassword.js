"use client";
// Admin: change your own password right here (no .env, no deploy). Profile menu → Change my password.
import { useState } from "react";
import { createPortal } from "react-dom";
import { KeyRound, X, Eye, EyeOff, CheckCircle2 } from "lucide-react";

export default function ChangePassword({ onClose }) {
  const [f, setF] = useState({ current: "", next: "", again: "" }); const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function save(e) {
    e.preventDefault(); setMsg(null);
    if (f.next !== f.again) return setMsg({ ok: false, t: "The new passwords don't match." });
    setBusy(true);
    const r = await fetch("/api/me/password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ current: f.current, next: f.next }) });
    const d = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) return setMsg({ ok: false, t: d.error || "Couldn't change it." });
    setMsg({ ok: true, t: "Password changed. Use it next time you sign in." }); setF({ current: "", next: "", again: "" });
  }
  const type = show ? "text" : "password";
  return createPortal(
    <div className="listen-ask-bg" role="dialog" aria-label="Change my password" onClick={onClose}>
      <form className="panel stack cpw" onClick={(e) => e.stopPropagation()} onSubmit={save}>
        <div className="row" style={{ justifyContent: "space-between" }}><h2 style={{ margin: 0 }}><KeyRound size={18} /> Change my password</h2><button type="button" className="ghost sm icon-btn" aria-label="Close" onClick={onClose}><X size={16} /></button></div>
        <label>Current password<input type={type} value={f.current} onChange={set("current")} autoComplete="current-password" required /></label>
        <label>New password<input type={type} value={f.next} onChange={set("next")} autoComplete="new-password" minLength={8} required /></label>
        <label>New password again<input type={type} value={f.again} onChange={set("again")} autoComplete="new-password" minLength={8} required /></label>
        <button type="button" className="ghost sm" style={{ justifySelf: "start" }} onClick={() => setShow(!show)}>{show ? <EyeOff size={13} /> : <Eye size={13} />} {show ? "Hide" : "Show"} passwords</button>
        <span className="small muted">At least 8 characters, with letters and a number. It stays the same after updates.</span>
        {msg && <p className={"small " + (msg.ok ? "" : "err")} style={{ margin: 0, color: msg.ok ? "var(--green)" : undefined }}>{msg.ok && <CheckCircle2 size={13} />} {msg.t}</p>}
        <button disabled={busy}>{busy ? "Saving…" : "Change password"}</button>
      </form>
    </div>, document.body);
}
