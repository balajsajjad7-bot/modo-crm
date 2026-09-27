"use client";
import AiButton from "@/components/AiButton";
// One Budget Ease submission as a card (admin board + agent's own list)
import { useState } from "react";
import { Lock, Eye, Trash2, AlertTriangle, Copy } from "lucide-react";

export const money = (n) => (n == null || isNaN(n) ? "—" : "$" + Number(n).toFixed(2));
const STATUS = { NEW: "New", FOLLOWUP: "Follow-up", APPROVED: "Approved", REJECTED: "Rejected" };
const fmtPhone = (p) => (p && p.length === 10 ? `(${p.slice(0, 3)}) ${p.slice(3, 6)}-${p.slice(6)}` : p || "—");

export default function BeCard({ r, admin, onStatus, onDelete, onReveal, preview }) {
  const [secret, setSecret] = useState(null);
  async function reveal() { if (secret) return setSecret(null); const d = await onReveal(r.id); if (d) { setSecret(d); setTimeout(() => setSecret(null), 30000); } }
  const pct = r.discountPct;
  return (
    <article className={"be-card be-" + (r.status || "NEW").toLowerCase()}>
      <header>
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 8 }}><span className="be-id">{r.consumerId || "BES-·······"}</span><span className={"chip be-st " + (r.status || "NEW").toLowerCase()}>{STATUS[r.status || "NEW"]}</span>{r.flags?.length > 0 && <span className="chip late"><AlertTriangle size={11} /> {r.flags.length}</span>}</div>
          <h3>{r.customer || "Customer name"}</h3>
          <div className="small muted">{r.company || "Utility company"} · {r.service}{r.agent ? ` · by ${r.agent}` : ""}{r.createdAt ? ` · ${new Date(r.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}</div>
        </div>
        <div className="be-save"><b>{pct == null ? "—" : pct + "%"}</b><span>off</span></div>
      </header>
      <div className="be-bill"><div><span>Current bill</span><b>{money(r.billAmount)}</b></div><span className="be-arrow">→</span><div><span>Wants to pay</span><b className="acc">{money(r.payAmount)}</b></div><div><span>Saves / year</span><b>{r.billAmount > 0 && r.payAmount > 0 ? money((r.billAmount - r.payAmount) * 12) : "—"}</b></div></div>
      <div className="be-grid">
        <div><span>Phone</span><b>{fmtPhone(r.phone)}</b></div>
        <div><span>ZIP</span><b>{r.zip || "—"}</b></div>
        <div className="wide"><span>Service address</span><b>{r.serviceAddress || "—"}</b></div>
        {r.email && <div className="wide"><span>Email</span><b>{r.email}</b></div>}
        <div><span>SSN (last 4)</span><b className="be-secret">{secret ? secret.ssn4 : preview ? (r.ssn4 ? "•••• " + (r.showSsn ? r.ssn4 : "") : "—") : "••••"}</b></div>
        <div><span>Date of birth</span><b className="be-secret">{secret ? new Date(secret.dob + "T00:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC" }) : preview ? (r.dob ? "set" : "—") : r.dobMasked}{r.age ? <span className="muted small"> · {r.age} yrs</span> : ""}</b></div>
      </div>
      {r.flags?.length > 0 && <div className="sale-flags">{r.flags.map((f, i) => <span key={i}>⚠ {f}</span>)}</div>}
      {r.notes && <p className="small" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{r.notes}</p>}
      {!preview && (
        <footer className="row" style={{ justifyContent: "space-between" }}>
          {admin ? (
            <div className="seg be-seg" role="tablist" aria-label="Status">{Object.entries(STATUS).map(([k, l]) => <button key={k} role="tab" aria-selected={r.status === k} onClick={() => onStatus(r, k)}>{l}</button>)}</div>
          ) : <span className="small muted"><Lock size={12} /> SSN and date of birth are encrypted</span>}
          <div className="row" style={{ gap: 6 }}>
            <button className="ghost sm icon-btn" title="Copy details (without SSN/DOB)" onClick={() => navigator.clipboard?.writeText(`${r.consumerId} · ${r.customer} · ${fmtPhone(r.phone)} · ${r.serviceAddress} ${r.zip} · ${r.company} ${r.service} · ${money(r.billAmount)} → ${money(r.payAmount)}`)}><Copy size={13} /></button>
            {admin && <AiButton task="check_be" payload={{ id: r.id }} label="AI check" />}
            {admin && <button className="ghost sm" onClick={reveal} title="Every reveal is recorded"><Eye size={13} /> {secret ? "Hide" : "Reveal SSN/DOB"}</button>}
            {admin && <button className="ghost sm icon-btn" aria-label="Delete" onClick={() => onDelete(r)}><Trash2 size={13} /></button>}
          </div>
        </footer>
      )}
      {admin && r.revealed > 0 && <span className="small muted">Private fields viewed {r.revealed} time{r.revealed === 1 ? "" : "s"}</span>}
    </article>
  );
}
