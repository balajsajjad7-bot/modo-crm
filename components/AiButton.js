"use client";
// "✨ AI" button used across Modo. Calls /api/ai/do and shows the answer in a small panel (copy / use).
import { useState } from "react";
import { Sparkles, Copy, X } from "lucide-react";

export default function AiButton({ task, payload, label = "Ask AI", onResult, useLabel, className = "ghost sm", inline }) {
  const [busy, setBusy] = useState(false); const [out, setOut] = useState(null); const [err, setErr] = useState("");
  async function go() {
    setBusy(true); setErr(""); setOut(null);
    const r = await fetch("/api/ai/do", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ task, ...(typeof payload === "function" ? payload() : payload) }) });
    const d = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) return setErr(d.error || "AI isn't available. Check Admin → Connectors → AI provider.");
    if (onResult && !d.text) return onResult(d);
    setOut(d.text || "");
  }
  return (
    <span className={"ai-btn-wrap" + (inline ? " inline" : "")}>
      <button type="button" className={className + " ai-btn"} onClick={go} disabled={busy}><Sparkles size={13} /> {busy ? "Thinking…" : label}</button>
      {(out != null || err) && (
        <div className="ai-pop panel" role="status">
          <div className="row" style={{ justifyContent: "space-between" }}><b className="row" style={{ gap: 6 }}><Sparkles size={14} /> Modo AI</b><button type="button" className="ghost sm icon-btn" aria-label="Close" onClick={() => { setOut(null); setErr(""); }}><X size={13} /></button></div>
          {err ? <p className="err small" style={{ margin: 0 }}>{err}</p> : <div className="ai-pop-text">{out.split("\n").filter((l) => l.trim()).map((l, i) => <p key={i}>{l.replace(/^[-*•]\s*/, "").replace(/\*\*/g, "")}</p>)}</div>}
          {!err && <div className="row"><button type="button" className="ghost sm" onClick={() => navigator.clipboard?.writeText(out)}><Copy size={12} /> Copy</button>{onResult && useLabel && <button type="button" className="sm" onClick={() => { onResult({ text: out }); setOut(null); }}>{useLabel}</button>}</div>}
        </div>
      )}
    </span>
  );
}
