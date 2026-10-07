"use client";
// The agent's active Modo plan (set by the admin in Subscriptions). Hidden when no plan is assigned.
import { useEffect, useState } from "react";
import { Gift, Rocket, Sparkles, Crown, CreditCard, Check } from "lucide-react";

const ICON = { free: Gift, starter: Rocket, next: Sparkles, enterprise: Crown };
const TONE = { free: ["#cbd5e1", "#475569"], starter: ["#60a5fa", "#2563eb"], next: ["#a78bfa", "#7c3aed"], enterprise: ["#fcd34d", "#d97706"] };

export default function MyPlan() {
  const [p, setP] = useState(null); const [open, setOpen] = useState(false);
  useEffect(() => { fetch("/api/me/plan", { cache: "no-store" }).then((r) => r.json()).then((d) => setP(d.plan || null)).catch(() => {}); }, []);
  if (!p) return null;
  const I = ICON[p.id] || CreditCard; const [a, b] = TONE[p.id] || ["#5eead4", "#0d9488"];
  return (
    <section className="panel my-plan" style={{ "--g1": a, "--g2": b }}>
      <button type="button" className="mp-head" data-plain onClick={() => setOpen(!open)}>
        <span className="gt gt-sm"><I size={17} /></span>
        <span><small className="muted">Your Modo plan</small><b>{p.name} <span className="mp-on">● Active</span></b></span>
        <span className="small muted">{open ? "Hide" : "What's included"}</span>
      </button>
      {open && <ul className="mp-feat">{(p.features || []).map((f) => <li key={f}><Check size={13} /> {f}</li>)}</ul>}
    </section>
  );
}
