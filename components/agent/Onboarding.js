"use client";
// New-agent welcome: greets by name, shows the team onboarding message and the confidential
// employment contract. Pops up once on first sign-in; "My contract" shows the same thing as a page.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, ShieldCheck, X, Check, FileText, Lock, Hand, Printer, CheckCircle2, Clock } from "lucide-react";

function Body({ d }) {
  // Contract text → paragraphs; lines like "1. Pay" or "PAY" become headings.
  const lines = (d.contract || "").split("\n");
  return (
    <>
      {d.message && (
        <div className="ob-msg"><span className="ob-msg-ic"><Hand size={16} /></span><div>{d.message.split("\n").filter(Boolean).map((l, i) => <p key={i}>{l}</p>)}</div></div>
      )}
      {d.contract ? (
        <section className="ob-contract">
          <div className="ob-contract-h"><ShieldCheck size={14} /><b>Your employment contract · confidential</b></div>
          <div className="ob-contract-body">
            {lines.map((l, i) => (/^(\d+[.)]\s+\S.{0,60}|[A-Z][A-Z &/-]{3,40})$/.test(l.trim()) ? <h4 key={i}>{l.trim()}</h4> : l.trim() ? <p key={i}>{l}</p> : <div key={i} className="ob-gap" />))}
          </div>
          <p className="ob-private"><Lock size={12} /> Private to you — only you and management can see it.</p>
        </section>
      ) : (
        <div className="ob-empty"><FileText size={30} /><b>No contract yet</b><span className="muted small">It appears here as soon as management adds it.</span></div>
      )}
    </>
  );
}

export default function Onboarding({ always, inline }) {
  const [d, setD] = useState(null); const [open, setOpen] = useState(false); const [ack, setAck] = useState(false); const [err, setErr] = useState("");
  const load = () => fetch("/api/onboarding", { cache: "no-store" }).then((r) => r.json()).then((x) => { setD(x); if (x.needsWelcome || always) setOpen(true); }).catch(() => setErr("Couldn't load your contract. Check the connection and reload."));
  useEffect(() => { load(); }, []);
  const first = (d?.name || "").split(" ")[0];
  async function acknowledge() { setAck(true); await fetch("/api/onboarding", { method: "POST" }).catch(() => {}); setD((x) => ({ ...x, acknowledged: true })); if (!inline) setOpen(false); }

  // "My contract" page: a normal card on the page (no pop-up that could get cut off or closed away).
  if (inline) {
    if (err) return <div className="err">{err}</div>;
    if (!d) return <section className="panel ob-page"><p className="muted">Loading your contract…</p></section>;
    return (
      <section className="panel ob-page">
        <header className="ob-hero">
          <span className="ob-hero-ic"><FileText size={24} /></span>
          <div><h2>Welcome{first ? ", " + first : ""}!</h2><span className="muted small">Your welcome note and confidential contract</span></div>
          <span className={"chip " + (d.acknowledged ? "ok" : "late")}>{d.acknowledged ? <><CheckCircle2 size={12} /> Read & understood</> : <><Clock size={12} /> Please read</>}</span>
        </header>
        <Body d={d} />
        <footer className="ob-foot">
          {d.contract && <button className="ghost sm" onClick={() => window.print()}><Printer size={14} /> Print</button>}
          {!d.acknowledged && d.contract && <button className="sm" onClick={acknowledge} disabled={ack}><Check size={14} /> I've read and understood</button>}
        </footer>
      </section>
    );
  }

  if (!open || !d || typeof document === "undefined") return null;
  return createPortal(
    <div className="ai-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && d.acknowledged) setOpen(false); }}>
      <div className="ai-modal ob-modal" role="dialog" aria-modal="true" aria-label="Welcome">
        <header className="ai-modal-head">
          <b className="row" style={{ gap: 7 }}><span className="ai-orb"><Sparkles size={14} /></span> Welcome{first ? ", " + first : ""}!</b>
          {d.acknowledged && <button className="ghost sm icon-btn" onClick={() => setOpen(false)} aria-label="Close"><X size={15} /></button>}
        </header>
        <div className="ai-modal-body"><Body d={d} /></div>
        <footer className="ai-modal-foot">
          {d.acknowledged ? <button className="ghost sm" onClick={() => setOpen(false)}>Close</button>
            : <button className="sm" onClick={acknowledge} disabled={ack}><Check size={14} /> I've read and understood</button>}
        </footer>
      </div>
    </div>, document.body);
}
