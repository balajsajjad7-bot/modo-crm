"use client";
// Team → Hiring & interviews: candidates, the Modo English Assessment (Fluency Score 20–80 + CEFR),
// answer review with recordings, interview slots and Zoom interviews.
import { useEffect, useRef, useState } from "react";
import WaButton from "@/components/WaButton";
import { UserPlus, Link2, Copy, Mail, Video, CalendarPlus, CalendarClock, Settings2, Users, GraduationCap, CheckCircle2, XCircle, PauseCircle, Trash2, RefreshCw, ChevronDown, Star, Headphones, AlertTriangle, ExternalLink, Clock3, Briefcase, Plus, FileText, Sparkles, UploadCloud, Loader2 } from "lucide-react";

const api = (url, method = "GET", body) => fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" }).then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }));
const when = (t) => new Date(t).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const copy = (t, say) => { navigator.clipboard?.writeText(t).then(() => say("✓ Copied"), () => say("Couldn't copy")); };
const ST = { invited: ["Invited", "#64748b"], testing: ["Taking test", "#0ea5e9"], tested: ["Tested", "#8b5cf6"], interview: ["Interview", "#f59e0b"], hired: ["Hired", "#10b981"], rejected: ["Rejected", "#ef4444"], "on hold": ["On hold", "#94a3b8"] };
const SKILL = { speaking: "Speaking", listening: "Listening", reading: "Reading", writing: "Writing", fluency: "Fluency", pronunciation: "Pronunciation" };
const CEFR_TEXT = { A1: "Beginner", A2: "Elementary", B1: "Intermediate", B2: "Upper-intermediate", C1: "Advanced", C2: "Near-native" };
const toLocalInput = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };

