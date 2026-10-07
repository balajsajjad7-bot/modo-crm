"use client";
// Admin → AI → Campaign speeches: write, paste, upload or record the pitch for every campaign.
// Modo AI is trained on them (live call assist, call tools, agent bot, Modo AI chat, pitch practice) and
// each agent sees their own campaign's speech in their scratchpad.
import { useEffect, useMemo, useState } from "react";
import { Mic, Plus, Save, Trash2, Upload, Check, Ban, Sparkles, FileText, Star, GraduationCap } from "lucide-react";
import VoiceRecord from "@/components/VoiceRecord";
import SpeechPractice from "@/components/SpeechPractice";
import SpeechView from "@/components/SpeechView";

const api = (url, method = "GET", body) => fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" }).then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }));
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export default function SpeechesPage() {
  const [list, setList] = useState(null); const [camps, setCamps] = useState([]); const [sel, setSel] = useState(null);
  const [msg, setMsg] = useState(""); const [dirty, setDirty] = useState(false);
  const [seeds, setSeeds] = useState([]); const [scores, setScores] = useState({}); const [agents, setAgents] = useState([]);
  useEffect(() => { api("/api/ai/speeches").then((r) => { if (!r.ok) return setMsg(r.data.error); setList(r.data.list); setCamps(r.data.campaigns); setSel(r.data.list[0]?.id || null); setSeeds(r.data.seeds || []); setScores(r.data.scores || {}); setAgents(r.data.agents || []); }); }, []);
  useEffect(() => { const w = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ""; } }; window.addEventListener("beforeunload", w); return () => window.removeEventListener("beforeunload", w); }, [dirty]);
  const cur = list?.find((s) => s.id === sel);
  const grouped = useMemo(() => {
    const g = {}; (list || []).forEach((s) => { const k = s.campaignId || ""; (g[k] = g[k] || []).push(s); }); return g;
  }, [list]);
  if (!list) return <p className="muted">{msg || "Loading…"}</p>;

  const upd = (patch) => { setList(list.map((s) => (s.id === sel ? { ...s, ...patch, dirty: true } : s))); setDirty(true); };
  const add = (campaignId = "") => { const s = { id: newId(), campaignId, title: "Main pitch", text: "", dos: "", donts: "", active: true, dirty: true }; setList([...list, s]); setSel(s.id); setDirty(true); };
  const del = (id) => { if (!confirm("Delete this speech?")) return; const next = list.filter((s) => s.id !== id); setList(next); setSel(next[0]?.id || null); setDirty(true); };
  const save = async () => { const r = await api("/api/ai/speeches", "PUT", { list }); if (!r.ok) return setMsg(r.data.error || "Couldn't save"); setList(r.data.list); setDirty(false); setMsg("Saved — Modo AI uses it from now on."); setTimeout(() => setMsg(""), 3000); };
  const upload = async (f) => { if (!f) return; if (/^audio\//.test(f.type)) { setMsg("Turning the recording into text…"); const fd = new FormData(); fd.set("audio", f); const r = await fetch("/api/ai/speeches/transcribe", { method: "POST", body: fd }).then(async (x) => ({ ok: x.ok, d: await x.json().catch(() => ({})) })); setMsg(r.ok ? "" : r.d.error); if (r.ok) upd({ text: ((cur.text || "") + (cur.text ? "\n\n" : "") + r.d.text).trim() }); return; }
    if (!/text|markdown|csv/.test(f.type) && !/\.(txt|md)$/i.test(f.name)) return setMsg("Upload a .txt file or an audio recording — or copy the text from Word and paste it in.");
    upd({ text: ((cur.text || "") + (cur.text ? "\n\n" : "") + (await f.text())).trim() }); };
  const missingSeeds = seeds.filter((x) => !list.some((y) => y.id === x.id));
  const addSeed = (x) => { setList([{ ...x, dirty: true }, ...list]); setSel(x.id); setDirty(true); };
  const campName = (id) => camps.find((c) => c.id === id)?.name || "All campaigns";
  const words = cur?.text?.trim() ? cur.text.trim().split(/\s+/).length : 0;

  return (
    <div className="stack">
      <section className="panel stack">
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <h2 className="row" style={{ gap: 8, margin: 0 }}><Mic size={18} /> Campaign speeches</h2>
          <div className="row" style={{ gap: 8 }}>{msg && <span className="small muted">{msg}</span>}<button onClick={save} disabled={!dirty}><Save size={14} /> {dirty ? "Save speeches" : "Saved"}</button></div>
        </div>
        <p className="muted small" style={{ margin: 0 }}>Give Modo your pitch for each campaign — type it, paste it, upload it, or just <b>record yourself saying it</b>. Modo AI learns it: live call assist, the call tools, every agent's Modo bot and Modo AI coach agents to say it your way. Agents see their own campaign's speech in their scratchpad and can practise it there — Modo scores them against your speech.</p>
      </section>

      <div className="sp-admin">
        <aside className="panel sp-side">
          {[["", "All campaigns"], ...camps.map((c) => [c.id, c.name, c.color])].map(([id, name, color]) => (
            <div key={id || "all"} className="sp-group">
              <div className="sp-gh"><i style={{ background: color || "rgb(var(--p))" }} />{name}<button className="ghost sm icon-btn" title={"New speech for " + name} aria-label={"New speech for " + name} onClick={() => add(id)}><Plus size={13} /></button></div>
              {(grouped[id] || []).map((s) => (
                <button key={s.id} className={"sp-item" + (s.id === sel ? " on" : "") + (s.active ? "" : " off")} data-plain onClick={() => setSel(s.id)}>
                  {s.priority ? <Star size={13} className="sp-star" /> : <FileText size={13} />}<span>{s.title || "Untitled"}</span>{s.dirty && <small>•</small>}
                </button>
              ))}
            </div>
          ))}
          {missingSeeds.map((x) => <button key={x.id} className="ghost sm" onClick={() => addSeed(x)}><Sparkles size={13} /> Add Modo's {x.campaign} speech</button>)}
          {!camps.length && <p className="muted small">Add your campaigns (Budget Ease, US Campaign…) in Team → Departments & campaigns to give each its own speech.</p>}
        </aside>

        {cur ? (
          <section className="panel stack sp-edit">
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <select value={cur.campaignId || ""} onChange={(e) => upd({ campaignId: e.target.value })} style={{ maxWidth: 220 }} aria-label="Campaign">
                <option value="">All campaigns</option>{camps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <input value={cur.title} onChange={(e) => upd({ title: e.target.value })} placeholder="Title — e.g. Opening & pitch, Closing, Rebuttals" style={{ flex: 1, minWidth: 180 }} />
              <label className="row" style={{ gap: 6, flexWrap: "nowrap", color: "var(--foreground)" }}>Use it<button role="switch" aria-checked={cur.active} className={"toggle" + (cur.active ? " on" : "")} onClick={() => upd({ active: !cur.active })}><span /></button></label>
            </div>
            <button className={"sp-prio" + (cur.priority ? " on" : "")} data-plain onClick={() => upd({ priority: !cur.priority })} aria-pressed={!!cur.priority}>
              <Star size={15} /><span><b>{cur.priority ? "Top priority — on" : "Make it top priority"}</b><small>Every agent sees it first in their scratchpad, and Modo AI coaches it on every call.</small></span>
            </button>
            {cur.builtIn && <p className="small muted" style={{ margin: 0 }}>✨ Modo wrote this one. Replace the [brackets] with your company and offer, add your own lines, then Save — your words always win.</p>}
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              <VoiceRecord label="Record the speech" onText={(t) => upd({ text: ((cur.text || "") + (cur.text ? "\n\n" : "") + t).trim() })} />
              <label className="btn-link" style={{ cursor: "pointer" }}><Upload size={13} /> Upload .txt or audio<input type="file" accept=".txt,.md,text/plain,audio/*" hidden onChange={(e) => { upload(e.target.files[0]); e.target.value = ""; }} /></label>
              <span className="small muted" style={{ marginLeft: "auto" }}>{words} words · ~{Math.max(1, Math.round(words / 140))} min to say</span>
            </div>
            <textarea className="sp-text" value={cur.text} onChange={(e) => upd({ text: e.target.value })}
              placeholder={"Write the speech exactly the way agents should say it.\n\nHi, this is [name] calling from … about your …\n\nDiscovery: …\nPitch: …\nClose: …"} />
            <div className="sp-rules">
              <label><span className="row" style={{ gap: 6 }}><Check size={14} style={{ color: "var(--green)" }} /> Always say / do</span><textarea value={cur.dos} onChange={(e) => upd({ dos: e.target.value })} placeholder="e.g. Confirm the ZIP code. Say the call may be recorded. Smile — they can hear it." /></label>
              <label><span className="row" style={{ gap: 6 }}><Ban size={14} style={{ color: "var(--red)" }} /> Never say / do</span><textarea value={cur.donts} onChange={(e) => upd({ donts: e.target.value })} placeholder="e.g. Never say we are Verizon. Never promise a free phone. Never read out the website." /></label>
            </div>
            <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <span className="small muted">{campName(cur.campaignId)} · {cur.updatedAt && !cur.dirty ? "saved " + new Date(cur.updatedAt).toLocaleDateString() : "not saved yet"}</span>
              <button className="ghost sm" onClick={() => del(cur.id)}><Trash2 size={13} /> Delete</button>
            </div>
            {cur.text.trim().length > 40 && <details className="sp-try"><summary><Sparkles size={14} /> Preview — how agents see it</summary><div style={{ marginTop: 10 }}><SpeechView speech={cur} /></div></details>}
            <Progress speech={cur} scores={scores[cur.id] || {}} agents={agents} camps={camps} />
            {!cur.dirty && cur.text.trim().length > 40 && (
              <details className="sp-try"><summary><Sparkles size={14} /> Try it like an agent would</summary><SpeechPractice speech={cur} /></details>
            )}
          </section>
        ) : (
          <section className="panel sp-edit wai-empty"><Mic size={36} /><b>No speeches yet</b><span className="muted small">Press + next to a campaign to add its speech.</span><button onClick={() => add(camps[0]?.id || "")}><Plus size={14} /> Add the first speech</button></section>
        )}
      </div>
    </div>
  );
}

// Who has practised this speech and how well (best score from "Practise it").
function Progress({ speech, scores, agents, camps }) {
  const who = speech.priority || !speech.campaignId ? agents : agents.filter((a) => a.campaignId === speech.campaignId);
  if (!who.length) return null;
  const rows = who.map((a) => ({ ...a, sc: scores[a.id] || null })).sort((x, y) => (y.sc?.best ?? -1) - (x.sc?.best ?? -1));
  const done = rows.filter((r) => r.sc && r.sc.best >= 80).length;
  return (
    <details className="sp-progress" open>
      <summary><GraduationCap size={15} /> Agents trained: <b>{done}/{rows.length}</b> scored 80+ <span className="muted small">· {rows.filter((r) => !r.sc).length} haven't practised yet</span></summary>
      <div className="sp-prog-list">
        {rows.map((r) => (
          <div key={r.id} className="sp-prog">
            <span className="ellipsis">{r.name}{camps.length > 1 && r.campaignId ? <small> · {camps.find((c) => c.id === r.campaignId)?.name || ""}</small> : null}</span>
            {r.sc ? <><i className="sp-meter"><i style={{ width: r.sc.best + "%", background: r.sc.best >= 80 ? "var(--green)" : r.sc.best >= 55 ? "var(--amber)" : "var(--red)" }} /></i><b>{r.sc.best}</b><small>{r.sc.count}×</small></>
              : <em>not yet</em>}
          </div>
        ))}
      </div>
    </details>
  );
}
