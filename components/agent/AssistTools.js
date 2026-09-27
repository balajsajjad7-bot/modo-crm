"use client";
// 19 one-tap AI tools inside Call assist. Each reads the live call (and Modo's trained knowledge).
import { useState } from "react";
import * as I from "lucide-react";
import { TOOLS } from "@/lib/assistTools";

export default function AssistTools({ getSid }) {
  const [open, setOpen] = useState(null); const [input, setInput] = useState(""); const [out, setOut] = useState(""); const [busy, setBusy] = useState(false); const [q, setQ] = useState("");
  const tool = TOOLS.find((t) => t.id === open);
  async function run(t, text) {
    setOpen(t.id); setOut(""); setBusy(true);
    const r = await fetch("/api/assist/tools", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tool: t.id, sessionId: getSid?.(), input: text ?? input }) });
    const d = await r.json().catch(() => ({})); setBusy(false); setOut(r.ok ? d.text : d.error || "AI isn't available right now.");
  }
  const speak = () => { try { const u = new SpeechSynthesisUtterance(out); u.lang = tool?.id === "spanish" ? "es-US" : "en-US"; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch {} };
  const list = TOOLS.filter((t) => !q || t.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="at stack">
      <div className="row" style={{ justifyContent: "space-between" }}><span className="sf-l"><I.Sparkles size={12} /> AI toolkit · {TOOLS.length} tools</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a tool" style={{ maxWidth: 180, padding: "5px 10px" }} aria-label="Find a tool" /></div>
      <div className="at-grid">{list.map((t) => { const Ico = I[t.icon] || I.Sparkles; return (
        <button key={t.id} className={"at-btn" + (open === t.id ? " on" : "")} onClick={() => { setInput(""); if (t.input) { setOpen(t.id); setOut(""); } else run(t, ""); }}><Ico size={15} /><span>{t.label}</span></button>
      ); })}</div>
      {tool && (
        <div className="at-out">
          <div className="row" style={{ justifyContent: "space-between" }}><b className="row" style={{ gap: 6 }}><I.Sparkles size={14} /> {tool.label}</b><button className="ghost sm icon-btn" aria-label="Close" onClick={() => { setOpen(null); setOut(""); }}><I.X size={13} /></button></div>
          {tool.input && <div className="row" style={{ flexWrap: "nowrap" }}><input value={input} onChange={(e) => setInput(e.target.value)} placeholder={tool.input} onKeyDown={(e) => e.key === "Enter" && run(tool)} autoFocus /><button className="sm" onClick={() => run(tool)} disabled={busy}>Go</button></div>}
          {busy ? <p className="muted small" style={{ margin: 0 }}><I.Loader2 size={13} className="spin" /> Thinking…</p> : out && <div className="ai-pop-text">{out.split("\n").filter((l) => l.trim()).map((l, i) => <p key={i}>{l.replace(/^[-*•]\s*/, "").replace(/\*\*/g, "")}</p>)}</div>}
          {out && !busy && <div className="row"><button className="ghost sm" onClick={() => navigator.clipboard?.writeText(out)}><I.Copy size={12} /> Copy</button><button className="ghost sm" onClick={speak}><I.Volume2 size={12} /> Read aloud</button><button className="ghost sm" onClick={() => run(tool)}><I.RefreshCw size={12} /> Another</button></div>}
        </div>
      )}
    </div>
  );
}
