"use client";
// "✨ AI" button used across Modo. Calls /api/ai/do and shows the answer.
// The answer opens as a centered overlay (rendered to <body>) so it can never be
// clipped by a card's overflow/transform — the old absolute popover got cut off inside sale cards.
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Sparkles, Copy, X, Check } from "lucide-react";

export default function AiButton({ task, payload, label = "Ask AI", onResult, useLabel, className = "ghost sm", inline }) {
  const [busy, setBusy] = useState(false); const [out, setOut] = useState(null); const [err, setErr] = useState(""); const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (out == null && !err) return;
    const esc = (e) => e.key === "Escape" && close();
    document.addEventListener("keydown", esc); return () => document.removeEventListener("keydown", esc);
  }, [out, err]);
  const close = () => { setOut(null); setErr(""); setCopied(false); };
  async function go() {
    setBusy(true); setErr(""); setOut(null);
    try {
      const r = await fetch("/api/ai/do", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ task, ...(typeof payload === "function" ? payload() : payload) }) });
      const d = await r.json().catch(() => ({})); setBusy(false);
      if (!r.ok) return setErr(d.error || "AI isn't available. Check Admin → Connectors → AI provider.");
      if (onResult && !d.text) return onResult(d);
      setOut(d.text || "");
    } catch { setBusy(false); setErr("Couldn't reach the AI. Try again."); }
  }
  const copy = () => { navigator.clipboard?.writeText(out || ""); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const clean = (out || "").split("\n").map((l) => l.replace(/^[-*•]\s*/, "").replace(/\*\*/g, "").trim()).filter(Boolean);

  const card = (
    <div className="ai-modal" role="dialog" aria-modal="true" aria-label="Modo AI">
      <header className="ai-modal-head">
        <b className="row" style={{ gap: 7 }}><span className="ai-orb"><Sparkles size={14} /></span> Modo AI</b>
        <button type="button" className="ghost sm icon-btn" aria-label="Close" onClick={close}><X size={15} /></button>
      </header>
      <div className="ai-modal-body">
        {err ? <p className="err" style={{ margin: 0 }}>{err}</p> : clean.length ? clean.map((l, i) => <p key={i}>{l}</p>) : <p className="muted">No answer.</p>}
      </div>
      {!err && (
        <footer className="ai-modal-foot">
          <button type="button" className="ghost sm" onClick={copy}>{copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}</button>
          {onResult && useLabel && <button type="button" className="sm" onClick={() => { onResult({ text: out }); close(); }}>{useLabel}</button>}
        </footer>
      )}
    </div>
  );

  return (
    <span className={"ai-btn-wrap" + (inline ? " inline" : "")}>
      <button type="button" className={className + " ai-btn"} onClick={go} disabled={busy}><Sparkles size={13} /> {busy ? "Thinking…" : label}</button>
      {mounted && (out != null || err) && createPortal(
        <div className="ai-overlay" onMouseDown={(e) => e.target === e.currentTarget && close()}>{card}</div>,
        document.body
      )}
    </span>
  );
}
