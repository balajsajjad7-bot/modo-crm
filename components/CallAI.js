"use client";
// AI assistant beside the dialer: opening lines, objection answers, what to say next, wrap-up notes.
// Knows the customer on screen (name, lead comments, last note) and the company knowledge from Train Modo AI.
import { useState } from "react";
import { Sparkles, Send, Copy, Check } from "lucide-react";

const QUICK = [
  ["Opening line", "Give me a short, friendly opening line for this call (2 sentences)."],
  ["What next?", "Based on the call so far, what should I say next? Give one line I can read out."],
  ["Price objection", "The customer says it's too expensive. Give me a calm 2-sentence answer."],
  ["Not interested", "The customer says they're not interested. Give me one polite line to keep them talking."],
  ["Close", "Give me a short, honest closing line to ask for the sale, including the required disclosures."],
];

export default function CallAI({ context = {}, note = "", onNote }) {
  const [msgs, setMsgs] = useState([]); const [q, setQ] = useState(""); const [busy, setBusy] = useState(false); const [copied, setCopied] = useState(-1);
  const ctx = () => {
    const c = Object.entries({ Customer: context.name, Phone: context.phone, "Lead notes": context.comments, "Last time we talked": context.lastNote, "My notes so far": note })
      .filter(([, v]) => v).map(([k, v]) => `${k}: ${String(v).slice(0, 600)}`).join("\n");
    return c ? `\n\n[On my dialer right now]\n${c}` : "";
  };
  async function ask(text) {
    const t = String(text || q).trim(); if (!t || busy) return;
    const shown = [...msgs, { role: "user", content: t }];
    setMsgs(shown); setQ(""); setBusy(true);
    const send = shown.map((m, i) => (i === shown.length - 1 ? { ...m, content: m.content + ctx() + "\n\nKeep it short: I'm on a live call." } : m));
    const r = await fetch("/api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: send.slice(-8) }) });
    const d = await r.json().catch(() => ({})); setBusy(false);
    setMsgs([...shown, { role: "assistant", content: r.ok ? d.reply : d.error || "AI couldn't answer." }]);
  }
  async function wrapNote() {
    if (!note.trim()) return ask("Write a short wrap-up note template for this call.");
    setBusy(true);
    const r = await fetch("/api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", content: `Rewrite my call notes as a clear 2–4 line CRM note. Then on a new line write "Result:" and the best result (Sale, Callback, Not interested, No answer…). Notes:\n${note}${ctx()}` }] }) });
    const d = await r.json().catch(() => ({})); setBusy(false);
    if (r.ok && onNote) onNote(String(d.reply || "").replace(/\*\*/g, "").trim());
    else setMsgs((m) => [...m, { role: "assistant", content: d.error || "AI couldn't tidy the note." }]);
  }
  return (
    <section className="panel stack call-ai">
      <h2><Sparkles size={17} /> AI assistant</h2>
      <div className="call-ai-quick">{QUICK.map(([l, p]) => <button key={l} className="ghost sm" disabled={busy} onClick={() => ask(p)}>{l}</button>)}
        {onNote && <button className="ghost sm" disabled={busy} onClick={wrapNote}>Tidy my note</button>}</div>
      <div className="call-ai-log">
        {!msgs.length && <p className="muted small" style={{ margin: 0 }}>Tap a button or type what the customer said. Answers use your company knowledge from Train Modo AI.</p>}
        {msgs.map((m, i) => (
          <div key={i} className={"call-ai-msg " + m.role}>
            <span>{m.content}</span>
            {m.role === "assistant" && <button className="ghost sm icon-btn" aria-label="Copy" onClick={() => { navigator.clipboard?.writeText(m.content); setCopied(i); setTimeout(() => setCopied(-1), 1200); }}>{copied === i ? <Check size={12} /> : <Copy size={12} />}</button>}
          </div>
        ))}
        {busy && <div className="call-ai-msg assistant muted">Thinking…</div>}
      </div>
      <form className="row" style={{ gap: 6, flexWrap: "nowrap" }} onSubmit={(e) => { e.preventDefault(); ask(); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Customer said… / ask anything" style={{ flex: 1, minWidth: 0 }} />
        <button className="sm" disabled={busy || !q.trim()} aria-label="Ask"><Send size={14} /></button>
      </form>
    </section>
  );
}
