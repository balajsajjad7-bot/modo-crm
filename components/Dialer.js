"use client";
// Modo dialer: a clean front for VICIdial. VICIdial keeps running (in its own tab) and does the calling;
// Modo drives it through VICIdial's Agent API and adds the customer's history, lookups and AI.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Lookups from "@/components/Lookups";
import AiButton from "@/components/AiButton";
import CallAI from "@/components/CallAI";
import RecentCalls from "@/components/RecentCalls";
import { PhoneStatus } from "@/components/Softphone";
import VicidialScreen from "@/components/VicidialScreen";
import { Phone, PhoneOff, Pause, Play, ParkingCircle, ArrowRightLeft, Circle, ExternalLink, Delete, User, MapPin, Mail, StickyNote, Mic, CheckCircle2, AlertCircle, Loader2, Zap, SkipForward, Square } from "lucide-react";

const post = (b) => fetch("/api/dialer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) }));
const fmt = (p) => { const d = String(p || "").replace(/\D/g, "").slice(0, 10); return d.length < 4 ? d : d.length < 7 ? `(${d.slice(0, 3)}) ${d.slice(3)}` : `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`; };
const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const LOOK = { READY: ["Ready", "ready"], QUEUE: ["Ringing", "call"], INCALL: ["On a call", "call"], CLOSER: ["On a call", "call"], PAUSED: ["Paused", "paused"], DEAD: ["Call ended", "dead"], DISPO: ["Wrap-up", "dead"] };

function ModoControls({ admin = false }) {
  const [st, setSt] = useState(null); const [num, setNum] = useState(""); const [busy, setBusy] = useState(""); const [toast, setToast] = useState(null);
  const [since, setSince] = useState(Date.now()); const [now, setNow] = useState(Date.now()); const lastStatus = useRef(null);
  const [pauseCode, setPauseCode] = useState(""); const [xfer, setXfer] = useState(false); const [xNum, setXNum] = useState(""); const [rec, setRec] = useState(false);
  const [note, setNote] = useState(""); const [dispo, setDispo] = useState(""); const [cbAt, setCbAt] = useState(""); const wrapPhone = useRef(""); const wrapName = useRef("");
  const load = useCallback(() => fetch("/api/dialer", { cache: "no-store" }).then((r) => r.json()).then((d) => {
    setSt(d);
    if (d.status !== lastStatus.current) { lastStatus.current = d.status; setSince(Date.now()); }
    if (d.phone) { wrapPhone.current = d.phone; wrapName.current = d.lead?.name || d.contact?.name || ""; }
  }).catch(() => {}), []);
  // Poll fast only while it matters: 2s when logged in, 8s when not logged in / erroring, 15s when the tab is hidden.
  const stRef = useRef(null); stRef.current = st;
  useEffect(() => {
    let t; let alive = true;
    const tick = async () => { await load(); if (!alive) return; const x = stRef.current; const ms = document.hidden ? 15000 : !x || x.error || !x.loggedIn ? 8000 : 2000; t = setTimeout(tick, ms); };
    tick(); const c = setInterval(() => setNow(Date.now()), 1000);
    const vis = () => { if (!document.hidden) { clearTimeout(t); tick(); } };
    document.addEventListener("visibilitychange", vis);
    return () => { alive = false; clearTimeout(t); clearInterval(c); document.removeEventListener("visibilitychange", vis); };
  }, [load]);
  // Auto mode: after you save a result, Modo dials the next lead by itself (after a short countdown you can stop).
  const [auto, setAuto] = useState(false); const [count, setCount] = useState(0); const autoT = useRef(null);
  useEffect(() => { try { setAuto(localStorage.getItem("modo-autodial") === "1"); } catch {} }, []);
  const setAutoOn = (on) => { setAuto(on); try { localStorage.setItem("modo-autodial", on ? "1" : "0"); } catch {} if (!on) stopCount(); };
  const stopCount = () => { clearInterval(autoT.current); setCount(0); };
  const startCount = () => { stopCount(); let n = 3; setCount(n); autoT.current = setInterval(() => { n -= 1; setCount(n); if (n <= 0) { clearInterval(autoT.current); act("next", {}, "Dialing next lead…"); } }, 1000); };
  const say = (ok, text) => { setToast({ ok, text }); setTimeout(() => setToast(null), 3500); };
  async function act(action, extra = {}, label) {
    setBusy(action); const r = await post({ action, ...extra }); setBusy("");
    if (!r.ok) return say(false, r.d.error || "VICIdial didn't answer."); if (label) say(true, label); load(); return true;
  }
  const status = st?.status || ""; const [label, tone] = LOOK[status] || [st?.loggedIn ? status || "…" : "Not logged in", "off"];
  const inCall = ["INCALL", "QUEUE", "CLOSER"].includes(status);
  const phone = st?.phone || ""; const zip = st?.lead?.zip;
  const openVici = () => st?.agentUrl && window.open(st.agentUrl, "vicidial", "width=1100,height=760");
  const key = (k) => { if (inCall) act("dtmf", { digits: k }); else setNum((n) => (n + k).replace(/\D/g, "").slice(0, 11)); };
  async function wrap() {
    const d = st.dispositions.find((x) => x.code === dispo); if (!d) return say(false, "Pick a result first.");
    if (d.code === "CALLBK" && !cbAt) return say(false, "Pick the callback time.");
    const ok = await act("dispo", { code: d.code, label: d.label, note, callbackAt: d.code === "CALLBK" ? cbAt : undefined, phone: phone || wrapPhone.current, name: wrapName.current }, `Saved: ${d.label}`);
    if (ok) { setNote(""); setDispo(""); setCbAt(""); setCalls((k) => k + 1); if (auto) startCount(); }
  }
  const [calls, setCalls] = useState(0);

  if (!st) return <p className="muted">Connecting to the dialer…</p>;
  if (st.setup) return <section className="panel"><AlertCircle size={18} /> {st.setup}</section>;
  return (
    <div className="dialer">
      <section className={"panel dl-status " + tone}>
        <div className="dl-pill"><span className="dl-dot" />{label}{st.pauseCode && status === "PAUSED" ? ` · ${st.pauseCode}` : ""}</div>
        <div className="dl-timer num">{clock(Math.max(0, Math.floor((now - since) / 1000)))}</div>
        <div className="dl-meta"><span>{st.campaign || "—"}</span><span>{st.callsToday || 0} calls today</span><span className="muted">VICIdial user {st.vu}</span></div>
        <div className="row" style={{ marginLeft: "auto" }}>
          <label className="auto-sw" title="After you save a result, Modo dials the next lead automatically">
            <button role="switch" aria-checked={auto} className={"toggle" + (auto ? " on" : "")} onClick={() => setAutoOn(!auto)}><span /></button><span><Zap size={13} /> Auto-dial</span></label>
          <button className="ghost" onClick={() => act("next", {}, "Dialing next lead…")} disabled={!!busy || !st.loggedIn || inCall}><SkipForward size={14} /> Next lead</button>
          {!admin && <Link href="/agent/call" className="btn-link"><Mic size={14} /> Call assist</Link>}
          <button className="ghost" onClick={openVici} disabled={!st.agentUrl}><ExternalLink size={14} /> {st.loggedIn ? "Show VICIdial" : "Open VICIdial & log in"}</button>
        </div>
      </section>
      <PhoneStatus />
      {count > 0 && <section className="panel dl-hint auto-count"><Zap size={18} /><div><b>Next lead in {count}…</b> Auto-dial is on.</div><button className="ghost sm" onClick={stopCount}><Square size={12} /> Stop</button></section>}
      {!st.loggedIn && st.warming && <section className="panel dl-hint"><Loader2 size={18} className="spin" /><div><b>Connecting to your dialer…</b> It's letting Modo's server through its firewall; this can take up to a minute after Modo updates. No need to do anything.</div></section>}
      {!st.loggedIn && !st.warming && (
        <section className="panel dl-hint"><AlertCircle size={18} /><div><b>Log into VICIdial first.</b> Press “Open VICIdial & log in”, sign in with your phone and campaign, then leave that window open in the background. This screen takes over from there.{st.error && <div className="err small" style={{ marginTop: 6 }}>{st.error}</div>}</div></section>
      )}

      <div className="dl-grid">
        {/* Phone */}
        <section className="panel stack dl-phone">
          <div className="dl-num">
            <input value={inCall ? fmt(phone) : fmt(num)} onChange={(e) => setNum(e.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="Enter a number" inputMode="tel" aria-label="Phone number" readOnly={inCall} onKeyDown={(e) => e.key === "Enter" && !inCall && num && act("dial", { number: num }, "Dialing…")} />
            {!inCall && num && <button className="ghost sm icon-btn" aria-label="Delete digit" onClick={() => setNum(num.slice(0, -1))}><Delete size={15} /></button>}
          </div>
          <div className="dl-keys">{["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map((k) => <button key={k} onClick={() => key(k)} aria-label={k}>{k}</button>)}</div>
          <span className="small muted" style={{ textAlign: "center" }}>{inCall ? "Keys send tones to the call (menus, extensions)" : "Type or paste a number, or let VICIdial dial the next lead"}</span>
          {inCall
            ? <button className="dl-big hang" onClick={() => act("hangup", {}, "Hung up")} disabled={!!busy}>{busy === "hangup" ? <Loader2 className="spin" size={18} /> : <PhoneOff size={18} />} Hang up</button>
            : <button className="dl-big call" onClick={() => act("dial", { number: num }, "Dialing…")} disabled={!!busy || !st.loggedIn || num.replace(/\D/g, "").length < 10}>{busy === "dial" ? <Loader2 className="spin" size={18} /> : <Phone size={18} />} Call</button>}
          <div className="dl-actions">
            {status === "PAUSED"
              ? <button className="ghost" onClick={() => act("resume", {}, "You're ready for calls")} disabled={!!busy || !st.loggedIn}><Play size={15} /> Go ready</button>
              : <span className="row" style={{ gap: 6, flexWrap: "nowrap" }}><select value={pauseCode} onChange={(e) => setPauseCode(e.target.value)} aria-label="Pause reason" style={{ padding: "6px 8px" }}><option value="">Pause reason…</option>{st.pauseCodes.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}</select>
                <button className="ghost" onClick={() => act("pause", { code: pauseCode }, "Paused")} disabled={!!busy || !st.loggedIn || inCall}><Pause size={15} /> Pause</button></span>}
            <button className="ghost" onClick={() => act(st.subStatus === "PARK" ? "grab" : "park", {}, st.subStatus === "PARK" ? "Customer back" : "Customer on hold")} disabled={!inCall}><ParkingCircle size={15} /> {st.subStatus === "PARK" ? "Take back" : "Hold"}</button>
            <button className="ghost" onClick={() => setXfer(!xfer)} disabled={!inCall}><ArrowRightLeft size={15} /> Transfer</button>
            <button className={rec ? "danger" : "ghost"} onClick={async () => { if (await act("record", { on: !rec }, rec ? "Recording stopped" : "Recording")) setRec(!rec); }} disabled={!inCall}><Circle size={13} fill={rec ? "currentColor" : "none"} /> {rec ? "Stop rec" : "Record"}</button>
          </div>
          {xfer && inCall && (
            <div className="dl-xfer stack">
              <input value={fmt(xNum)} onChange={(e) => setXNum(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="Transfer to (10 digits)" inputMode="tel" />
              <div className="row" style={{ gap: 6 }}>
                <button className="sm" onClick={() => act("transfer", { type: "blind", number: xNum }, "Transferred")}>Blind transfer</button>
                <button className="ghost sm" onClick={() => act("transfer", { type: "warm", number: xNum }, "Calling… you're on a 3-way")}>Warm (3-way)</button>
                <button className="ghost sm" onClick={() => act("transfer", { type: "leave3way" }, "You left the 3-way")}>Leave 3-way</button>
              </div>
            </div>
          )}
        </section>

        {/* Customer */}
        <section className="panel stack dl-cust">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2><User size={17} /> {st.lead?.name || st.contact?.name || (phone ? fmt(phone) : "No customer yet")}</h2>
            {st.contact && <AiButton task="brief_customer" payload={{ contactId: st.contact.id }} label="Brief me" />}
          </div>
          {phone ? (
            <div className="be-grid">
              <div><span>Phone</span><b>{fmt(phone)}</b></div>
              <div><span>Lead</span><b>{st.lead?.id ? "#" + st.lead.id : "—"}</b></div>
              {st.lead?.address && <div className="wide"><span><MapPin size={11} /> Address</span><b>{st.lead.address}{st.lead.city ? `, ${st.lead.city}` : ""}{st.lead.state ? `, ${st.lead.state}` : ""} {st.lead.zip || ""}</b></div>}
              {st.lead?.email && <div className="wide"><span><Mail size={11} /> Email</span><b>{st.lead.email}</b></div>}
              {st.lead?.comments && <div className="wide"><span>Lead comments</span><b>{st.lead.comments}</b></div>}
            </div>
          ) : <p className="muted small" style={{ margin: 0 }}>When a call connects, the customer's details, your last notes and lookups show up here automatically.</p>}
          {st.contact?.lastNote && <div className="np-last"><span className="sf-l"><StickyNote size={11} /> Last time you talked</span><p>{st.contact.lastNote.text}</p><span className="small muted">{new Date(st.contact.lastNote.at).toLocaleString()}</span></div>}
          <div className="dl-look"><span className="sf-l">Lookups</span><Lookups compact preset={phone ? { tool: "phone", q: phone } : null} /></div>
          {zip && <div className="row" style={{ gap: 6 }}><span className="small muted">Customer ZIP {zip}:</span><button className="ghost sm" onClick={() => window.dispatchEvent(new CustomEvent("modo-lookup", { detail: { tool: "weather", q: zip } }))}>Weather there</button></div>}
        </section>

        {/* Wrap-up */}
        <section className="panel stack dl-wrap">
          <h2><CheckCircle2 size={17} /> Wrap-up</h2>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened on the call? (saved to the customer in Modo)" style={{ minHeight: 110 }} />
          {note.trim().length > 15 && <AiButton task="tidy_note" payload={() => ({ text: note })} label="Tidy my note" onResult={(d) => setNote(d.text)} useLabel="Use this" inline />}
          <span className="sf-l">Result</span>
          <div className="dl-dispos">{st.dispositions.map((d) => <button key={d.code} className={dispo === d.code ? "on" : ""} onClick={() => setDispo(d.code)} aria-pressed={dispo === d.code}><b>{d.label}</b><span>{d.code}</span></button>)}</div>
          {dispo === "CALLBK" && <label>Call back at<input type="datetime-local" value={cbAt} onChange={(e) => setCbAt(e.target.value)} /></label>}
          <button onClick={wrap} disabled={!dispo || !!busy || inCall}>{busy === "dispo" ? "Saving…" : inCall ? "Hang up to save" : "Save & next call"}</button>
          <span className="small muted">Saves the result in VICIdial and the note (and any callback) in Modo.</span>
        </section>
      </div>
      <div className="dl-grid2">
        <CallAI context={{ name: st.lead?.name || st.contact?.name, phone, comments: st.lead?.comments, lastNote: st.contact?.lastNote?.text }} note={note} onNote={setNote} />
        <RecentCalls mine limit={15} title="My recent calls" refreshKey={calls} onRedial={(r) => { if (!inCall) { setNum(r.phone); window.scrollTo({ top: 0, behavior: "smooth" }); } }} />
      </div>
      {toast && <div className={"dl-toast " + (toast.ok ? "ok" : "bad")} role="status">{toast.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />} {toast.text}</div>}
    </div>
  );
}

// Two ways to dial: the real VICIdial screen inside Modo (works in your browser, past the firewall) or
// Modo's own controls (need Modo's server to reach the dialer).
export default function Dialer({ admin = false }) {
  const [mode, setMode] = useState("screen");
  useEffect(() => { try { const m = localStorage.getItem("modo-dialer-mode"); if (m) setMode(m); } catch {} }, []);
  const pick = (m) => { setMode(m); try { localStorage.setItem("modo-dialer-mode", m); } catch {} };
  return (
    <div className="stack">
      <nav className="seg" style={{ alignSelf: "flex-start" }} aria-label="Dialer view">
        <button aria-selected={mode === "screen"} onClick={() => pick("screen")}>VICIdial screen</button>
        <button aria-selected={mode === "controls"} onClick={() => pick("controls")}>Modo controls</button>
      </nav>
      {mode === "screen" ? <VicidialScreen /> : <ModoControls admin={admin} />}
    </div>
  );
}
