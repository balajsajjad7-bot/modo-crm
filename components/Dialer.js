"use client";
// Modo dialer: a clean front for VICIdial. VICIdial keeps running (in its own tab) and does the calling;
// Modo drives it through VICIdial's Agent API and adds the customer's history, lookups and AI.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Lookups from "@/components/Lookups";
import AiButton from "@/components/AiButton";
import { Phone, PhoneOff, Pause, Play, ParkingCircle, ArrowRightLeft, Circle, ExternalLink, Delete, User, MapPin, Mail, StickyNote, Mic, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

const post = (b) => fetch("/api/dialer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) }));
const fmt = (p) => { const d = String(p || "").replace(/\D/g, "").slice(0, 10); return d.length < 4 ? d : d.length < 7 ? `(${d.slice(0, 3)}) ${d.slice(3)}` : `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`; };
const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const LOOK = { READY: ["Ready", "ready"], QUEUE: ["Ringing", "call"], INCALL: ["On a call", "call"], CLOSER: ["On a call", "call"], PAUSED: ["Paused", "paused"], DEAD: ["Call ended", "dead"], DISPO: ["Wrap-up", "dead"] };

export default function Dialer() {
  const [st, setSt] = useState(null); const [num, setNum] = useState(""); const [busy, setBusy] = useState(""); const [toast, setToast] = useState(null);
  const [since, setSince] = useState(Date.now()); const [now, setNow] = useState(Date.now()); const lastStatus = useRef(null);
  const [pauseCode, setPauseCode] = useState(""); const [xfer, setXfer] = useState(false); const [xNum, setXNum] = useState(""); const [rec, setRec] = useState(false);
  const [note, setNote] = useState(""); const [dispo, setDispo] = useState(""); const [cbAt, setCbAt] = useState(""); const wrapPhone = useRef(""); const wrapName = useRef("");
  const load = useCallback(() => fetch("/api/dialer", { cache: "no-store" }).then((r) => r.json()).then((d) => {
    setSt(d);
    if (d.status !== lastStatus.current) { lastStatus.current = d.status; setSince(Date.now()); }
    if (d.phone) { wrapPhone.current = d.phone; wrapName.current = d.lead?.name || d.contact?.name || ""; }
  }).catch(() => {}), []);
  useEffect(() => { load(); const t = setInterval(load, 2000); const c = setInterval(() => setNow(Date.now()), 1000); return () => { clearInterval(t); clearInterval(c); }; }, [load]);
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
    if (ok) { setNote(""); setDispo(""); setCbAt(""); }
  }

  if (!st) return <p className="muted">Connecting to the dialer…</p>;
  if (st.setup) return <section className="panel"><AlertCircle size={18} /> {st.setup}</section>;
  return (
    <div className="dialer">
      <section className={"panel dl-status " + tone}>
        <div className="dl-pill"><span className="dl-dot" />{label}{st.pauseCode && status === "PAUSED" ? ` · ${st.pauseCode}` : ""}</div>
        <div className="dl-timer num">{clock(Math.max(0, Math.floor((now - since) / 1000)))}</div>
        <div className="dl-meta"><span>{st.campaign || "—"}</span><span>{st.callsToday || 0} calls today</span><span className="muted">VICIdial user {st.vu}</span></div>
        <div className="row" style={{ marginLeft: "auto" }}>
          <Link href="/agent/call" className="btn-link"><Mic size={14} /> Call assist</Link>
          <button className="ghost" onClick={openVici} disabled={!st.agentUrl}><ExternalLink size={14} /> {st.loggedIn ? "Show VICIdial" : "Open VICIdial & log in"}</button>
        </div>
      </section>
      {!st.loggedIn && (
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
      {toast && <div className={"dl-toast " + (toast.ok ? "ok" : "bad")} role="status">{toast.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />} {toast.text}</div>}
    </div>
  );
}
