"use client";
// Admin → Tools → Train Modo AI. What you write here is given to the AI on every request:
// live call assist, QA reviews, Modo AI chat, AI buttons, Budget Ease checks…
import { useEffect, useState } from "react";
import { api } from "./api";
import { Brain, Save, Plus, Trash2, Download, MessageSquare } from "lucide-react";

const FIELDS = [["company", "About the company & products", "Who we are, what we sell, which US states, which providers (Verizon, AT&T, Spectrum…), what Budget Ease is…"],
  ["prices", "Prices, discounts & offers", "e.g. Verizon unlimited: $65/line, 4 lines $35/line. Budget Ease: up to 35% off. Activation fee $49 one-time…"],
  ["script", "Our call script", "Opening, discovery questions, pitch, close, how we confirm a sale…"],
  ["rules", "Rules the AI must always follow", "e.g. Always say 'this call may be recorded'. Never promise a price we don't offer. Never ask for full SSN…"],
  ["words", "Words & names we use", "Product names, abbreviations, team names…"]];

export default function TrainAI() {
  const [k, setK] = useState(null); const [msg, setMsg] = useState(""); const [q, setQ] = useState(""); const [ans, setAns] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { api("/api/ai/knowledge").then((r) => r.ok && setK({ enabled: true, objections: [], ...r.data })); }, []);
  if (!k) return <p className="muted">Loading…</p>;
  const save = async () => { const r = await api("/api/ai/knowledge", "PATCH", k); setMsg(r.ok ? "Saved. Every AI feature uses this from now on." : r.data.error); };
  const tryIt = async () => { setBusy(true); setAns(""); const r = await api("/api/ai/knowledge", "PATCH", { tryIt: q }); setBusy(false); setAns(r.ok ? r.data.answer : r.data.error); };
  const size = JSON.stringify(k).length;
  return (
    <div className="stack">
      <section className="panel stack">
        <div className="row" style={{ justifyContent: "space-between" }}><h2><Brain size={17} /> Train Modo AI</h2>
          <label className="row" style={{ color: "var(--foreground)", flexWrap: "nowrap" }}>Use this knowledge<button role="switch" aria-checked={k.enabled !== false} className={"toggle" + (k.enabled !== false ? " on" : "")} onClick={() => setK({ ...k, enabled: k.enabled === false })}><span /></button></label></div>
        <p className="muted small" style={{ margin: 0 }}>Teach the AI your business. It uses this in live call assist, call quality reviews, Modo AI chat and every ✨ button, so suggestions match your real prices, script and rules. {size > 7000 ? "It's long: the AI reads the first ~7,000 characters." : ""}</p>
      </section>
      {FIELDS.map(([f, l, ph]) => (
        <section key={f} className="panel stack"><h2 style={{ fontSize: 16 }}>{l}</h2><textarea value={k[f] || ""} onChange={(e) => setK({ ...k, [f]: e.target.value })} placeholder={ph} style={{ minHeight: f === "script" || f === "company" ? 150 : 100 }} /></section>
      ))}
      <section className="panel stack">
        <h2 style={{ fontSize: 16 }}>Approved answers to objections</h2>
        {k.objections.map((o, i) => (
          <div key={i} className="obj-row">
            <input value={o.q} onChange={(e) => setK({ ...k, objections: k.objections.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })} placeholder="Customer says… e.g. It's too expensive" />
            <textarea value={o.a} onChange={(e) => setK({ ...k, objections: k.objections.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })} placeholder="We answer…" style={{ minHeight: 60 }} />
            <button className="ghost sm icon-btn" aria-label="Remove" onClick={() => setK({ ...k, objections: k.objections.filter((_, j) => j !== i) })}><Trash2 size={13} /></button>
          </div>
        ))}
        <div><button className="ghost sm" onClick={() => setK({ ...k, objections: [...k.objections, { q: "", a: "" }] })}><Plus size={13} /> Add objection</button></div>
      </section>
      <div className="row"><button onClick={save}><Save size={15} /> Save training</button>{msg && <span className="small" style={{ color: "var(--green)" }}>{msg}</span>}</div>
      <section className="panel stack">
        <h2 style={{ fontSize: 16 }}><MessageSquare size={15} /> Try it</h2>
        <div className="row"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask like an agent would, e.g. customer says it's too expensive, what do I say?" style={{ flex: 1 }} onKeyDown={(e) => e.key === "Enter" && q && tryIt()} /><button onClick={tryIt} disabled={!q || busy}>{busy ? "Thinking…" : "Ask"}</button></div>
        {ans && <div className="brief-box">{ans.split("\n").filter(Boolean).map((l, i) => <p key={i}>{l}</p>)}</div>}
        <p className="muted small" style={{ margin: 0 }}>Save first, then ask. The answer uses your saved training.</p>
      </section>
      <section className="panel stack">
        <h2 style={{ fontSize: 16 }}><Download size={15} /> Training data (for a custom model later)</h2>
        <p className="muted small" style={{ margin: 0 }}>Download your best calls (QA score 80+ with both sides captioned) as a training file in the standard chat format. When you're ready to train Modo's own model, this is the data it learns from.</p>
        <div><a className="btn-link" href="/api/ai/training-export?min=80" download><Download size={14} /> Download best calls (.jsonl)</a></div>
      </section>
    </div>
  );
}
