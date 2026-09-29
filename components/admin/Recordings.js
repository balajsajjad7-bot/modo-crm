"use client";
// Admin → Call recordings: pull every agent's VICIdial recordings by day, listen, and mark QA.
import { useEffect, useState } from "react";
import { api } from "./api";
import { Search, RefreshCw, Download, AlertCircle, Star, CheckCircle2, XCircle, Save } from "lucide-react";

const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const dur = (s) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "—");
const CHECKS = ["Introduced self & company", "Said call may be recorded", "Clear price & terms", "No misleading claims", "Confirmed details", "Polite & professional"];
const OUTCOMES = ["Sale", "Callback", "Not interested", "No answer", "Do not call", "Other"];
const tone = (v) => (v >= 75 ? "ok" : v >= 50 ? "late" : "red");

function QaForm({ rec, onSaved }) {
  const init = rec.qa || {};
  let ck0 = {}; try { ck0 = typeof init.checklist === "string" ? JSON.parse(init.checklist) : (init.checklist || {}); } catch {}
  const [score, setScore] = useState(init.score ?? 80);
  const [checklist, setChecklist] = useState(ck0);
  const [notes, setNotes] = useState(init.notes || "");
  const [outcome, setOutcome] = useState(init.outcome || "");
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");
  async function save() {
    setBusy(true);
    const r = await api("/api/vicidial/recordings/qa", "POST", { recId: rec.id || rec.url, agentUser: rec.agent, callDate: rec.callDate, phone: rec.phone, url: rec.url, score, checklist, notes, outcome });
    setBusy(false); if (r.ok) { setMsg("Saved"); onSaved?.({ score, outcome, notes, checklist }); setTimeout(() => setMsg(""), 1500); } else setMsg(r.data.error || "Error");
  }
  return (
    <div className="qa-mark">
      <div className="row" style={{ gap: 6, alignItems: "center" }}>
        <b style={{ minWidth: 70 }}>Score {score}</b>
        <input type="range" min="0" max="100" value={score} onChange={(e) => setScore(+e.target.value)} style={{ flex: 1, padding: 0 }} />
      </div>
      <div className="qa-checks2">{CHECKS.map((c) => (
        <button key={c} type="button" className={"chk" + (checklist[c] ? " on" : "")} onClick={() => setChecklist({ ...checklist, [c]: !checklist[c] })}>
          {checklist[c] ? <CheckCircle2 size={13} /> : <XCircle size={13} />} {c}
        </button>
      ))}</div>
      <div className="row" style={{ gap: 6 }}>
        <select value={outcome} onChange={(e) => setOutcome(e.target.value)} style={{ maxWidth: 180 }}><option value="">Outcome…</option>{OUTCOMES.map((o) => <option key={o}>{o}</option>)}</select>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Coaching notes" style={{ flex: 1, minWidth: 160 }} />
        <button className="sm" onClick={save} disabled={busy}><Save size={13} /> {busy ? "…" : "Save QA"}</button>
        {msg && <span className="small" style={{ color: msg === "Saved" ? "var(--green)" : "var(--red)" }}>{msg}</span>}
      </div>
    </div>
  );
}

