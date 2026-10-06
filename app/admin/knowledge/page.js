"use client";
// Product knowledge: every provider card from #modo-training in one searchable place.
// Admin can search, filter by provider, ask Modo AI (which reads all of it), and add or edit cards.
import { useEffect, useMemo, useState } from "react";
import { BookOpen, Search, Sparkles, Plus, Pencil, Send } from "lucide-react";
import { LessonBody, LessonEditor } from "@/components/Chat";

const ALL = "Everything";
export default function KnowledgePage() {
  const [list, setList] = useState(null);
  const [q, setQ] = useState("");
  const [prov, setProv] = useState(ALL);
  const [edit, setEdit] = useState(null);
  const [ask, setAsk] = useState(""); const [answer, setAnswer] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const load = () => fetch("/api/training?kind=knowledge", { cache: "no-store" }).then((r) => (r.ok ? r.json() : [])).then((d) => setList(Array.isArray(d) ? d : [])).catch(() => setList([]));
  useEffect(() => { load(); }, []);

  const providers = useMemo(() => [ALL, ...new Set((list || []).map((x) => x.provider || "General"))], [list]);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = (list || []).filter((x) => (prov === ALL || (x.provider || "General") === prov)
    && words.every((w) => (x.title + " " + x.body + " " + (x.provider || "")).toLowerCase().includes(w)));
  // When searching, show only the matching lines of each card so answers jump out.
  const excerpt = (body) => {
    if (!words.length) return body;
    const lines = body.split("\n"); let head = "";
    const keep = [];
    for (const ln of lines) { if (ln.startsWith("# ")) { head = ln; continue; } if (words.some((w) => ln.toLowerCase().includes(w))) { if (head) { keep.push(head); head = ""; } keep.push(ln); } }
    return keep.length ? keep.join("\n") : body;
  };

  async function askAI(e) {
    e?.preventDefault(); if (!ask.trim() || busy) return;
    setBusy(true); setErr(""); setAnswer("");
    const r = await fetch("/api/ai", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "Answer from the provider product knowledge. Say prices are approximate and must be confirmed before quoting. Question: " + ask.trim() }] }) });
    const d = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) return setErr(d.error || "Modo AI couldn't answer.");
    setAnswer(d.reply || "");
  }

  return (
    <div className="kb-page">
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <p className="muted small" style={{ margin: 0 }}>Modo AI reads all of this; agents see it in Chat → #modo-training.</p>
        <button onClick={() => setEdit({ kind: "knowledge", provider: prov !== ALL ? prov : "" })}><Plus size={15} /> Add knowledge</button>
      </div>

      <form className="panel kb-ask" onSubmit={askAI}>
        <b className="row" style={{ gap: 6 }}><Sparkles size={16} /> Ask Modo AI about a provider</b>
        <div className="row" style={{ gap: 8 }}>
          <input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="e.g. What's the difference between Verizon Simplicity and myPlan Unlimited Plus?" />
          <button type="submit" disabled={busy || !ask.trim()} aria-label="Ask"><Send size={15} /> {busy ? "Thinking…" : "Ask"}</button>
        </div>
        {err && <div className="err small">{err}</div>}
        {answer && <p className="kb-answer">{answer}</p>}
      </form>

      <div className="kb-tools">
        <label className="sl-search" style={{ flex: "1 1 240px", margin: 0 }}><Search size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search plans, prices, hotspot, Fios, porting…" aria-label="Search product knowledge" /></label>
        <div className="kb-chips">{providers.map((p) => <button key={p} type="button" className={"kb-chip " + (prov === p ? "" : "ghost")} onClick={() => setProv(p)}>{p}</button>)}</div>
      </div>

      <div className="kb-list">
        {list === null ? <p className="muted">Loading…</p> : !shown.length ? <p className="muted">{list.length ? "Nothing matches that search." : "No product knowledge yet."}</p> : shown.map((x) => (
          <article key={x.id} className="tr-card">
            <header className="tr-top">
              <span className="tr-badge kb"><BookOpen size={14} /> {x.provider || "General"}</span>
              <span className="muted small">{x.editedAt ? "Edited " + new Date(x.editedAt).toLocaleDateString() : "Added " + new Date(x.at).toLocaleDateString()}</span>
              <span className="tr-admin"><button className="sl-icon" title="Edit" aria-label="Edit" onClick={() => setEdit({ id: x.id, text: JSON.stringify({ title: x.title, body: x.body, kind: "knowledge", provider: x.provider }) })}><Pencil size={15} /></button></span>
            </header>
            <h3 className="tr-title">{x.title}</h3>
            <div className="tr-body"><LessonBody body={excerpt(x.body)} /></div>
          </article>
        ))}
      </div>

      {edit && <LessonEditor lesson={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); load(); }} />}
    </div>
  );
}
