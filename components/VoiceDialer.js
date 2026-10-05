"use client";
// Phone: manual calls right inside Modo, on your VICIdial lines (Modo phone, WebRTC).
// Only the microphone permission is needed. Every call is logged with result, notes, callback and AI help.
import { useEffect, useRef, useState } from "react";
import { Phone, PhoneOff, Delete, CheckCircle2, User, AlertCircle, Mic, MicOff } from "lucide-react";
import CallAI from "@/components/CallAI";
import RecentCalls from "@/components/RecentCalls";
import { useSoftphone, PhoneStatus } from "@/components/Softphone";

const RESULTS = [["SALE", "Sale"], ["CALLBK", "Callback"], ["NI", "Not interested"], ["NA", "No answer"], ["A", "Voicemail"], ["B", "Busy"], ["WRONG", "Wrong number"], ["DNC", "Do not call"]];
const fmt = (p) => { const d = String(p || "").replace(/\D/g, "").slice(0, 10); return d.length < 4 ? d : d.length < 7 ? `(${d.slice(0, 3)}) ${d.slice(3)}` : `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`; };
const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const post = (b) => fetch("/api/calls", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }).then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) }));

export default function VoiceDialer() {
  const sp = useSoftphone();
  const [num, setNum] = useState(""); const [name, setName] = useState("");
  const [log, setLog] = useState(null); // { id, phone, name, at } — the call being wrapped up
  const [now, setNow] = useState(Date.now()); const [note, setNote] = useState(""); const [res, setRes] = useState(""); const [cbAt, setCbAt] = useState("");
  const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false); const [k, setK] = useState(0);
  const say = (ok, text) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 4500); };
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const digits = num.replace(/\D/g, "").slice(-10);
  const live = sp?.call && sp.call.state !== "ended" && sp.call.dir === "out";
  const active = live && sp.call.state === "active";

  async function dial(p = digits, n = name) {
    if (p.length !== 10) return say(false, "Enter a 10-digit US number.");
    if (sp?.mic !== "granted" && !(await sp.askMic())) return say(false, "Allow the microphone (address bar) so Modo can make calls.");
    try { await sp.dial(p); } catch (e) { return say(false, e.message); }
    const r = await post({ action: "start", phone: p, name: n, source: "webphone" });
    setLog({ id: r.d.id, phone: p, name: n, at: Date.now() }); setNote(""); setRes(""); setCbAt("");
  }
  async function save() {
    if (!res) return say(false, "Pick a result first.");
    const r0 = RESULTS.find((x) => x[0] === res);
    if (res === "CALLBK" && !cbAt) return say(false, "Pick the callback time.");
    if (live) sp.hangup();
    setBusy(true);
    const r = await post({ action: "end", id: log.id, phone: log.phone, name: log.name || name, code: res, label: r0[1], note, callbackAt: res === "CALLBK" ? cbAt : undefined, seconds: Math.round((Date.now() - log.at) / 1000), source: "webphone" });
    setBusy(false);
    if (!r.ok) return say(false, r.d.error || "Couldn't save.");
    say(true, `Saved: ${r0[1]}`); setLog(null); setNum(""); setName(""); setNote(""); setRes(""); setCbAt(""); setK((x) => x + 1);
  }
  const secs = active && sp.call.at ? Math.max(0, Math.floor((now - sp.call.at) / 1000)) : 0;
  const ready = sp?.reg === "registered";

  return (
    <div className="dialer gv">
      <section className={"panel dl-status " + (live ? "call" : ready ? "ready" : "off")}>
        <div className="dl-pill"><span className="dl-dot" />{live ? (active ? "On a call" : "Calling…") : log ? "Wrap-up" : ready ? "Ready" : "Phone offline"}</div>
        {active && <div className="dl-timer num">{clock(secs)}</div>}
        <div className="dl-meta"><span>Modo phone</span><span className="muted">{sp?.cfg?.user ? `line ${sp.cfg.user}` : "VICIdial lines"}</span></div>
      </section>
      <PhoneStatus />

      <div className="dl-grid">
        <section className="panel stack dl-phone">
          <div className="dl-num">
            <input value={log ? fmt(log.phone) : fmt(num)} onChange={(e) => setNum(e.target.value.replace(/\D/g, "").slice(0, 11))} placeholder="Enter a number" inputMode="tel" readOnly={!!log} aria-label="Phone number" onKeyDown={(e) => e.key === "Enter" && !log && dial()} />
            {!log && num && <button className="ghost sm icon-btn" aria-label="Delete digit" onClick={() => setNum(num.slice(0, -1))}><Delete size={15} /></button>}
          </div>
          {!log && <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer name (optional)" />}
          <div className="dl-keys">{["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map((x) => <button key={x} onClick={() => (active ? sp.dtmf(x) : !log && setNum((n) => (n + x).replace(/[^\d]/g, "").slice(0, 11)))} aria-label={x}>{x}</button>)}</div>
          <span className="small muted" style={{ textAlign: "center" }}>{active ? "Keys send tones to the call" : "Calls go out on your VICIdial lines, right here in Modo"}</span>
          {live
            ? <button className="dl-big hang" onClick={sp.hangup}><PhoneOff size={18} /> Hang up</button>
            : <button className="dl-big call" onClick={() => dial()} disabled={!!log || digits.length !== 10 || !ready}><Phone size={18} /> Call</button>}
          {active && <button className="ghost" onClick={sp.mute}>{sp.call.muted ? <><MicOff size={15} /> Unmute</> : <><Mic size={15} /> Mute</>}</button>}
          {log && !live && <button className="ghost sm" onClick={() => dial(log.phone, log.name)} disabled={!ready}><Phone size={13} /> Call again</button>}
        </section>

        <section className="panel stack dl-cust">
          <h2><User size={17} /> {log ? log.name || fmt(log.phone) : "No call yet"}</h2>
          <p className="muted small" style={{ margin: 0 }}>{log ? "Keep notes while you talk. When the call ends, pick the result and save." : "Type a number and press Call. Modo logs the call, keeps your notes on the customer and adds callbacks to your tasks."}</p>
        </section>

        <section className="panel stack dl-wrap">
          <h2><CheckCircle2 size={17} /> Wrap-up</h2>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="What happened on the call? (saved to the customer in Modo)" style={{ minHeight: 110 }} disabled={!log} />
          <div className="dl-dispos">{RESULTS.map(([c, l]) => <button key={c} className={res === c ? "on" : ""} disabled={!log} onClick={() => setRes(c)} aria-pressed={res === c}><b>{l}</b><span>{c}</span></button>)}</div>
          {res === "CALLBK" && <label>Call back at<input type="datetime-local" value={cbAt} onChange={(e) => setCbAt(e.target.value)} /></label>}
          <button onClick={save} disabled={!log || !res || busy}>{busy ? "Saving…" : live ? "Hang up & save" : "Save call"}</button>
          {log && !live && <button className="ghost sm" onClick={() => { post({ action: "end", id: log.id, phone: log.phone }); setLog(null); setK((x) => x + 1); }}>Discard</button>}
        </section>
      </div>
      <div className="dl-grid2">
        <CallAI context={{ name: log?.name || name, phone: log?.phone }} note={note} onNote={setNote} />
        <RecentCalls mine limit={15} title="My recent calls" refreshKey={k} onRedial={(r) => { if (!log) { setNum(r.phone); setName(r.name || ""); window.scrollTo({ top: 0, behavior: "smooth" }); } }} />
      </div>
      {msg && <div className={"dl-toast " + (msg.ok ? "ok" : "bad")} role="status">{msg.ok ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />} {msg.text}</div>}
    </div>
  );
}
