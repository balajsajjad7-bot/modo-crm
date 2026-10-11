"use client";
// Sale submission gate for agents: the admin can require a sale password and can switch submitting off per agent.
import { useEffect, useState } from "react";
import { KeyRound, Ban } from "lucide-react";

// Re-checks every 20 seconds and whenever the tab comes back, so turning the password on (or an agent off)
// reaches forms that are already open. need() shows the password box at once when the server asks for it.
export function useSaleGate() {
  const [g, setG] = useState({ needPassword: false, off: false, loaded: false });
  useEffect(() => {
    let dead = false;
    const check = () => fetch("/api/sales/lock", { cache: "no-store" }).then((r) => r.json()).then((d) => { if (!dead) setG({ needPassword: !!d.needPassword, off: !!d.off, loaded: true }); }).catch(() => { if (!dead) setG((x) => ({ ...x, loaded: true })); });
    check(); const t = setInterval(check, 20000);
    const vis = () => { if (document.visibilityState === "visible") check(); };
    document.addEventListener("visibilitychange", vis); window.addEventListener("focus", check);
    return () => { dead = true; clearInterval(t); document.removeEventListener("visibilitychange", vis); window.removeEventListener("focus", check); };
  }, []);
  return { ...g, need: () => setG((x) => ({ ...x, needPassword: true })), turnOff: () => setG((x) => ({ ...x, off: true })) };
}
// After a refused submit: show the password box / the "turned off" card straight away.
export function gateFromError(gate, status, d) {
  if (d?.needPassword) gate.need();
  if (status === 403 && /turned off for you/i.test(d?.error || "")) gate.turnOff();
}
export function SalePassword({ value, onChange }) {
  return (
    <label className="sale-pw"><span><KeyRound size={14} /> Sale password</span>
      <input type="password" value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" required autoFocus placeholder="Type the sale password to send" />
    </label>
  );
}
export function SalesOff() {
  return (
    <div className="panel sales-off"><span className="gt gt-sm" style={{ "--g1": "#fda4af", "--g2": "#e11d48" }}><Ban size={17} /></span>
      <div><b>Submitting sales is turned off for you</b><p className="muted small" style={{ margin: 0 }}>Your admin has switched off sale submission on your account. Ask them if you think this is a mistake.</p></div>
    </div>
  );
}