export default function Recordings() {
  const [date, setDate] = useState(iso(new Date())); const [agent, setAgent] = useState(""); const [phone, setPhone] = useState("");
  const [d, setD] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [open, setOpen] = useState(null); const [filter, setFilter] = useState("all");
  const load = async () => {
    setBusy(true); setErr(""); setD(null); setOpen(null);
    const r = await api(`/api/vicidial/recordings?date=${date}${agent ? "&agent=" + encodeURIComponent(agent) : ""}${phone ? "&phone=" + encodeURIComponent(phone) : ""}`);
    setBusy(false); if (r.ok) setD(r.data.rows.map((x) => ({ ...x, callDate: date }))); else setErr(r.data.error || "Couldn't load recordings.");
  };
  useEffect(() => { load(); }, []); // eslint-disable-line
  const rows = (d || []).filter((r) => filter === "all" || (filter === "todo" && !r.qa) || (filter === "done" && r.qa) || (filter === "low" && r.qa && r.qa.score < 50));
  function csv() {
    const head = ["Date", "Agent", "Phone", "Length(s)", "Score", "Outcome", "Reviewed by", "Notes", "URL"];
    const lines = [head, ...(d || []).map((r) => [date, r.agent || "", r.phone || "", r.seconds || "", r.qa?.score ?? "", r.qa?.outcome || "", r.qa?.reviewedBy || "", (r.qa?.notes || "").replace(/\n/g, " "), r.url])];
    const blob = new Blob([lines.map((l) => l.map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `qa-${date}.csv`; a.click();
  }
  const reviewed = (d || []).filter((r) => r.qa).length;
  return (
    <div className="stack">
      <section className="panel toolbar">
        <label style={{ maxWidth: 175 }}>Day<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label style={{ maxWidth: 165 }}>Agent (blank = all)<input value={agent} onChange={(e) => setAgent(e.target.value)} placeholder="all agents" /></label>
        <label style={{ maxWidth: 175 }}>Phone<input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="customer number" /></label>
        <button style={{ alignSelf: "flex-end" }} onClick={load} disabled={busy}><Search size={15} /> {busy ? "Loading…" : "Load recordings"}</button>
      </section>
      {err && <section className="panel err" style={{ display: "flex", gap: 10 }}><AlertCircle size={18} style={{ flexShrink: 0 }} /><div>{err}</div></section>}
      {d && (
        <>
          <div className="toolbar">
            <nav className="seg" role="tablist">{[["all", "All"], ["todo", "Not scored"], ["done", "Scored"], ["low", "Low scores"]].map(([k, l]) => <button key={k} aria-selected={filter === k} onClick={() => setFilter(k)}>{l}</button>)}</nav>
            <span className="muted small" style={{ alignSelf: "center" }}>{reviewed}/{d.length} scored</span>
            <button className="ghost" style={{ marginLeft: "auto", alignSelf: "center" }} onClick={csv} disabled={!d.length}><Download size={14} /> Export QA (CSV)</button>
            <button className="ghost icon-btn" onClick={load} aria-label="Refresh"><RefreshCw size={14} /></button>
          </div>
          <section className="stack">
            {!rows.length && <div className="panel muted">{d.length ? "Nothing matches this filter." : "No recordings for this day. If your VICIdial connector isn't connected yet, connect it in Tools → Connectors → VICIdial first."}</div>}
            {rows.map((r, i) => {
              const rid = r.id || r.url;
              return (
                <article key={rid || i} className="panel rec-row">
                  <div className="rec-head">
                    <div style={{ minWidth: 0 }}>
                      <b>{r.agent || "Agent"}</b> <span className="muted small">{r.phone || ""}{r.start ? " · " + r.start : ""} · {dur(r.seconds)}</span>
                    </div>
                    {r.qa ? <span className={"chip " + tone(r.qa.score)}><Star size={11} /> {r.qa.score}{r.qa.outcome ? " · " + r.qa.outcome : ""}</span> : <span className="chip">not scored</span>}
                    <button className={open === rid ? "sm" : "ghost sm"} onClick={() => setOpen(open === rid ? null : rid)}>{open === rid ? "Close" : r.qa ? "Edit QA" : "Mark QA"}</button>
                  </div>
                  <audio controls preload="none" src={r.url} style={{ width: "100%", height: 36, marginTop: 4 }} />
                  {open === rid && <QaForm rec={r} onSaved={(qa) => setD((cur) => cur.map((x) => ((x.id || x.url) === rid ? { ...x, qa: { ...qa, reviewedBy: "you" } } : x)))} />}
                </article>
              );
            })}
          </section>
        </>
      )}
      <p className="muted small">Recordings stream from your VICIdial server, so your browser must reach it. QA scores are saved in Modo. Tip: use the “Not scored” filter to work through a day’s calls.</p>
    </div>
  );
}