export default function Hiring() {
  const [d, setD] = useState(null); const [tab, setTab] = useState("candidates"); const [msg, setMsg] = useState("");
  const [adding, setAdding] = useState(false); const [open, setOpen] = useState(null); const [filter, setFilter] = useState("all");
  const load = () => api("/api/hiring").then((r) => (r.ok ? setD(r.data) : setMsg(r.data.error)));
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);
  const say = (t) => { setMsg(t); setTimeout(() => setMsg(""), 4000); };
  const act = async (body, ok) => { const r = await api("/api/hiring", "POST", body); if (r.ok) { if (ok) say(ok); if (r.data.warn) say("⚠️ " + r.data.warn); load(); } else say(r.data.error); return r; };
  if (!d) return <p className="muted">{msg || "Loading hiring…"}</p>;
  const origin = typeof location !== "undefined" ? location.origin : "";
  const link = (c) => `${origin}/test/${c.token}`;
  const C = d.candidates;
  const upcoming = C.flatMap((c) => (c.interviews || []).filter((iv) => iv.status === "scheduled").map((iv) => ({ c, iv }))).sort((a, b) => new Date(a.iv.at) - new Date(b.iv.at));
  const tested = C.filter((c) => c.result);
  const shown = C.filter((c) => filter === "all" || (filter === "passed" ? c.result?.pass : c.status === filter));

  return (
    <div className="stack">
      <div className="hr-kpis">
        <div><span className="gt gt-sm" style={{ "--g1": "#7dd3fc", "--g2": "#0284c7" }}><Users size={17} /></span><b>{C.length}</b><small>candidates</small></div>
        <div><span className="gt gt-sm" style={{ "--g1": "#a78bfa", "--g2": "#7c3aed" }}><GraduationCap size={17} /></span><b>{tested.length}</b><small>tested · {tested.filter((c) => c.result.pass).length} passed</small></div>
        <div><span className="gt gt-sm" style={{ "--g1": "#fcd34d", "--g2": "#d97706" }}><Video size={17} /></span><b>{upcoming.filter((x) => new Date(x.iv.at) > Date.now() - 3600000).length}</b><small>interviews coming up</small></div>
        <div><span className="gt gt-sm" style={{ "--g1": "#34d399", "--g2": "#059669" }}><CheckCircle2 size={17} /></span><b>{C.filter((c) => c.status === "hired").length}</b><small>hired</small></div>
      </div>
      <div className="sb-tabs">
        {[["candidates", "Candidates", Users], ["interviews", "Interviews", Video], ["slots", "Interview times", CalendarClock], ["settings", "Settings & Zoom", Settings2]].map(([k, l, I]) => <button key={k} className={tab === k ? "on" : "ghost"} onClick={() => setTab(k)}><I size={14} /> {l}</button>)}
        <a className="sb-link" href="/apply" target="_blank" rel="noreferrer"><ExternalLink size={13} /> Public apply page</a>
      </div>
      {msg && <div className="small">{msg}</div>}

      {tab === "candidates" && (
        <section className="panel stack">
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <h2><Users size={17} /> Candidates</h2>
            <span className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              <select style={{ width: "auto" }} value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All ({C.length})</option><option value="passed">Passed the test</option>{Object.entries(ST).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
              <button onClick={() => setAdding(!adding)}><UserPlus size={14} /> Add candidate</button>
            </span>
          </div>
          {adding && <AddForm tracks={d.tracks} onAdd={async (cand) => { const r = await act({ action: "add", candidate: cand }); if (r.ok) { setAdding(false); setOpen(r.data.candidate.id); copy(link(r.data.candidate), () => say("✓ Candidate added — test link copied. Send it on WhatsApp or email.")); } }} />}
          <div className="hr-list">
            {shown.map((c) => <Cand key={c.id} c={c} d={d} open={open === c.id} toggle={() => setOpen(open === c.id ? null : c.id)} link={link(c)} act={act} say={say} />)}
            {!shown.length && <p className="muted small">No candidates yet. Add one, or share your public apply page: <b>{origin}/apply</b></p>}
          </div>
        </section>
      )}

      {tab === "interviews" && (
        <section className="panel stack">
          <h2><Video size={17} /> Upcoming interviews</h2>
          <div className="hr-list">
            {upcoming.map(({ c, iv }) => (
              <div key={iv.id} className={"hr-iv" + (new Date(iv.at) < Date.now() ? " past" : "")}>
                <span className="gt gt-sm" style={{ "--g1": "#93c5fd", "--g2": "#2563eb" }}><Video size={16} /></span>
                <span className="hr-ivwho"><b>{c.name}</b><small>{when(iv.at)} · {iv.mins} min{iv.interviewer ? " · " + iv.interviewer : ""}{c.result ? ` · test ${c.result.score}/80 ${c.result.cefr}` : ""}</small></span>
                <span className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                  <a className="btn-link sm" href={iv.zoom?.startUrl || iv.zoom?.joinUrl} target="_blank" rel="noreferrer"><Video size={13} /> Start Zoom</a>
                  <button className="ghost sm" onClick={() => copy(iv.invite, say)}><Copy size={13} /> Invite</button>
                  {c.phone && <WaButton phone={c.phone} name={c.name} text={iv.invite} label="Send invite" />}
                  <button className="ghost sm" onClick={() => { setTab("candidates"); setOpen(c.id); }}>Open</button>
                </span>
              </div>
            ))}
            {!upcoming.length && <p className="muted small">No interviews booked. Schedule one from a candidate, or add interview times so passing candidates book themselves.</p>}
          </div>
        </section>
      )}

      {tab === "slots" && <Slots d={d} act={act} />}
      {tab === "settings" && <SettingsBox d={d} act={act} say={say} origin={origin} />}
    </div>
  );
}

