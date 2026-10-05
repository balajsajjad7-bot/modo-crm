"use client";
// Manual dialer through Google Voice. Google Voice has no public calling API, so Modo opens the call in
// Google Voice (web, or the phone app on mobile) with the number already dialed, and does everything
// around it: timer, customer notes, result, callback, AI help and the call log.
import { useEffect, useRef, useState } from "react";
import { Phone, PhoneOff, Delete, Settings2, ExternalLink, CheckCircle2, User, AlertCircle } from "lucide-react";
import CallAI from "@/components/CallAI";
import RecentCalls from "@/components/RecentCalls";

const RESULTS = [["SALE", "Sale"], ["CALLBK", "Callback"], ["NI", "Not interested"], ["NA", "No answer"], ["A", "Voicemail"], ["B", "Busy"], ["WRONG", "Wrong number"], ["DNC", "Do not call"]];
const fmt = (p) => { const d = String(p || "").replace(/\D/g, "").slice(0, 10); return d.length < 4 ? d : d.length < 7 ? `(${d.slice(0, 3)}) ${d.slice(3)}` : `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`; };
const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const post = (b) => fetch("/api/calls", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) }));

export default function VoiceDialer() {
  const [num, setNum] = useState(""); const [name, setName] = useState("");
  const [call, setCall] = useState(null); // { id, phone, name, at }
  const [now, setNow] = useState(Date.now()); const [note, setNote] = useState(""); const [res, setRes] = useState(""); const [cbAt, setCbAt] = useState("");
  const [acct, setAcct] = useState("0"); const [useApp, setUseApp] = useState(false); const [opts, setOpts] = useState(false);
  const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false); const [k, setK] = useState(0); const gv = useRef(null);
  useEffect(() => { try { setAcct(localStorage.getItem("modo-gv-acct") || "0"); setUseApp(localStorage.getItem("modo-gv-app") === "1" || (localStorage.getItem("modo-gv-app") == null && /Android|iPhone|iPad/i.test(navigator.userAgent))); const c = JSON.parse(sessionStorage.getItem("modo-gv-call") || "null"); if (c) setCall(c); } catch {} }, []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { try { call ? sessionStorage.setItem("modo-gv-call", JSON.stringify(call)) : sessionStorage.removeItem("modo-gv-call"); } catch {} }, [call]);
  const saveOpt = (a, app) => { setAcct(a); setUseApp(app); try { localStorage.setItem("modo-gv-acct", a); localStorage.setItem("modo-gv-app", app ? "1" : "0"); } catch {} };
  const say = (ok, text) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 4000); };
  const digits = num.replace(/\D/g, "").slice(-10);

  async function dial(p = digits, n = name) {
    if (p.length !== 10) return say(false, "Enter a 10-digit US number.");
    // Open Google Voice first (in the click) so the browser doesn't block the window
    const url = useApp ? `tel:+1${p}` : `https://voice.google.com/u/${encodeURIComponent(acct)}/calls?a=nc,%2B1${p}`;
    if (useApp) location.href = url; else gv.current = window.open(url, "modo-gvoice");
    const r = await post({ action: "start", phone: p, name: n, source: "gvoice" });
    setCall({ id: r.d.id, phone: p, name: n, at: Date.now() }); setNote(""); setRes(""); setCbAt("");
    if (!useApp && !gv.current) say(false, "Your browser blocked the Google Voice window. Allow pop-ups for Modo, then press Call again.");
  }
  async function save() {
    if (!res) return say(false, "Pick a result first.");
    const r0 = RESULTS.find((x) => x[0] === res);
    if (res === "CALLBK" && !cbAt) return say(false, "Pick the callback time.");
    setBusy(true);
    const r = await post({ action: "end", id: call.id, phone: call.phone, name: call.name || name, code: res, label: r0[1], note, callbackAt: res === "CALLBK" ? cbAt : undefined, seconds: Math.round((Date.now() - call.at) / 1000), source: "gvoice" });
    setBusy(false);
    if (!r.ok) return say(false, r.d.error || "Couldn't save.");
    say(true, `Saved: ${r0[1]}`); setCall(null); setNum(""); setName(""); setNote(""); setRes(""); setK((x) => x + 1);
  }
  const secs = call ? Math.max(0, Math.floor((now - call.at) / 1000)) : 0;

  return (
    <div className="dialer gv">
      <section className={"panel dl-status " + (call ? "call" : "ready")}>
        <div className="dl-pill"><span className="dl-dot" />{call ? "On a call" : "Ready"}</div>
        {call && <div className="dl-timer num">{clock(secs)}</div>}
        <div className="dl-meta"><span>Google Voice</span><span className="muted">{useApp ? "phone app" : `account /u/${acct}`}</span></div>
        <div className="row" style={{ marginLeft: "auto" }}>
          <button className="ghost" onClick={() => window.open(`https://voice.google.com/u/${encodeURIComponent(acct)}/calls`, "modo-gvoice")}><ExternalLink size={14} /> Open Google Voice</button>
          <button className="ghost icon-btn" aria-label="Options" onClick={() => setOpts(!opts)}><Settings2 size={15} /></button>
        </div>
      </section>
      {opts && (
        <section className="panel stack">
          <b>Google Voice options</b>
          <label>Which Google account (if you're signed into several)<select value={acct} onChange={(e) => saveOpt(e.target.value, useApp)}>{["0", "1", "2", "3", "4"].map((a) => <option key={a} value={a}>{a === "0" ? "First account (/u/0)" : `Account ${+a + 1} (/u/${a})`}</option>)}</select></label>
          <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={useApp} onChange={(e) => saveOpt(acct, e.target.checked)} style={{ width: "auto" }} /> Use the phone's dialer / Google Voice app (on phones, set Google Voice to make calls)</label>
          <p className="muted small" style={{ margin: 0 }}>On a computer, keep Google Voice signed in. Modo opens the call there with the number filled in; press the call button in Google Voice if it asks.</p>
        </section>
      )}

      <div className="dl-grid">
        <section className="panel stack dl-phone">
          <div className="dl-num">
            <input value={call ? fmt(call.phone) : fmt(num)} onChange={(e) => setNum(e.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="Enter a number" inputMode="tel" readOnly={!!call} aria-label="Phone number" onKeyDown={(e) => e.key === "Enter" && !call && dial()} />
            {!call && num && <button className="ghost sm icon-btn" aria-label="Delete digit" onClick={() => setNum(num.slice(0, -1))}><Delete size={15} /></button>}
          </div>
          {!call && <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer name (optional)" />}
          <div className="dl-keys">{["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map((x) => <button key={x} disabled={!!call} onClick={() => setNum((n) => (n + x).replace(/[^\d]/g, "").slice(0, 11))} aria-label={x}>{x}</button>)}</div>
          {call
            ? <button className="dl-big hang" onClick={() => document.querySelector(".gv .dl-wrap textarea")?.focus()}><PhoneOff size={18} /> Call ended? Save the result →</button>
            : <button className="dl-big call" onClick={() => dial()} disabled={digits.length !== 10}><Phone size={18} /> Call with Google Voice</button>}
          {call && <button className="ghost sm" onClick={() => dial(call.phone, call.name)}><Phone size={13} /> Ring again in Google Voice</button>}
        </section>

        <section className="panel stack dl-cust">
          <h2><User size={17} /> {call ? call.name || fmt(call.phone) : "No call yet"}</h2>
          <p className="muted small" style={{ margin: 0 }}>{call ? "Talk in Google Voice; keep notes here. When you hang up, pick the result and save." : "Type a number and press Call. Modo logs the call, keeps your notes on the customer and adds callbacks to your tasks."}</p>
        </section>

        <section className="panel stack dl-wrap">
          <h2><CheckCircle2 size={17} /> Wrap-up</h2>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened on the call? (saved to the customer in Modo)" style={{ minHeight: 110 }} disabled={!call} />
          <div className="dl-dispos">{RESULTS.map(([c, l]) => <button key={c} className={res === c ? "on" : ""} disabled={!call} onClick={() => setRes(c)} aria-pressed={res === c}><b>{l}</b><span>{c}</span></button>)}</div>
          {res === "CALLBK" && <label>Call back at<input type="datetime-local" value={cbAt} onChange={(e) => setCbAt(e.target.value)} /></label>}
          <button onClick={save} disabled={!call || !res || busy}>{busy ? "Saving…" : "Save call"}</button>
          {call && <button className="ghost sm" onClick={() => { if (confirm("Discard this call without saving a result?")) { post({ action: "end", id: call.id, phone: call.phone }); setCall(null); setK((x) => x + 1); } }}>Discard</button>}
        </section>
      </div>
      <div className="dl-grid2">
        <CallAI context={{ name: call?.name || name, phone: call?.phone }} note={note} onNote={setNote} />
        <RecentCalls mine limit={15} title="My recent calls" refreshKey={k} onRedial={(r) => { if (!call) { setNum(r.phone); setName(r.name || ""); window.scrollTo({ top: 0, behavior: "smooth" }); } }} />
      </div>
      {msg && <div className={"dl-toast " + (msg.ok ? "ok" : "bad")} role="status">{msg.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />} {msg.text}</div>}
    </div>
  );
}
