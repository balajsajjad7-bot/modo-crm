"use client";
// Sale section gate for agents: when the admin sets a sale password, the Sale section opens with a lock screen;
// the right password unlocks it for this visit (the unlock lives only in this page's memory, so leaving the
// section or closing the tab locks it again). The admin can also switch submitting off per agent.
import { useCallback, useEffect, useState } from "react";
import { KeyRound, Ban, Lock, Loader2 } from "lucide-react";

// Re-checks every 20 seconds and when the tab comes back, so turning the password on (or an agent off) reaches
// sections that are already open.
export function useSaleGate() {
  const [g, setG] = useState({ needPassword: false, off: false, loaded: false });
  const [token, setToken] = useState("");
  useEffect(() => {
    let dead = false;
    const check = () => fetch("/api/sales/lock", { cache: "no-store" }).then((r) => r.json()).then((d) => { if (!dead) setG({ needPassword: !!d.needPassword, off: !!d.off, loaded: true }); }).catch(() => { if (!dead) setG((x) => ({ ...x, loaded: true })); });
    check(); const t = setInterval(check, 20000);
    const vis = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", vis); window.addEventListener("focus", check);
    return () => { dead = true; clearInterval(t); document.removeEventListener("visibilitychange", vis); window.removeEventListener("focus", check); };
  }, []);
  const lock = useCallback(() => setToken(""), []);
  return {
    ...g, token, locked: g.loaded && g.needPassword && !token,
    unlocked: (tk) => { setToken(tk); setG((x) => ({ ...x, needPassword: !!tk })); },
    lock, turnOff: () => setG((x) => ({ ...x, off: true })),
  };
}
// After a refused submit: lock the section again / show the "turned off" card.
export function gateFromError(gate, status, d) {
  if (d?.needPassword) { gate.lock(); }
  if (d?.off || (status === 403 && /turned off for you/i.test(d?.error || ""))) gate.turnOff();
}

export function SaleUnlock({ gate, title = "Sale section" }) {
  const [pw, setPw] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const open = async (e) => {
    e.preventDefault(); if (!pw || busy) return; setBusy(true); setErr("");
    const r = await fetch("/api/sales/lock", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "unlock", password: pw }) }).then(async (x) => ({ ok: x.ok, status: x.status, d: await x.json().catch(() => ({})) })).catch(() => ({ ok: false, d: { error: "No connection." } }));
    setBusy(false); setPw("");
    if (r.ok) return gate.unlocked(r.d.token || "");
    if (r.d?.off) return gate.turnOff();
    setErr(r.d?.error || "Couldn't unlock.");
  };
  return (
    <div className="panel sale-lock">
      <span className="sale-lock-ic"><Lock size={26} /></span>
      <b>{title} is locked</b>
      <p className="muted small">Type the sale password from your admin to open it.</p>
      <form onSubmit={open} className="sale-lock-form">
        <label className="sale-pw"><span><KeyRound size={14} /> Sale password</span>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="off" autoFocus required placeholder="Sale password" />
        </label>
        <button disabled={busy || !pw}>{busy ? <Loader2 size={15} className="spin" /> : <Lock size={15} />} Open</button>
      </form>
      {err && <div className="err small">{err}</div>}
    </div>
  );
}
export function SalesOff() {
  return (
    <div className="panel sales-off"><span className="gt gt-sm" style={{ "--g1": "#fda4af", "--g2": "#e11d48" }}><Ban size={17} /></span>
      <div><b>Submitting sales is turned off for you</b><p className="muted small" style={{ margin: 0 }}>Your admin has switched off sale submission on your account. Ask them if you think this is a mistake.</p></div>
    </div>
  );
}