function AddForm({ tracks, onAdd }) {
  const [f, setF] = useState({ name: "", email: "", phone: "", track: "support", position: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="sb-form">
      <label>Name<input value={f.name} onChange={set("name")} /></label>
      <label>Phone / WhatsApp<input value={f.phone} onChange={set("phone")} placeholder="03xx…" /></label>
      <label>Email<input type="email" value={f.email} onChange={set("email")} /></label>
      <label>Test<select value={f.track} onChange={set("track")}>{Object.entries(tracks).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <label className="sb-wide">Position (optional)<input value={f.position} onChange={set("position")} placeholder="e.g. US Campaign — night shift" /></label>
      <div className="sb-wide"><button onClick={() => f.name.trim() && onAdd(f)} disabled={!f.name.trim()}><UserPlus size={14} /> Add and copy test link</button></div>
    </div>
  );
}

function Cand({ c, d, open, toggle, link, act, say }) {
  const r = c.result; const [s, col] = ST[c.status] || [c.status, "#64748b"];
  const next = (c.interviews || []).filter((iv) => iv.status === "scheduled").sort((a, b) => new Date(a.at) - new Date(b.at))[0];
  const testMsg = `Hi ${c.name.split(" ")[0]}, thanks for applying to ${d.settings.company || "Modo"}! Please take your Modo English Assessment (about 30 minutes) here:\n${link}\n\nOpen the link in Google Chrome (not inside WhatsApp), use a headset and a quiet place. You can also send us your resume from that page. The link works for ${d.settings.linkDays || 7} days.`;
  return (
    <div className={"hr-cand" + (open ? " open" : "")}>
      <button type="button" data-plain className="hr-head" onClick={toggle}>
        <span className="hr-av">{c.name.split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase()}</span>
        <span className="hr-who"><b>{c.name}</b><small>{d.tracks[c.track]}{c.cvBrief ? " · " + c.cvBrief.headline : c.cv ? " · 📄 resume" : ""}{c.source === "apply" ? " · applied online" : ""}{next ? " · 🎥 " + when(next.at) : ""}</small></span>
        {r ? <span className={"hr-score " + (r.pass ? "pass" : "fail")}><b>{r.score}</b><small>/80 · {r.cefr}</small></span> : <span className="hr-score none"><small>no test yet</small></span>}
        <span className="hr-st" style={{ "--c": col }}>{s}</span>
        <ChevronDown size={16} className="cp-chev" />
      </button>
      {open && (
        <div className="hr-body stack">
          <div className="hr-contact">
            {c.phone && <a href={"tel:" + c.phone}>{c.phone}</a>}{c.email && <a href={"mailto:" + c.email}>{c.email}</a>}{c.position && <span>{c.position}</span>}
            <span className="muted">Added {when(c.createdAt)}</span>
          </div>
          {c.notes && <p className="small" style={{ margin: 0 }}>{c.notes}</p>}

          <ResumeBox c={c} say={say} />

          <div className="hr-box">
            <b><Link2 size={14} /> Test link</b>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              <button className="ghost sm" onClick={() => copy(link, say)}><Copy size={13} /> Copy link</button>
              {c.phone && <WaButton phone={c.phone} name={c.name} text={testMsg} label="Send on WhatsApp" />}
              {c.email && <a className="btn-link ghost sm" href={`mailto:${c.email}?subject=${encodeURIComponent((d.settings.company || "Modo") + " English test")}&body=${encodeURIComponent(testMsg)}`}><Mail size={13} /> Email</a>}
              <button className="ghost sm" onClick={() => act({ action: "update", id: c.id, patch: { newLink: true } }, "✓ New link made — the old one stops working")}><RefreshCw size={13} /> New link</button>
              {r && <button className="ghost sm" onClick={() => confirm("Delete their answers and let them take the test again?") && act({ action: "update", id: c.id, patch: { resetTest: true } }, "✓ Test reset")}><RefreshCw size={13} /> Retake</button>}
            </div>
            {!r && <small className="muted">Link valid until {when(c.expiresAt)}.</small>}
          </div>

          {r && <Result c={c} r={r} />}

          <Interviews c={c} d={d} act={act} say={say} />

          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            <button className="sm" onClick={() => act({ action: "update", id: c.id, patch: { status: "hired" } }, `✓ ${c.name} marked hired — add them in Team → Agents`)}><CheckCircle2 size={13} /> Hire</button>
            <button className="ghost sm" onClick={() => act({ action: "update", id: c.id, patch: { status: "on hold" } })}><PauseCircle size={13} /> On hold</button>
            <button className="ghost sm danger" onClick={() => act({ action: "update", id: c.id, patch: { status: "rejected" } })}><XCircle size={13} /> Reject</button>
            <button className="ghost sm icon-btn" title="Delete candidate" onClick={() => confirm(`Delete ${c.name} and their test?`) && act({ action: "delete", id: c.id })}><Trash2 size={13} /></button>
          </div>
        </div>
      )}
    </div>
  );
}

function ResumeBox({ c, say }) {
  const [busy, setBusy] = useState(""); const [local, setLocal] = useState(null); const ref = useRef(null);
  const b = local?.brief || c.cvBrief; const cv = local?.info || c.cv; const bErr = local ? local.err : c.cvBriefErr;
  const upload = async (file) => {
    if (!file) return; setBusy("up"); const fd = new FormData(); fd.set("id", c.id); fd.set("file", file);
    const r = await fetch("/api/hiring/cv", { method: "POST", body: fd }).then(async (x) => ({ ok: x.ok, d: await x.json().catch(() => ({})) }));
    setBusy(""); if (r.ok) { setLocal({ info: r.d.info, brief: r.d.brief, err: r.d.err }); say("✓ Resume saved" + (r.d.brief ? " and briefed" : "")); } else say(r.d.error);
  };
  const brief = async () => { setBusy("ai"); const r = await api("/api/hiring/cv", "POST", { id: c.id, action: "brief" }); setBusy(""); if (r.ok) setLocal({ info: cv, brief: r.data.brief, err: "" }); else say(r.data.error); };
  return (
    <div className="hr-box hr-cv">
      <div className="row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <b><FileText size={14} /> Resume</b>
        <span className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          {cv && <a className="btn-link ghost sm" href={`/api/hiring/cv?id=${c.id}`} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Open {cv.name?.split(".").pop()?.toUpperCase()}</a>}
          {cv && <button className="ghost sm" disabled={!!busy} onClick={brief}>{busy === "ai" ? <Loader2 size={13} className="spin" /> : <Sparkles size={13} />} {b ? "Brief again" : "Brief it with AI"}</button>}
          <input ref={ref} type="file" hidden accept=".pdf,.docx,.txt,.jpg,.jpeg,.png" onChange={(e) => upload(e.target.files?.[0])} />
          <button className="ghost sm" disabled={!!busy} onClick={() => ref.current?.click()}>{busy === "up" ? <Loader2 size={13} className="spin" /> : <UploadCloud size={13} />} {cv ? "Replace" : "Upload resume"}</button>
        </span>
      </div>
      {!cv && <small className="muted">No resume yet. Candidates can attach one when they apply or after their assessment, or upload it here.</small>}
      {busy === "up" && <small className="muted">Reading the resume with Modo AI…</small>}
      {b ? (
        <div className="hr-brief">
          <div className="hr-brief-top"><span className="hr-brief-ic"><Sparkles size={15} /></span><b>{b.headline}</b><span className="hr-fit" title={b.fitWhy}>{"★".repeat(b.fit)}<i>{"★".repeat(5 - b.fit)}</i></span></div>
          <div className="hr-brief-grid">
            {b.experience && <div><small>Experience</small><span>{b.experience}</span></div>}
            {b.callCenter && <div><small>Call center</small><span>{b.callCenter}</span></div>}
            {b.education && <div><small>Education</small><span>{b.education}</span></div>}
            {b.languages && <div><small>Languages</small><span>{b.languages}</span></div>}
          </div>
          {!!b.skills?.length && <div className="hr-tags">{b.skills.map((x) => <em key={x}>{x}</em>)}</div>}
          <div className="hr-pc">
            {!!b.strengths?.length && <ul className="pro">{b.strengths.map((x) => <li key={x}>{x}</li>)}</ul>}
            {!!b.concerns?.length && <ul className="con">{b.concerns.map((x) => <li key={x}>{x}</li>)}</ul>}
          </div>
          {b.fitWhy && <small className="muted">Fit: {b.fitWhy}</small>}
        </div>
      ) : cv && bErr ? <small className="hr-warn"><AlertTriangle size={13} /> {bErr}</small> : null}
    </div>
  );
}

function Result({ c, r }) {
  const [rev, setRev] = useState(null); const [show, setShow] = useState(false);
  const loadRev = async () => { setShow(!show); if (!rev) { const x = await api("/api/hiring/test?id=" + c.id); if (x.ok) setRev(x.data); } };
  return (
    <div className="hr-box">
      <div className="hr-res">
        <div className={"hr-big " + (r.pass ? "pass" : "fail")}><b>{r.score}</b><small>of 80</small></div>
        <div><b>CEFR {r.cefr}</b> · {CEFR_TEXT[r.cefr]}<br /><span className={r.pass ? "hr-pass" : "hr-fail"}>{r.pass ? "✅ Passed the pass mark" : "❌ Below the pass mark"}</span>
          <small className="muted" style={{ display: "block" }}>Finished {when(r.finishedAt)}{r.flags?.mins != null ? ` · took ${r.flags.mins} min` : ""}</small></div>
      </div>
      <div className="hr-skills">{Object.entries(SKILL).map(([k, l]) => r.skills?.[k] != null && <div key={k}><span>{l}</span><i><em style={{ width: ((r.skills[k] - 20) / 60) * 100 + "%" }} /></i><b>{r.skills[k]}</b></div>)}</div>
      {(r.flags?.tab > 0 || r.flags?.paste > 0) && <p className="hr-warn"><AlertTriangle size={13} /> Left the test page {r.flags.tab} time(s){r.flags.paste ? ` · tried to paste ${r.flags.paste} time(s)` : ""}.</p>}
      {r.needsReview && <p className="hr-warn"><Headphones size={13} /> Some spoken answers couldn't be turned into text (no Groq AI key). Listen to them below.</p>}
      {r.feedback?.speak && <p className="small" style={{ margin: 0 }}><b>Role-play:</b> {r.feedback.speak}</p>}
      {r.feedback?.write && <p className="small" style={{ margin: 0 }}><b>Email:</b> {r.feedback.write}</p>}
      <button className="ghost sm" onClick={loadRev}><Headphones size={13} /> {show ? "Hide answers" : "Review every answer & listen"}</button>
      {show && (rev ? <Review c={c} rev={rev} /> : <p className="muted small">Loading answers…</p>)}
    </div>
  );
}

function Review({ c, rev }) {
  const title = Object.fromEntries(rev.sections.map((s) => [s.key, s.title]));
  return (
    <div className="hr-rev">
      {rev.items.map((it) => (
        <div key={it.id} className="hr-q">
          <div className="row" style={{ justifyContent: "space-between", gap: 8 }}><small className="muted">{title[it.section]}</small>{it.mark != null && <span className={"hr-mark " + (it.mark >= 70 ? "g" : it.mark >= 40 ? "y" : "r")}>{it.mark}%</span>}</div>
          <div className="small"><b>{it.q || it.prompt || (it.type === "speak-build" ? "Build: " + it.parts.join(" / ") : "Target: " + it.text)}</b></div>
          {it.type === "choice-audio" && <small className="muted">Call: {it.audio}</small>}
          {it.type?.startsWith("choice") && <div className="small">Answered: <b>{it.ans ? it.options[it.ans.choice] : "—"}</b>{it.ans?.choice !== it.answer && <> · right answer: {it.options[it.answer]}</>}</div>}
          {it.type?.startsWith("speak") && (it.ans ? <>
            <audio controls preload="none" src={`/api/hiring/audio?id=${c.id}&item=${it.id}`} />
            <div className="small">Heard: <i>{it.ans.transcript ?? "(not transcribed)"}</i>{it.ans.secs ? ` · ${it.ans.secs}s` : ""}</div>
            {it.type === "speak-build" && <small className="muted">Correct: {it.answer}</small>}
          </> : <small className="muted">No answer</small>)}
          {(it.type === "type-audio" || it.type === "essay") && <div className="small hr-pre">{it.ans?.text || "—"}</div>}
        </div>
      ))}
    </div>
  );
}

function Interviews({ c, d, act, say }) {
  const s = d.settings;
  const [f, setF] = useState({ at: toLocalInput(Date.now() + 86400000), mins: s.mins || 30, interviewer: s.interviewer || "", link: "" });
  const [show, setShow] = useState(false); const [busy, setBusy] = useState(false);
  const list = [...(c.interviews || [])].sort((a, b) => new Date(b.at) - new Date(a.at));
  const zoomMode = s.zoom?.clientId && s.zoom?.hasSecret ? "auto" : s.zoomLink ? "personal" : "none";
  return (
    <div className="hr-box">
      <div className="row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
        <b><Video size={14} /> Zoom interviews</b>
        <button className="ghost sm" onClick={() => setShow(!show)}><CalendarPlus size={13} /> Schedule interview</button>
      </div>
      {show && (
        <div className="sb-form">
          <label>Date & time<input type="datetime-local" value={f.at} onChange={(e) => setF({ ...f, at: e.target.value })} /></label>
          <label>Minutes<input type="number" min="10" max="180" value={f.mins} onChange={(e) => setF({ ...f, mins: e.target.value })} /></label>
          <label>Interviewer<input value={f.interviewer} onChange={(e) => setF({ ...f, interviewer: e.target.value })} /></label>
          <label className="sb-wide">Zoom link {zoomMode === "auto" ? "(blank = Modo creates a new Zoom meeting)" : zoomMode === "personal" ? "(blank = your saved Zoom link)" : "(paste one, or save yours in Settings & Zoom)"}<input value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} placeholder="https://us05web.zoom.us/j/…" /></label>
          <div className="sb-wide"><button disabled={busy} onClick={async () => { setBusy(true); const r = await act({ action: "schedule", id: c.id, interview: { ...f, at: new Date(f.at).toISOString() } }, "✓ Interview booked — send the invite"); setBusy(false); if (r.ok) setShow(false); }}><Video size={14} /> {busy ? "Booking…" : "Book interview"}</button></div>
        </div>
      )}
      {list.map((iv) => (
        <div key={iv.id} className={"hr-ivrow st-" + iv.status}>
          <div className="row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <span><b>{when(iv.at)}</b> · {iv.mins} min{iv.interviewer ? " · " + iv.interviewer : ""} <span className="hr-ivst">{iv.status}</span></span>
            {iv.status === "scheduled" && <span className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              <a className="btn-link sm" href={iv.zoom?.startUrl || iv.zoom?.joinUrl} target="_blank" rel="noreferrer"><Video size={13} /> Start Zoom</a>
              <button className="ghost sm" onClick={() => copy(iv.invite, say)}><Copy size={13} /> Copy invite</button>
              {c.phone && <WaButton phone={c.phone} name={c.name} text={iv.invite} label="Send invite" />}
              {c.email && <a className="btn-link ghost sm" href={`mailto:${c.email}?subject=${encodeURIComponent("Your interview with " + (s.company || "Modo"))}&body=${encodeURIComponent(iv.invite)}`}><Mail size={13} /> Email</a>}
              <a className="btn-link ghost sm" href={iv.cal} target="_blank" rel="noreferrer"><CalendarPlus size={13} /> Calendar</a>
            </span>}
          </div>
          <div className="row" style={{ gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {iv.status === "scheduled" && <>
              <button className="ghost sm" onClick={() => act({ action: "interview", id: c.id, ivId: iv.id, patch: { status: "done" } })}><CheckCircle2 size={13} /> Done</button>
              <button className="ghost sm" onClick={() => act({ action: "interview", id: c.id, ivId: iv.id, patch: { status: "no-show" } })}><Clock3 size={13} /> No-show</button>
              <button className="ghost sm danger" onClick={() => confirm("Cancel this interview?") && act({ action: "interview", id: c.id, ivId: iv.id, patch: { status: "cancelled" } })}><XCircle size={13} /> Cancel</button>
            </>}
            <span className="hr-stars">{[1, 2, 3, 4, 5].map((n) => <button data-plain key={n} title={n + " stars"} className={(iv.rating || 0) >= n ? "on" : ""} onClick={() => act({ action: "interview", id: c.id, ivId: iv.id, patch: { rating: n } })}><Star size={15} /></button>)}</span>
          </div>
          {iv.status === "scheduled" && !iv.zoom?.joinUrl && <LinkBox onSave={(link) => act({ action: "interview", id: c.id, ivId: iv.id, patch: { link } }, "✓ Zoom link added — send the invite again")} />}
          <NoteBox value={iv.notes || ""} onSave={(notes) => act({ action: "interview", id: c.id, ivId: iv.id, patch: { notes } }, "✓ Notes saved")} />
        </div>
      ))}
      {!list.length && <small className="muted">No interview yet.{c.result?.pass ? " They passed — they can also book one of your open interview times from their test page." : ""}</small>}
    </div>
  );
}

function LinkBox({ onSave }) {
  const [v, setV] = useState("");
  return <div className="cp-reply"><input value={v} onChange={(e) => setV(e.target.value)} placeholder="No Zoom link yet — paste it here (https://…zoom.us/j/…)" /><button className="sm" disabled={!v.trim()} onClick={() => onSave(v.trim())}><Video size={13} /> Add link</button></div>;
}

function NoteBox({ value, onSave }) {
  const [v, setV] = useState(value);
  return <div className="cp-reply"><input value={v} onChange={(e) => setV(e.target.value)} placeholder="Interview notes: communication, attitude, availability…" /><button className="sm ghost" disabled={v === value} onClick={() => onSave(v)}>Save</button></div>;
}

function Slots({ d, act }) {
  const [f, setF] = useState({ day: new Date(Date.now() + 86400000).toISOString().slice(0, 10), from: "15:00", to: "18:00", every: 30 });
  const add = () => {
    const out = []; const [fh, fm] = f.from.split(":").map(Number); const [th, tm] = f.to.split(":").map(Number);
    const start = new Date(`${f.day}T00:00`); start.setHours(fh, fm, 0, 0); const end = new Date(`${f.day}T00:00`); end.setHours(th, tm, 0, 0);
    for (let t = start.getTime(); t < end.getTime(); t += Math.max(10, Number(f.every) || 30) * 60000) out.push(new Date(t).toISOString());
    if (out.length) act({ action: "slots", slots: out }, `✓ ${out.length} interview times added`);
  };
  const name = Object.fromEntries(d.candidates.map((c) => [c.id, c.name]));
  const days = {}; d.slots.forEach((s) => { const k = new Date(s.at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }); (days[k] = days[k] || []).push(s); });
  return (
    <section className="panel stack">
      <h2><CalendarClock size={17} /> Interview times</h2>
      <p className="muted small" style={{ margin: 0 }}>Add the times you're free. A candidate who <b>passes</b> the English test picks one straight from their test page, and the Zoom link is made for them.</p>
      <div className="sb-form">
        <label>Day<input type="date" value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} /></label>
        <label>From<input type="time" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
        <label>To<input type="time" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
        <label>Every (minutes)<input type="number" min="10" value={f.every} onChange={(e) => setF({ ...f, every: e.target.value })} /></label>
        <div className="sb-wide"><button onClick={add}><Plus size={14} /> Add times</button></div>
      </div>
      <div className="hr-days">
        {Object.entries(days).map(([k, list]) => (
          <div key={k}><b>{k}</b><div>{list.map((s) => <span key={s.id} className={"hr-slot" + (s.bookedBy ? " booked" : "")} title={s.bookedBy ? "Booked by " + (name[s.bookedBy] || "a candidate") : "Open"}>
            {new Date(s.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}{s.bookedBy ? " · " + (name[s.bookedBy] || "booked").split(" ")[0] : <button data-plain title="Remove" onClick={() => act({ action: "slotDel", slotId: s.id })}>×</button>}
          </span>)}</div></div>
        ))}
        {!d.slots.length && <p className="muted small">No times added yet.</p>}
      </div>
    </section>
  );
}

function SettingsBox({ d, act, say, origin }) {
  const s = d.settings;
  const [f, setF] = useState({ company: s.company, interviewer: s.interviewer, mins: s.mins, linkDays: s.linkDays, applyOpen: s.applyOpen !== false, passMark: { ...s.passMark }, zoomLink: s.zoomLink, zoom: { accountId: s.zoom?.accountId || "", clientId: s.zoom?.clientId || "", clientSecret: "" } });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <section className="panel stack">
      <h2><Settings2 size={17} /> Settings & Zoom</h2>
      <div className="sb-form">
        <label>Company name (shown to candidates)<input value={f.company} onChange={set("company")} /></label>
        <label>Default interviewer<input value={f.interviewer} onChange={set("interviewer")} /></label>
        <label>Interview length (minutes)<input type="number" value={f.mins} onChange={set("mins")} /></label>
        <label>Pass mark — customer service (20–80)<input type="number" min="20" max="80" value={f.passMark.support} onChange={(e) => setF({ ...f, passMark: { ...f.passMark, support: e.target.value } })} /></label>
        <label>Pass mark — outreaching (20–80)<input type="number" min="20" max="80" value={f.passMark.outreach} onChange={(e) => setF({ ...f, passMark: { ...f.passMark, outreach: e.target.value } })} /></label>
        <label>Test link works for (days)<input type="number" value={f.linkDays} onChange={set("linkDays")} /></label>
        <label className="sb-wide row" style={{ gap: 8, alignItems: "center" }}><input type="checkbox" style={{ width: "auto" }} checked={f.applyOpen} onChange={(e) => setF({ ...f, applyOpen: e.target.checked })} /> Public apply page is open ({origin}/apply)</label>
      </div>
      <p className="muted small" style={{ margin: 0 }}>Modo Fluency Score guide (20–80 ≈ CEFR): 30–46 A2 · 47–57 B1 · <b>58–68 B2</b> (good for US customer service) · 69–78 C1 · 79–80 C2. Use it as a strong guide alongside the interview — it's Modo's own assessment, not an external certificate.</p>
      <h3 style={{ margin: "8px 0 0" }}><Video size={16} /> Zoom</h3>
      <div className="sb-form">
        <label className="sb-wide">Your Zoom meeting link (used for every interview)<input value={f.zoomLink} onChange={set("zoomLink")} placeholder="https://us05web.zoom.us/j/1234567890?pwd=…" /></label>
      </div>
      <details className="hr-zoomkeys">
        <summary>Optional: a new Zoom meeting for every interview (Zoom app keys)</summary>
        <p className="muted small">In Zoom's App Marketplace → Develop → Build App → <b>Server-to-Server OAuth</b>, add the scope <b>meeting:write:admin</b>, activate it, then paste the 3 values here.</p>
        <div className="sb-form">
          <label>Account ID<input value={f.zoom.accountId} onChange={(e) => setF({ ...f, zoom: { ...f.zoom, accountId: e.target.value } })} /></label>
          <label>Client ID<input value={f.zoom.clientId} onChange={(e) => setF({ ...f, zoom: { ...f.zoom, clientId: e.target.value } })} /></label>
          <label>Client secret<input type="password" value={f.zoom.clientSecret} onChange={(e) => setF({ ...f, zoom: { ...f.zoom, clientSecret: e.target.value } })} placeholder={s.zoom?.hasSecret ? "saved — leave blank to keep" : ""} /></label>
        </div>
        <button className="ghost sm" onClick={async () => { const r = await api("/api/hiring", "POST", { action: "zoomTest" }); say(r.ok ? "✓ Zoom connected" : r.data.error); }}><Video size={13} /> Test Zoom connection</button>
      </details>
      <div><button onClick={() => act({ action: "settings", settings: f }, "✓ Settings saved")}><Briefcase size={14} /> Save settings</button></div>
    </section>
  );
}
