"use client";
// Modo Pad — the agent scratchpad (full page and the floating Notepad).
// Pages with colour tabs, one-tap checklists, a customer template, time stamps, search, and a "found in your notes"
// strip that turns every phone number, ZIP, order number, email and tracking number into a one-tap copy.
// Plus "My speech": the admin's speech for the agent's campaign, with practice.
// Saved to the account (padText) as plain text with "=== Page ===" headers, so admins and the coach can still read it.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clock, Copy, Check, Download, Type, Trash2, Plus, Search, SquareCheck, UserRound, Megaphone, X, ChevronDown, ChevronUp, Phone, Mail, MapPin, Package, Hash, Cloud, CloudOff } from "lucide-react";
import SpeechPractice from "./SpeechPractice";

const COLORS = ["#8b5cf6", "#22d3ee", "#f59e0b", "#10b981", "#f43f5e", "#3b82f6", "#eab308", "#ec4899"];
const HEAD = /^=== (.{1,40}) ===$/;
const LS = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
const SAVE = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

export function parsePad(text) {
  const lines = String(text || "").split("\n"); const pages = []; let cur = null;
  for (const l of lines) {
    const m = l.match(HEAD);
    if (m) { cur = { name: m[1].trim(), body: [] }; pages.push(cur); continue; }
    if (!cur) { cur = { name: "Notes", body: [] }; pages.push(cur); }
    cur.body.push(l);
  }
  const out = pages.map((p) => ({ name: p.name, text: p.body.join("\n").replace(/^\n+|\n+$/g, "") }));
  return out.length ? out : [{ name: "Notes", text: "" }];
}
export function joinPad(pages) {
  if (pages.length === 1 && pages[0].name === "Notes") return pages[0].text;
  return pages.map((p) => `=== ${p.name} ===\n${p.text}`).join("\n\n");
}

