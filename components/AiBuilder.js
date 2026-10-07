"use client";
// AI Builder: describe anything, the AI writes a complete web app and it runs live in the preview.
// Keep chatting to change it. Builds are saved in this browser (My builds).
import { useEffect, useRef, useState } from "react";
import { Wand2, Send, Copy, Download, Maximize2, Plus, Code2, Eye, Trash2, FolderOpen, Check } from "lucide-react";

const IDEAS = [
  "A commission calculator: sales × rate, with a monthly total",
  "A landing page for a 30% utility bill discount offer",
  "Flashcards to practise call-script objections",
  "A daily sales tracker with a chart that saves my entries",
  "A to-do list with categories and dark mode",
  "A snake game I can play on my phone",
];
const KEY = "modo-builds";
const titleOf = (html, fallback) => (String(html).match(/<title>([^<]{1,60})<\/title>/i)?.[1] || fallback || "Untitled build").trim();
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } };
const store = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 30))); } catch {} };

export default function AiBuilder() {
  const [msgs, setMsgs] = useState([]); const [html, setHtml] = useState(""); const [id, setId] = useState(null);
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const [view, setView] = useState("preview"); const [pane, setPane] = useState("chat"); // pane = mobile tab
  const [builds, setBuilds] = useState([]); const [open, setOpen] = useState(false); const [copied, setCopied] = useState(false);
  const end = useRef(null); const box = useRef(null);

  useEffect(() => { setBuilds(load()); }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs, busy]);

  function save(nextMsgs, nextHtml, curId) {
    const bid = curId || Date.now().toString(36);
    const item = { id: bid, title: titleOf(nextHtml, nextMsgs.find((m) => m.role === "user")?.content.slice(0, 40)), html: nextHtml, msgs: nextMsgs.slice(-20), at: Date.now() };
    const list = [item, ...load().filter((b) => b.id !== bid)];
    store(list); setBuilds(list); setId(bid);
  }

  async function ask(q) {
    const prompt = (q ?? text).trim(); if (!prompt || busy) return;
    const next = [...msgs, { role: "user", content: prompt }];
    setMsgs(next); setText(""); setErr(""); setBusy(true);
    const r = await fetch("/api/ai/build", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: next.map((m) => ({ role: m.role, content: m.content })), current: html }) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {};
    setBusy(false);
    if (!r || !r.ok) { setErr(d.error || "Modo Builder couldn't finish. Check your connection and try again."); return; }
    const done = [...next, { role: "assistant", content: d.html ? d.note : d.reply || d.note, built: !!d.html }];
    setMsgs(done);
    if (d.html) { setHtml(d.html); setView("preview"); setPane("preview"); save(done, d.html, id); }
  }

  function fresh() { setMsgs([]); setHtml(""); setId(null); setErr(""); setPane("chat"); box.current?.focus(); }
  function openBuild(b) { setMsgs(b.msgs || []); setHtml(b.html); setId(b.id); setOpen(false); setView("preview"); setPane("preview"); }
  function remove(b) { const list = load().filter((x) => x.id !== b.id); store(list); setBuilds(list); if (b.id === id) fresh(); }
  function copy() { navigator.clipboard?.writeText(html).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }
  function download() {
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    a.download = titleOf(html).replace(/[^\w\- ]+/g, "").replace(/\s+/g, "-").toLowerCase() + ".html"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  function full() { const u = URL.createObjectURL(new Blob([html], { type: "text/html" })); window.open(u, "_blank"); setTimeout(() => URL.revokeObjectURL(u), 60000); }

  return (
    <div className="bld">
      <div className="bld-tabs">
        <button className={pane === "chat" ? "" : "ghost"} onClick={() => setPane("chat")}>Chat</button>
        <button className={pane === "preview" ? "" : "ghost"} onClick={() => setPane("preview")} disabled={!html}>Preview</button>
      </div>

      <div className={"bld-chat panel" + (pane === "chat" ? " on" : "")}>
        <div className="bld-top">
          <b><Wand2 size={16} /> AI Builder</b>
          <span style={{ flex: 1 }} />
          <div className="bld-menu">
            <button className="ghost sm" onClick={() => setOpen((o) => !o)}><FolderOpen size={14} /> My builds{builds.length ? ` (${builds.length})` : ""}</button>
            {open && (
              <div className="bld-list">
                {builds.length === 0 && <p className="muted small" style={{ margin: 8 }}>Nothing saved yet. Your builds appear here automatically.</p>}
                {builds.map((b) => (
                  <div key={b.id} className={"bld-item" + (b.id === id ? " cur" : "")}>
                    <button className="ghost sm" onClick={() => openBuild(b)}>{b.title}<span className="muted small"> · {new Date(b.at).toLocaleDateString()}</span></button>
                    <button className="ghost sm" title="Delete" onClick={() => remove(b)}><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button className="ghost sm" onClick={fresh}><Plus size={14} /> New</button>
        </div>

        <div className="bld-body">
          {msgs.length === 0 && (
            <div className="ai-hello">
              <span className="ai-orb"><Wand2 size={26} /></span>
              <h2><Wand2 size={17} /> What should I build?</h2>
              <p className="muted">Describe any app, tool, page or game. It runs live right here, and you can keep chatting to change it.</p>
              <div className="ai-prompts">{IDEAS.map((p) => <button key={p} className="ghost" onClick={() => ask(p)}>{p}</button>)}</div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={"ai-msg " + m.role}>
              <div className="ai-bubble" style={{ whiteSpace: "pre-wrap" }}>
                {m.content}
                {m.built && <div><button className="ghost sm" style={{ marginTop: 8 }} onClick={() => setPane("preview")}><Eye size={13} /> View build</button></div>}
              </div>
            </div>
          ))}
          {busy && <div className="ai-msg assistant"><div className="ai-bubble muted">Building… bigger apps can take up to a minute.</div></div>}
          {err && <p className="err small" style={{ margin: 0 }}>{err}</p>}
          <div ref={end} />
        </div>

        <form className="bld-input" onSubmit={(e) => { e.preventDefault(); ask(); }}>
          <textarea ref={box} rows={2} value={text} onChange={(e) => setText(e.target.value)} disabled={busy}
            placeholder={html ? "Ask for a change, e.g. “make the buttons green and add a reset button”" : "Describe what to build…"}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }} />
          <button disabled={busy || !text.trim()} aria-label="Send"><Send size={16} /></button>
        </form>
      </div>

      <div className={"bld-stage panel" + (pane === "preview" ? " on" : "")}>
        <div className="bld-top">
          <div className="bld-seg">
            <button className={view === "preview" ? "sm" : "ghost sm"} onClick={() => setView("preview")}><Eye size={14} /> Preview</button>
            <button className={view === "code" ? "sm" : "ghost sm"} onClick={() => setView("code")} disabled={!html}><Code2 size={14} /> Code</button>
          </div>
          <span style={{ flex: 1 }} />
          <button className="ghost sm" onClick={copy} disabled={!html} title="Copy code">{copied ? <Check size={14} /> : <Copy size={14} />}</button>
          <button className="ghost sm" onClick={download} disabled={!html} title="Download .html"><Download size={14} /></button>
          <button className="ghost sm" onClick={full} disabled={!html} title="Open full screen"><Maximize2 size={14} /></button>
        </div>
        {!html ? (
          <div className="bld-empty muted">Your build will run here.</div>
        ) : view === "preview" ? (
          <iframe key={html.length + (id || "")} className="bld-frame" title="Build preview" srcDoc={html}
            sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads" />
        ) : (
          <pre className="bld-code"><code>{html}</code></pre>
        )}
      </div>
    </div>
  );
}
