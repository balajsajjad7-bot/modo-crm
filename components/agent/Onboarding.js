"use client";
// New-agent welcome: greets by name, shows the team onboarding message and the confidential
// employment contract. Pops up once on first sign-in; also openable any time from "My contract".
import { useEffect, useState } from "react";
import { Sparkles, ShieldCheck, X, Check } from "lucide-react";

export default function Onboarding({ always }) {
  const [d, setD] = useState(null); const [open, setOpen] = useState(false); const [ack, setAck] = useState(false);
  const load = () => fetch("/api/onboarding").then((r) => r.json()).then((x) => { setD(x); if (x.needsWelcome || always) setOpen(true); }).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!open || !d) return null;
  const first = (d.name || "").split(" ")[0];
  async function acknowledge() { setAck(true); await fetch("/api/onboarding", { method: "POST" }).catch(() => {}); setOpen(false); }
  return (
    <div className="ai-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && d.acknowledged) setOpen(false); }}>
      <div className="ai-modal ob-modal" role="dialog" aria-modal="true" aria-label="Welcome">
        <header className="ai-modal-head">
          <b className="row" style={{ gap: 7 }}><span className="ai-orb"><Sparkles size={14} /></span> Welcome{first ? ", " + first : ""}!</b>
          {d.acknowledged && <button className="ghost sm icon-btn" onClick={() => setOpen(false)} aria-label="Close"><X size={15} /></button>}
        </header>
        <div className="ai-modal-body">
          {d.message && <div className="ob-msg">{d.message.split("\n").filter(Boolean).map((l, i) => <p key={i}>{l}</p>)}</div>}
          {d.contract ? (
            <section className="ob-contract">
              <div className="row" style={{ gap: 6, color: "var(--muted-fg)" }}><ShieldCheck size={14} /><b style={{ fontSize: 12, letterSpacing: ".08em", textTransform: "uppercase" }}>Your employment contract · confidential</b></div>
              <div className="ob-contract-body">{d.contract.split("\n").map((l, i) => <p key={i}>{l || " "}</p>)}</div>
              <p className="muted small" style={{ margin: 0 }}>This is private to you. Only you and management can see it.</p>
            </section>
          ) : <p className="muted small">Your contract will appear here once management adds it.</p>}
        </div>
        <footer className="ai-modal-foot">
          {d.acknowledged ? <button className="ghost sm" onClick={() => setOpen(false)}>Close</button>
            : <button className="sm" onClick={acknowledge} disabled={ack}><Check size={14} /> I've read and understood</button>}
        </footer>
      </div>
    </div>
  );
}