// Things worth copying in one tap.
function findBits(text) {
  const t = String(text || ""); const out = []; const seen = new Set();
  const add = (kind, val, show) => { const k = kind + val; if (!seen.has(k)) { seen.add(k); out.push({ kind, val, show: show || val }); } };
  for (const m of t.matchAll(/\b1Z[0-9A-Z]{16}\b/gi)) add("track", m[0].toUpperCase());
  for (const m of t.matchAll(/(?:\+?1[\s.-]?)?\(?\b([2-9]\d{2})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})\b/g)) add("phone", m[1] + m[2] + m[3], `(${m[1]}) ${m[2]}-${m[3]}`);
  for (const m of t.matchAll(/[\w.+-]+@[\w-]+\.[\w.]{2,}/g)) add("email", m[0]);
  for (const m of t.matchAll(/\b(?:zip|zipcode|zip code)\s*[:#-]?\s*(\d{5})\b/gi)) add("zip", m[1]);
  for (const m of t.matchAll(/(?:order|ord|#)\s*[:#-]?\s*([A-Z]{0,4}\d[A-Z0-9-]{4,})/gi)) if (!/^1Z/i.test(m[1]) && m[1].replace(/\D/g, "").length < 10) add("order", m[1].toUpperCase());
  return out.slice(0, 24);
}
const BIT_ICON = { phone: Phone, email: Mail, zip: MapPin, order: Hash, track: Package };

export default function ModoPad({ compact = false }) {
  const [pages, setPages] = useState(null); const [cur, setCur] = useState(0);
  const [state, setState] = useState(""); const [big, setBig] = useState(false); const [copied, setCopied] = useState("");
  const [find, setFind] = useState(null); const [renaming, setRenaming] = useState(null);
  const [speeches, setSpeeches] = useState([]); const [showSpeech, setShowSpeech] = useState(false); const [openSp, setOpenSp] = useState(null);
  const [bitsOpen, setBitsOpen] = useState(true);
  const box = useRef(null); const armed = useRef(false);

  useEffect(() => {
    setBig(!!LS("modo-notes-big", false)); setBitsOpen(LS("modo-pad-bits", true) !== false);
    fetch("/api/me/pad", { cache: "no-store" }).then((r) => (r.ok ? r.json() : Promise.reject())).then((d) => { const p = parsePad(d.text || ""); setPages(p); setCur(Math.min(LS("modo-pad-page", 0), p.length - 1)); })
      .catch(() => setPages(parsePad(LS("modo-notes-local", ""))));
    fetch("/api/ai/speeches", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => d && setSpeeches((d.list || []).filter((s) => s.active !== false && s.text))).catch(() => {});
  }, []);

  const text = pages ? joinPad(pages) : null;
  useEffect(() => {
    if (text === null) return;
    if (!armed.current) { armed.current = true; return; } // don't re-save what we just loaded
    setState("saving"); SAVE("modo-notes-local", text);
    const t = setTimeout(async () => {
      const r = await fetch("/api/me/pad", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) }).catch(() => null);
      setState(r && r.ok ? "saved" : "local");
    }, 700);
    return () => clearTimeout(t);
  }, [text]);
  useEffect(() => { SAVE("modo-pad-page", cur); }, [cur]);

  const page = pages?.[cur];
  const setText = useCallback((v) => setPages((ps) => ps.map((p, i) => (i === cur ? { ...p, text: v } : p))), [cur]);
  const insert = (ins) => {
    const el = box.current; const v = page.text; const at = el ? el.selectionStart : v.length;
    const s = (at && v[at - 1] !== "\n" ? "\n" : "") + ins; setText(v.slice(0, at) + s + v.slice(at));
    setTimeout(() => { el?.focus(); const p = at + s.length; el?.setSelectionRange(p, p); }, 0);
  };
  const stamp = () => insert(`— ${new Date().toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} — `);
  const template = () => insert("👤 Name: \n📞 Phone: \n📍 ZIP: \n🧾 Order #: \n📝 Notes: \n⏰ Callback: \n");
  // ☐ → ☑ → plain line
  const toggleCheck = (pos) => {
    const el = box.current; const v = page.text; const at = pos ?? (el ? el.selectionStart : 0);
    const ls = v.lastIndexOf("\n", at - 1) + 1; const line = v.slice(ls);
    const next = line.startsWith("☐ ") ? "☑ " + line.slice(2) : line.startsWith("☑ ") ? line.slice(2) : "☐ " + line;
    setText(v.slice(0, ls) + next);
    setTimeout(() => { el?.focus(); const p = Math.max(ls, at + (next.length - line.length)); el?.setSelectionRange(p, p); }, 0);
  };
  const onClickText = (e) => { // tap a ☐ to tick it
    const el = e.currentTarget; if (el.selectionStart !== el.selectionEnd) return;
    const v = page.text; const at = el.selectionStart; const ls = v.lastIndexOf("\n", at - 1) + 1;
    if (at - ls <= 1 && (v[ls] === "☐" || v[ls] === "☑")) {
      const rest = v.slice(ls + 1); setText(v.slice(0, ls) + (v[ls] === "☐" ? "☑" : "☐") + rest);
      setTimeout(() => el.setSelectionRange(at, at), 0);
    }
  };
  const onKey = (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "d") { e.preventDefault(); stamp(); }
    else if (mod && e.key === "Enter") { e.preventDefault(); toggleCheck(); }
    else if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); template(); }
    else if (mod && e.key.toLowerCase() === "f" && !compact) { e.preventDefault(); setFind(""); }
    else if (e.key === "Enter" && !e.shiftKey) { // keep a checklist going
      const v = page.text; const at = e.currentTarget.selectionStart; const ls = v.lastIndexOf("\n", at - 1) + 1; const line = v.slice(ls, at);
      if (/^[☐☑] \S/.test(line)) { e.preventDefault(); const ins = "\n☐ "; setText(v.slice(0, at) + ins + v.slice(at)); const el = e.currentTarget; setTimeout(() => el.setSelectionRange(at + 3, at + 3), 0); }
      else if (/^[☐☑] $/.test(line)) { e.preventDefault(); setText(v.slice(0, ls) + v.slice(at)); const el = e.currentTarget; setTimeout(() => el.setSelectionRange(ls, ls), 0); }
    }
  };
  const doFind = (dir = 1) => {
    if (!find) return; const el = box.current; const v = page.text.toLowerCase(); const q = find.toLowerCase();
    let i = dir > 0 ? v.indexOf(q, (el?.selectionEnd || 0)) : v.lastIndexOf(q, Math.max(0, (el?.selectionStart || 0) - 1));
    if (i < 0) i = dir > 0 ? v.indexOf(q) : v.lastIndexOf(q);
    if (i >= 0 && el) { el.focus(); el.setSelectionRange(i, i + q.length); const lh = parseFloat(getComputedStyle(el).lineHeight) || 22; el.scrollTop = Math.max(0, (v.slice(0, i).split("\n").length - 3) * lh); }
  };
  const copy = async (val, key) => { try { await navigator.clipboard.writeText(val); setCopied(key); setTimeout(() => setCopied(""), 1200); } catch {} };
  const download = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text || ""], { type: "text/plain" })); a.download = `modo-notes-${new Date().toISOString().slice(0, 10)}.txt`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
  const addPage = () => { const n = pages.length + 1; const name = ["Notes", "Callbacks", "Numbers", "Scripts", "To do"][pages.length] || "Page " + n; setPages([...pages, { name, text: name === "To do" ? "☐ " : "" }]); setCur(pages.length); setShowSpeech(false); };
  const delPage = (i) => { if (pages.length === 1) { if (pages[0].text && confirm("Clear this page?")) setText(""); return; } if (pages[i].text.trim() && !confirm(`Delete the page “${pages[i].name}” and everything on it?`)) return; const n = pages.filter((_, j) => j !== i); setPages(n); setCur(Math.max(0, Math.min(cur, n.length - 1))); };
  const rename = (i, name) => { const v = String(name || "").replace(/=+/g, "").trim().slice(0, 40) || pages[i].name; setPages(pages.map((p, j) => (j === i ? { ...p, name: v } : p))); setRenaming(null); };

  const bits = useMemo(() => (page ? findBits(page.text) : []), [page]);
  const words = page?.text.trim() ? page.text.trim().split(/\s+/).length : 0;
  const todo = page ? { open: (page.text.match(/^☐ /gm) || []).length, done: (page.text.match(/^☑ /gm) || []).length } : { open: 0, done: 0 };
  if (!pages) return <p className="muted small">Loading your notes…</p>;

  return (
    <div className={"mp" + (compact ? " compact" : "")}>
      <div className="mp-tabs" role="tablist">
        {pages.map((p, i) => (
          <span key={i} className={"mp-tab" + (!showSpeech && i === cur ? " on" : "")} style={{ "--c": COLORS[i % COLORS.length] }}>
            {renaming === i ? (
              <input autoFocus defaultValue={p.name} onBlur={(e) => rename(i, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") rename(i, e.target.value); if (e.key === "Escape") setRenaming(null); }} aria-label="Page name" />
            ) : (
              <button role="tab" aria-selected={!showSpeech && i === cur} className="mp-b" onClick={() => { setCur(i); setShowSpeech(false); }} onDoubleClick={() => setRenaming(i)} title="Double-click to rename">{p.name}</button>
            )}
            {!showSpeech && i === cur && pages.length > 1 && <button className="mp-b mp-x" onClick={() => delPage(i)} aria-label={"Delete page " + p.name}><X size={11} /></button>}
          </span>
        ))}
        <button className="mp-b mp-add" onClick={addPage} title="New page" aria-label="New page"><Plus size={14} /></button>
        {speeches.length > 0 && <button className={"mp-b mp-speech" + (showSpeech ? " on" : "")} onClick={() => setShowSpeech(!showSpeech)}><Megaphone size={13} /> My speech</button>}
      </div>

      {showSpeech ? (
        <div className="mp-speeches">
          {speeches.map((s) => (
            <article key={s.id} className="mp-sp">
              <header><b>{s.title}</b><small>{s.campaign || "All campaigns"}</small><button className="ghost sm" onClick={() => copy(s.text, "sp" + s.id)}>{copied === "sp" + s.id ? <Check size={13} /> : <Copy size={13} />} Copy</button></header>
              <div className="mp-sp-text">{s.text}</div>
              {(s.dos || s.donts) && <div className="mp-sp-rules">{s.dos && <p><b>✅ Always:</b> {s.dos}</p>}{s.donts && <p><b>⛔ Never:</b> {s.donts}</p>}</div>}
              <button className="ghost sm" onClick={() => setOpenSp(openSp === s.id ? null : s.id)}>🎯 {openSp === s.id ? "Close practice" : "Practise it — Modo scores you"}</button>
              {openSp === s.id && <SpeechPractice speech={s} />}
            </article>
          ))}
        </div>
      ) : (
        <>
          <div className="mp-bar">
            <button className="ghost sm" onClick={stamp} title="Insert date & time (Ctrl+D)"><Clock size={13} />{!compact && " Time"}</button>
            <button className="ghost sm" onClick={() => toggleCheck()} title="Checklist line (Ctrl+Enter)"><SquareCheck size={13} />{!compact && " Checklist"}</button>
            <button className="ghost sm" onClick={template} title="Customer template (Ctrl+K)"><UserRound size={13} />{!compact && " Customer"}</button>
            <button className="ghost sm" onClick={() => setFind(find === null ? "" : null)} title="Find (Ctrl+F)"><Search size={13} /></button>
            <button className="ghost sm" onClick={() => copy(page.text, "page")} title="Copy this page">{copied === "page" ? <Check size={13} /> : <Copy size={13} />}</button>
            <button className="ghost sm" onClick={download} title="Download all pages (.txt)"><Download size={13} /></button>
            <button className="ghost sm" onClick={() => { const b = !big; setBig(b); SAVE("modo-notes-big", b); }} title="Bigger text"><Type size={13} /></button>
            <button className="ghost sm" onClick={() => delPage(cur)} title={pages.length > 1 ? "Delete page" : "Clear page"}><Trash2 size={13} /></button>
          </div>
          {find !== null && (
            <div className="mp-find"><Search size={13} /><input autoFocus value={find} onChange={(e) => setFind(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") doFind(e.shiftKey ? -1 : 1); if (e.key === "Escape") setFind(null); }} placeholder="Find on this page — Enter for next" />
              <button className="ghost sm icon-btn" onClick={() => doFind(-1)} aria-label="Previous"><ChevronUp size={13} /></button><button className="ghost sm icon-btn" onClick={() => doFind(1)} aria-label="Next"><ChevronDown size={13} /></button><button className="ghost sm icon-btn" onClick={() => setFind(null)} aria-label="Close find"><X size={13} /></button></div>
          )}
          <textarea ref={box} className={"mp-text" + (big ? " big" : "")} style={{ "--c": COLORS[cur % COLORS.length] }} value={page.text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} onClick={onClickText} spellCheck
            placeholder={"Type anything — numbers, callbacks, what the customer said…\n\n☐ Tap Checklist for a to-do line (tap the box to tick it)\n👤 Customer adds a ready template\nPhone numbers, ZIPs and order numbers you type appear below — tap to copy."} />
          {bits.length > 0 && (
            <div className="mp-bits">
              <button className="mp-b mp-bits-h" onClick={() => { setBitsOpen(!bitsOpen); SAVE("modo-pad-bits", !bitsOpen); }}>Tap to copy · {bits.length}{bitsOpen ? <ChevronDown size={12} /> : <ChevronUp size={12} />}</button>
              {bitsOpen && <div className="mp-chips">{bits.map((b) => { const I = BIT_ICON[b.kind]; const k = b.kind + b.val; return <button key={k} className={"mp-chip " + b.kind + (copied === k ? " done" : "")} onClick={() => copy(b.val, k)} title={"Copy " + b.val}>{copied === k ? <Check size={12} /> : <I size={12} />}{b.show}</button>; })}</div>}
            </div>
          )}
          <div className="mp-foot">
            <span>{state === "local" ? <><CloudOff size={12} /> Saved on this device</> : state === "saving" ? <><Cloud size={12} /> Saving…</> : <><Cloud size={12} /> Saved to your account</>}</span>
            <span>{words} words{todo.open + todo.done ? ` · ☑ ${todo.done}/${todo.open + todo.done}` : ""}{!compact && " · Ctrl+D time · Ctrl+Enter ☐ · Ctrl+K customer"}</span>
          </div>
        </>
      )}
    </div>
  );
}
