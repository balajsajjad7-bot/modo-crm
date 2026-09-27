"use client";
// End shift early: ask admin → wait → enter the code admin sends → clocked out.
import { useEffect, useState } from "react";
import { Clock, Send, KeyRound, X, Loader2 } from "lucide-react";

const j = (u, b) => fetch(u, { method: b ? "POST" : "GET", headers: { "content-type": "application/json" }, body: b ? JSON.stringify(b) : undefined, cache: "no-store" }).then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) }));
const t = (d) => new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export default function EndShiftDialog({ onClose, onDone }) {
  const [st, setSt] = useState(null); const [reason, setReason] = useState(""); const [code, setCode] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const load = () => j("/api/shift-end").then((r) => r.ok && setSt(r.d));
  useEffect(() => { load(); const i = setInterval(load, 8000); return () => clearInterval(i); }, []);
  const req = st?.request; const status = req?.status;
  async function ask() { setErr(""); setBusy(true); const r = await j("/api/shift-end", { reason }); setBusy(false); if (!r.ok) return setErr(r.d.error); load(); }
  async function redeem() { setErr(""); setBusy(true); const r = await j("/api/shift-end/redeem", { code }); setBusy(false); if (!r.ok) return setErr(r.d.error); onDone(); }
  return (
    <div className="sl-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sl-modal panel stack" role="dialog" aria-label="End shift early" style={{ maxWidth: 440 }}>
        <div className="row" style={{ justifyContent: "space-between" }}><h2><Clock size={17} /> End shift early</h2><button className="ghost sm icon-btn" aria-label="Close" onClick={onClose}><X size={14} /></button></div>
        {!st ? <p className="muted">Checking…</p> : (
          <>
            <p className="muted small" style={{ margin: 0 }}>Your shift ends at <b>{t(st.shiftEnd)}</b>. To leave before that, admin approves and sends you a code.</p>
            {(!req || ["denied", "used", "expired"].includes(status)) && (
              <>
                {status === "denied" && <div className="err small">Admin said no{req.adminNote ? `: ${req.adminNote}` : ""}. You can ask again with more detail.</div>}
                {status === "expired" && <div className="err small">Your last code expired. Ask again.</div>}
                <label>Why do you need to leave?<textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Feeling unwell / family emergency" style={{ minHeight: 80 }} autoFocus /></label>
                <button onClick={ask} disabled={busy || reason.trim().length < 3}><Send size={15} /> Ask admin</button>
              </>
            )}
            {status === "pending" && <div className="wait-box"><Loader2 size={18} className="spin" /><div><b>Waiting for admin…</b><div className="small muted">Sent at {t(req.createdAt)}: “{req.reason}”. This updates by itself.</div></div></div>}
            {status === "approved" && (
              <>
                <div className="receipt">Approved by {req.decidedBy}. Your code is in <b>Chat</b> (a message from {req.decidedBy}). It works for 30 minutes.</div>
                <input className="otp" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="000000" aria-label="Code from admin" autoFocus />
                <button onClick={redeem} disabled={busy || code.length !== 6}><KeyRound size={15} /> End my shift</button>
              </>
            )}
            {err && <div className="err">{err}</div>}
          </>
        )}
      </div>
    </div>
  );
}
