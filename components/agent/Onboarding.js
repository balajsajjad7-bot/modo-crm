"use client";
// New-agent welcome: greets by name, shows the team onboarding message and the confidential
// employment contract. Pops up once on first sign-in; "My contract" shows the same thing as a page.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Sparkles, ShieldCheck, X, Check, FileText, Lock, Hand, Printer, CheckCircle2, Clock, PenLine, BadgeCheck } from "lucide-react";
import { usePathname } from "next/navigation";
import SignaturePad from "@/components/SignaturePad";

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

// Sign box: full name + drawn signature. Shows the signature once signed.
function SignBox({ d, onSigned }) {
  const [name, setName] = useState(d.name || ""); const [img, setImg] = useState(""); const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  if (!d.contract) return null;
  if (d.sign?.signed) return (
    <div className="ob-signed"><img src={d.sign.image} alt="Your signature" /><span><b><BadgeCheck size={15} /> Signed by {d.sign.signedName}</b><small className="muted">{new Date(d.sign.signedAt).toLocaleString()}</small></span></div>
  );
  const sign = async () => {
    setBusy(true); setErr("");
    const r = await fetch("/api/onboarding", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sign: { name, image: img } }) }).then(async (x) => ({ ok: x.ok, d: await x.json().catch(() => ({})) })).catch(() => ({ ok: false, d: { error: "Network problem" } }));
    setBusy(false); if (!r.ok) return setErr(r.d.error || "Couldn't sign."); onSigned();
  };
  return (
    <section className="ob-sign">
      <div className="ob-contract-h"><PenLine size={14} /><b>{d.sign?.outdated ? "Your contract was updated — please sign again" : "Sign your contract"}</b></div>
      <label className="ob-name">Full name<input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
      <SignaturePad onChange={setImg} />
      <label className="ob-agree"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I have read this contract and I agree to it.</label>
      {err && <div className="err small">{err}</div>}
      <button className="sm" onClick={sign} disabled={busy || !agree || !img || name.trim().length < 3}><PenLine size={14} /> {busy ? "Signing…" : "Sign contract"}</button>
    </section>
  );
}

export default function Onboarding({ always, inline }) {
  const [d, setD] = useState(null); const [open, setOpen] = useState(false); const [ack, setAck] = useState(false); const [err, setErr] = useState("");
  const path = usePathname();
  const load = () => fetch("/api/onboarding", { cache: "no-store" }).then((r) => r.json()).then((x) => { setD(x); if (x.needsWelcome || always) setOpen(true); }).catch(() => setErr("Couldn't load your contract. Check the connection and reload."));
  useEffect(() => { load(); }, []);
  // Not signed yet → remind on every page and every 15 minutes.
  const unsigned = !!d?.sign?.required && !d.sign.signed;
  useEffect(() => { if (!inline && unsigned && path !== "/agent/contract") setOpen(true); }, [path, unsigned, inline]);
  useEffect(() => { if (inline || !unsigned) return; const t = setInterval(() => setOpen(true), 15 * 60000); return () => clearInterval(t); }, [unsigned, inline]);
  const first = (d?.name || "").split(" ")[0];
  async function acknowledge() { setAck(true); await fetch("/api/onboarding", { method: "POST" }).catch(() => {}); setD((x) => ({ ...x, acknowledged: true })); if (!inline) setOpen(false); }
  const signed = () => { load(); if (!inline) setTimeout(() => setOpen(false), 1500); };

  // "My contract" page: a normal card on the page (no pop-up that could get cut off or closed away).
  if (inline) {
    if (err) return <div className="err">{err}</div>;
    if (!d) return <section className="panel ob-page"><p className="muted">Loading your contract…</p></section>;
    const st = d.sign?.signed ? ["ok", <><BadgeCheck size={12} /> Signed</>] : d.contract ? ["late", <><PenLine size={12} /> Waiting for your signature</>] : d.acknowledged ? ["ok", <><CheckCircle2 size={12} /> Read</>] : ["late", <><Clock size={12} /> Please read</>];
    return (
      <section className="panel ob-page">
        <header className="ob-hero">
          <span className="ob-hero-ic"><FileText size={24} /></span>
          <div><h2>Welcome{first ? ", " + first : ""}!</h2><span className="muted small">Your welcome note and confidential contract</span></div>
          <span className={"chip " + st[0]}>{st[1]}</span>
        </header>
        <Body d={d} />
        <SignBox d={d} onSigned={signed} />
        <footer className="ob-foot">
          {d.contract && <button className="ghost sm" onClick={() => window.print()}><Printer size={14} /> Print</button>}
          {!d.contract && !d.acknowledged && <button className="sm" onClick={acknowledge} disabled={ack}><Check size={14} /> I've read and understood</button>}
        </footer>
      </section>
    );
  }

  if (!open || !d || typeof document === "undefined") return null;
  const canClose = d.acknowledged || unsigned;
  return createPortal(
    <div className="ai-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && canClose) setOpen(false); }}>
      <div className="ai-modal ob-modal" role="dialog" aria-modal="true" aria-label="Welcome">
        <header className="ai-modal-head">
          <b className="row" style={{ gap: 7 }}><span className="ai-orb"><Sparkles size={14} /></span> {unsigned ? "Please sign your contract" : `Welcome${first ? ", " + first : ""}!`}</b>
          {canClose && <button className="ghost sm icon-btn" onClick={() => setOpen(false)} aria-label="Close"><X size={15} /></button>}
        </header>
        <div className="ai-modal-body"><Body d={d} /><SignBox d={d} onSigned={signed} /></div>
        <footer className="ai-modal-foot">
          {unsigned ? <button className="ghost sm" onClick={() => setOpen(false)}>Remind me later</button>
            : d.acknowledged ? <button className="ghost sm" onClick={() => setOpen(false)}>Close</button>
            : <button className="sm" onClick={acknowledge} disabled={ack}><Check size={14} /> I've read and understood</button>}
        </footer>
      </div>
    </div>, document.body);
}
