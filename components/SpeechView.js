"use client";
// A campaign speech, laid out like a playbook instead of plain text: numbered steps you can jump to,
// "say this" script bubbles with the [blanks] highlighted, discovery questions, customer-says / you-say
// objection cards, always / never columns, and Call mode — one step at a time, big, for a live call.
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Quote, Copy, Check, Lightbulb, ShieldAlert, CheckCircle2, XCircle, MessageCircleQuestion, ChevronLeft, ChevronRight, X, Presentation, Star, CornerDownRight } from "lucide-react";

const HEAD = /^([A-Z][A-Z0-9 +&/—'-]{2,}?)\s*(?:\((.+)\))?$/;
const unq = (s) => s.trim().replace(/^"|"$/g, "").trim();

export function parseSpeech(text) {
  const out = []; let cur = null;
  const add = (it) => { if (!cur) { cur = { title: "Speech", note: "", items: [] }; out.push(cur); } cur.items.push(it); };
  for (const raw of String(text || "").split("\n")) {
    const l = raw.trim(); if (!l) continue;
    let m;
    if (!l.startsWith('"') && (m = l.match(HEAD)) && l.length < 80) { cur = { title: m[1].trim(), note: (m[2] || "").trim(), items: [] }; out.push(cur); continue; }
    if ((m = l.match(/^[•\-*]\s*"(.+?)"\s*(?:→|->)\s*(.+)$/))) { add({ t: "obj", q: m[1].trim(), a: unq(m[2]) }); continue; }
    if ((m = l.match(/^[•\-*]\s*(.+?)\s*(?:→|->)\s*(.+)$/))) { add({ t: "branch", when: m[1].trim(), text: unq(m[2]) }); continue; }
    if ((m = l.match(/^(\d+)[.)]\s*(.+)$/))) { add({ t: "ask", n: m[1], text: unq(m[2]) }); continue; }
    if (l.startsWith('"')) { add({ t: "say", text: unq(l) }); continue; }
    if ((m = l.match(/^([^"]{3,80}?):\s*"(.+?)"\s*(.*)$/))) { add({ t: "say", label: m[1].trim(), text: m[2].trim(), after: m[3].trim() }); continue; }
    if ((m = l.match(/^(.{3,80}?):$/))) { add({ t: "label", text: m[1] }); continue; }
    add({ t: "note", text: l });
  }
  return out;
}

// [Customer first name] → a highlighted blank the agent fills in.
function Fill({ text }) {
  const parts = String(text || "").split(/(\[[^\]]+\])/g);
  return parts.map((p, i) => (p.startsWith("[") && p.endsWith("]") ? <span key={i} className="sv-ph">{p.slice(1, -1)}</span> : <Fragment key={i}>{p}</Fragment>));
}
function CopyBtn({ text }) {
  const [ok, setOk] = useState(false);
  return <button type="button" className="sv-copy" data-plain title="Copy this line" aria-label="Copy this line" onClick={() => { navigator.clipboard?.writeText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 1100); }).catch(() => {}); }}>{ok ? <Check size={13} /> : <Copy size={13} />}</button>;
}
const Say = ({ text, label, after, big }) => (
  <div className={"sv-say" + (big ? " big" : "")}>
    {label && <span className="sv-say-l">{label}</span>}
    <div className="sv-bubble"><Quote size={big ? 20 : 15} className="sv-q" /><p><Fill text={text} /></p><CopyBtn text={text} /></div>
    {after && <span className="sv-after"><CornerDownRight size={13} /> {after}</span>}
  </div>
);

function Item({ it, big }) {
  if (it.t === "say") return <Say {...it} big={big} />;
  if (it.t === "ask") return <div className="sv-ask"><b>{it.n}</b><p><Fill text={it.text} /></p><CopyBtn text={it.text} /></div>;
  if (it.t === "obj") return (
    <div className="sv-obj">
      <div className="sv-obj-q"><MessageCircleQuestion size={15} /><span><small>Customer says</small><b>“{it.q}”</b></span></div>
      <div className="sv-obj-a"><small>You say</small><p><Fill text={it.a} /></p><CopyBtn text={it.a} /></div>
    </div>
  );
  if (it.t === "branch") return <div className="sv-branch"><span className="sv-when">{it.when}</span><Say text={it.text} big={big} /></div>;
  if (it.t === "label") return <div className="sv-label">{it.text}</div>;
  return <div className="sv-note"><Lightbulb size={14} /><span><Fill text={it.text} /></span></div>;
}

const lines = (s) => String(s || "").split("\n").map((x) => x.replace(/^[-•]\s*/, "").trim()).filter(Boolean);

export default function SpeechView({ speech, onPractice }) {
  const steps = useMemo(() => parseSpeech(speech.text), [speech.text]);
  const [call, setCall] = useState(null); // index in Call mode
  const refs = useRef([]);
  const jump = (i) => refs.current[i]?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <div className={"sv" + (speech.priority ? " top" : "")}>
      <header className="sv-head">
        <div className="sv-title">
          {speech.priority && <span className="sv-badge"><Star size={11} /> Top priority</span>}
          <h3>{speech.title}</h3>
          <small>{speech.campaign || "All campaigns"} · {steps.length} steps{speech.myBest != null ? ` · your best ${speech.myBest}/100` : ""}</small>
        </div>
        <div className="sv-acts">
          <button type="button" className="sm" onClick={() => setCall(0)}><Presentation size={14} /> Call mode</button>
          {onPractice && <button type="button" className="ghost sm" onClick={onPractice}>🎯 Practise</button>}
        </div>
      </header>
      {steps.length > 1 && (
        <nav className="sv-nav" aria-label="Steps">
          {steps.map((s, i) => <button key={i} type="button" data-plain onClick={() => jump(i)}><i>{i + 1}</i>{s.title.toLowerCase()}</button>)}
        </nav>
      )}
      <div className="sv-steps">
        {steps.map((s, i) => (
          <section key={i} className="sv-step" ref={(el) => (refs.current[i] = el)}>
            <h4><i>{i + 1}</i><span>{s.title.toLowerCase()}</span>{s.note && <small>{s.note}</small>}</h4>
            <div className="sv-items">{s.items.map((it, j) => <Item key={j} it={it} />)}</div>
          </section>
        ))}
      </div>
      {(speech.dos || speech.donts) && (
        <div className="sv-rules">
          {speech.dos && <div className="sv-do"><h5><CheckCircle2 size={15} /> Always</h5><ul>{lines(speech.dos).map((l, i) => <li key={i}><Fill text={l} /></li>)}</ul></div>}
          {speech.donts && <div className="sv-dont"><h5><ShieldAlert size={15} /> Never</h5><ul>{lines(speech.donts).map((l, i) => <li key={i}><XCircle size={13} /><span><Fill text={l} /></span></li>)}</ul></div>}
        </div>
      )}
      {call != null && typeof document !== "undefined" && createPortal(<CallMode steps={steps} speech={speech} start={call} onClose={() => setCall(null)} />, document.body)}
    </div>
  );
}

// One step at a time, big and readable during a live call. ← → keys or swipe-sized buttons.
function CallMode({ steps, speech, start, onClose }) {
  const [i, setI] = useState(start);
  useEffect(() => {
    const k = (e) => { if (e.key === "ArrowRight") setI((x) => Math.min(steps.length - 1, x + 1)); if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1)); if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k); document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", k); document.body.style.overflow = ""; };
  }, [steps.length, onClose]);
  const s = steps[i];
  return (
    <div className="sv-call" role="dialog" aria-label="Call mode">
      <div className="sv-call-top">
        <span className="sv-call-t">{speech.title}</span>
        <div className="sv-call-dots">{steps.map((x, j) => <button key={j} type="button" data-plain className={j === i ? "on" : j < i ? "done" : ""} onClick={() => setI(j)} aria-label={"Step " + (j + 1) + ": " + x.title}>{j + 1}</button>)}</div>
        <button type="button" className="sv-x" data-plain onClick={onClose} aria-label="Close call mode"><X size={20} /></button>
      </div>
      <div className="sv-call-body">
        <h2><i>{i + 1}</i>{s.title.toLowerCase()}</h2>
        {s.note && <p className="sv-call-note">{s.note}</p>}
        <div className="sv-items big">{s.items.map((it, j) => <Item key={j} it={it} big />)}</div>
      </div>
      <div className="sv-call-foot">
        <button type="button" className="ghost" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0}><ChevronLeft size={18} /> Back</button>
        <span className="muted small">{i + 1} / {steps.length} · ← → keys</span>
        {i < steps.length - 1 ? <button type="button" onClick={() => setI(i + 1)}>{steps[i + 1].title.toLowerCase()} <ChevronRight size={18} /></button> : <button type="button" onClick={onClose}>Done <Check size={18} /></button>}
      </div>
    </div>
  );
}
