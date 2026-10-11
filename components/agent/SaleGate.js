"use client";
// Sale submission gate for agents: the admin can require a sale password and can switch submitting off per agent.
import { useEffect, useState } from "react";
import { KeyRound, Ban } from "lucide-react";

export function useSaleGate() {
  const [g, setG] = useState({ needPassword: false, off: false, loaded: false });
  useEffect(() => { fetch("/api/sales/lock", { cache: "no-store" }).then((r) => r.json()).then((d) => setG({ needPassword: !!d.needPassword, off: !!d.off, loaded: true })).catch(() => setG((x) => ({ ...x, loaded: true }))); }, []);
  return g;
}
export function SalePassword({ value, onChange }) {
  return (
    <label className="sale-pw"><span><KeyRound size={14} /> Sale password</span>
      <input type="password" value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" required placeholder="Ask your admin" />
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
