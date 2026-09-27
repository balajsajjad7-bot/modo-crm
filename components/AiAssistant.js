"use client";
// Modo AI: a chat assistant that knows the team's live data (admin) or the agent's own shift (agent).
import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, Copy, RotateCcw } from "lucide-react";

const ADMIN_PROMPTS = ["Who was late the most this month?", "Summarise today's sales", "Which agents are below target today?", "Draft a motivating message for the team", "Estimate this month's total payroll", "Who has the most idle time?"];
const AGENT_PROMPTS = ["Customer says it's too expensive. What do I say?", "Write a 20-second opening for an internet discount call", "How do I explain the contract terms clearly?", "How far am I from today's target?", "Customer wants to think about it. How do I follow up?", "Summarise these notes for the sale:"];

// Tiny formatter: **bold**, `code`, bullet and numbered lists, paragraphs.
function Format({ text }) {
  const blocks = String(text).split(/\n{2,}/);
  const inline = (s, k) => s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, i) => p.startsWith("**") ? <b key={k + i}>{p.slice(2, -2)}</b> : p.startsWith("`") ? <code key={k + i}>{p.slice(1, -1)}</code> : p);
  return blocks.map((b, i) => {
    const lines = b.split("\n");
    if (lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l))) {
      const ordered = /^\s*\d/.test(lines[0]);
      const items = lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ""), j + "-")}</li>);
      return ordered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>;
    }
    return <p key={i}>{lines.map((l, j) => <span key={j}>{inline(l.replace(/^#+\s*/, ""), j + "-")}{j < lines.length - 1 && <br />}</span>)}</p>;
  });
}

export default function AiAssistant({ role }) {
  const [msgs, setMsgs] = useState([]); const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const end = useRef(null); const box = useRef(null);
  useEffect(() => { try { const s = sessionStorage.getItem("modo-ai-" + role); if (s) setMsgs(JSON.parse(s)); } catch {} }, [role]);
  useEffect(() => { try { sessionStorage.setItem("modo-ai-" + role, JSON.stringify(msgs.slice(-30))); } catch {} end.current?.scrollIntoView({ block: "end" }); }, [msgs, role]);

  async function ask(q) {
    const question = (q ?? text).trim(); if (!question || busy) return;
    const next = [...msgs, { role: "user", content: question }];
    setMsgs(next); setText(""); setErr(""); setBusy(true);
    const r = await fetch("/api/ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: next }) });
    const d = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) return setErr(d.error || "Modo AI couldn't answer.");
    setMsgs([...next, { role: "assistant", content: d.reply }]);
  }
  const prompts = role === "ADMIN" ? ADMIN_PROMPTS : AGENT_PROMPTS;

  return (
    <div className="ai panel">
      <div className="ai-body">
        {msgs.length === 0 && (
          <div className="ai-hello">
            <span className="ai-orb"><Sparkles size={26} /></span>
            <h2>Ask Modo AI</h2>
            <p className="muted">{role === "ADMIN" ? "It can see live attendance, lateness, payroll and sales, so ask it anything about your team." : "Your sales coach for scripts, objections and discount maths."}</p>
            <div className="ai-prompts">{prompts.map((p) => <button key={p} className="ghost" onClick={() => p.endsWith(":") ? (setText(p + " "), box.current?.focus()) : ask(p)}>{p}</button>)}</div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={"ai-msg " + m.role}>
            {m.role === "assistant" && <span className="ai-orb sm"><Sparkles size={14} /></span>}
            <div className="ai-bubble">
              {m.role === "assistant" ? <Format text={m.content} /> : m.content}
              {m.role === "assistant" && <button className="ai-copy" aria-label="Copy answer" title="Copy" onClick={() => navigator.clipboard?.writeText(m.content)}><Copy size={13} /></button>}
            </div>
          </div>
        ))}
        {busy && <div className="ai-msg assistant"><span className="ai-orb sm"><Sparkles size={14} /></span><div className="ai-bubble muted">Thinking…</div></div>}
        {err && <div className="err">{err}</div>}
        <div ref={end} />
      </div>
      <div className="ai-input">
        {msgs.length > 0 && <button className="ghost icon-btn" aria-label="New conversation" title="New conversation" onClick={() => { setMsgs([]); setErr(""); }}><RotateCcw size={16} /></button>}
        <textarea ref={box} rows={1} value={text} placeholder="Ask anything…" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }} />
        <button className="icon-btn" aria-label="Send" onClick={() => ask()} disabled={busy || !text.trim()}><Send size={16} /></button>
      </div>
    </div>
  );
}
