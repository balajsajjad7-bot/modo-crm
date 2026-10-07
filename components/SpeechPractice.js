"use client";
// Practise a campaign speech: say it (or type it) and Modo scores it against the admin's speech.
import { useState } from "react";
import { Sparkles, ThumbsUp, Wrench, MessageSquareQuote } from "lucide-react";
import VoiceRecord from "./VoiceRecord";

export default function SpeechPractice({ speech }) {
  const [text, setText] = useState(""); const [res, setRes] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const check = async (t = text) => {
    setBusy(true); setErr(""); setRes(null);
    const r = await fetch("/api/ai/speeches", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: speech.id, text: t }) }).then(async (x) => ({ ok: x.ok, d: await x.json().catch(() => ({})) })).catch(() => ({ ok: false, d: { error: "Network problem" } }));
    setBusy(false); if (r.ok) setRes(r.d); else setErr(r.d.error);
  };
  const tone = res ? (res.score >= 80 ? "ok" : res.score >= 55 ? "late" : "red") : "";
  return (
    <div className="sp-prac">
      <p className="small muted" style={{ margin: 0 }}>Say the pitch out loud like you're on a call (or type it). Modo compares it with the official speech.</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Hi, this is … calling about …" style={{ minHeight: 90 }} />
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        <VoiceRecord label="Say it" className="sm" onText={(t) => { const v = (text ? text + " " : "") + t; setText(v); check(v); }} />
        <button className="ghost sm" onClick={() => check()} disabled={busy || text.trim().length < 15}><Sparkles size={13} /> {busy ? "Checking…" : "Check my pitch"}</button>
      </div>
      {err && <div className="err small">{err}</div>}
      {res && (
        <div className="sp-res">
          <div className={"sp-score " + tone}><b>{res.score}</b><small>/100</small></div>
          <div className="stack" style={{ gap: 6, flex: 1, minWidth: 0 }}>
            {res.good.length > 0 && <div><b className="row small" style={{ gap: 5 }}><ThumbsUp size={13} /> Good</b><ul>{res.good.map((g, i) => <li key={i}>{g}</li>)}</ul></div>}
            {res.fix.length > 0 && <div><b className="row small" style={{ gap: 5 }}><Wrench size={13} /> Fix</b><ul>{res.fix.map((g, i) => <li key={i}>{g}</li>)}</ul></div>}
            {res.say && <div><b className="row small" style={{ gap: 5 }}><MessageSquareQuote size={13} /> Say it like this</b><p className="sp-say">{res.say}</p></div>}
          </div>
        </div>
      )}
    </div>
  );
}
