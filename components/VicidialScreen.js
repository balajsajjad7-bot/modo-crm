"use client";
// The real VICIdial agent screen inside Modo (signed in for you). It runs in your own browser, so it gets
// through the dialer's firewall like VICIdial always does, and VICIdial's own browser phone works in it.
// Beside it: Modo's quick call log (saved on the customer), AI assistant and your recent calls.
import { useEffect, useRef, useState } from "react";
import { ExternalLink, RefreshCw, ShieldCheck, CheckCircle2, AlertCircle, NotebookPen } from "lucide-react";
import CallAI from "@/components/CallAI";
import RecentCalls from "@/components/RecentCalls";

const RESULTS = [["SALE", "Sale"], ["CALLBK", "Callback"], ["NI", "Not interested"], ["NA", "No answer"], ["A", "Voicemail"], ["DNC", "Do not call"]];

export default function VicidialScreen() {
  const [e, setE] = useState(null); const [key, setKey] = useState(0); const [loaded, setLoaded] = useState(false);
  const [phone, setPhone] = useState(""); const [name, setName] = useState(""); const [note, setNote] = useState(""); const [res, setRes] = useState("");
  const [msg, setMsg] = useState(null); const [k, setK] = useState(0); const frame = useRef(null);
  useEffect(() => { fetch("/api/dialer/embed", { cache: "no-store" }).then((r) => r.json()).then(setE).catch(() => setE({ error: "Couldn't load the dialer." })); }, []);
  useEffect(() => { setLoaded(false); const t = setTimeout(() => setLoaded((x) => x || "slow"), 12000); return () => clearTimeout(t); }, [key, e?.url]);
  const say = (ok, text) => { setMsg({ ok, text }); setTimeout(() => setMsg(null), 4000); };

  async function save() {
    const d = phone.replace(/\D/g, "").slice(-10);
    if (d.length !== 10) return say(false, "Type the customer's 10-digit number.");
    const r0 = RESULTS.find((x) => x[0] === res);
    const r = await fetch("/api/calls", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "end", phone: d, name, code: r0?.[0], label: r0?.[1] || "Call", note, source: "webphone" }) });
    if (!r.ok) return say(false, "Couldn't save.");
    say(true, "Saved to the customer in Modo."); setPhone(""); setName(""); setNote(""); setRes(""); setK((x) => x + 1);
  }
  if (!e) return <p className="muted">Opening your dialer…</p>;
  if (e.error) return <section className="panel"><AlertCircle size={16} /> {e.error}</section>;
  return (
    <div className="vs">
      <div className="vs-main">
        <div className="vs-bar">
          <b>VICIdial{e.user ? ` · ${e.user}` : ""}</b>
          <span className="muted small">{e.autoLogin ? "signs you in automatically" : "sign in once inside the screen"}</span>
          <span style={{ flex: 1 }} />
          {e.firewall && <a className="btn-link" href={e.firewall} target="_blank" rel="noreferrer"><ShieldCheck size={13} /> Firewall sign-in</a>}
          <button className="ghost sm" onClick={() => setKey((x) => x + 1)}><RefreshCw size={13} /> Reload</button>
          <button className="ghost sm" onClick={() => window.open(e.url, "vicidial", "width=1100,height=800")}><ExternalLink size={13} /> Open in window</button>
        </div>
        <div className="vs-frame-wrap">
          <iframe key={key} ref={frame} className="vs-frame" src={e.url} title="VICIdial agent screen" allow="microphone; autoplay; clipboard-read; clipboard-write" onLoad={() => setLoaded(true)} />
          {loaded !== true && (
            <div className="vs-hint">
              {loaded === "slow" ? (
                <><b>Dialer not showing?</b>
                  <span>1. Tap <b>Firewall sign-in</b> and sign in (dialerlab lets your device in), then <b>Reload</b>.</span>
                  <span>2. Still blank? Your dialer may not allow being shown inside other sites: use <b>Open in window</b>.</span></>
              ) : <span className="muted">Loading VICIdial…</span>}
            </div>
          )}
        </div>
        <p className="muted small" style={{ margin: 0 }}>Calls, auto-dial, pause and results all work right inside this screen. If your phone login is a webphone, VICIdial's phone rings here; allow the microphone when asked.</p>
      </div>
      <div className="vs-side">
        <section className="panel stack">
          <h2><NotebookPen size={17} /> Log the call in Modo</h2>
          <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
            <input value={phone} onChange={(x) => setPhone(x.target.value)} placeholder="Customer number" inputMode="tel" style={{ minWidth: 0 }} />
            <input value={name} onChange={(x) => setName(x.target.value)} placeholder="Name" style={{ minWidth: 0 }} />
          </div>
          <textarea value={note} onChange={(x) => setNote(x.target.value)} placeholder="Notes (saved on the customer)" style={{ minHeight: 80 }} />
          <div className="dl-dispos">{RESULTS.map(([c, l]) => <button key={c} className={res === c ? "on" : ""} onClick={() => setRes(c)}><b>{l}</b><span>{c}</span></button>)}</div>
          <button onClick={save}>Save to Modo</button>
          {msg && <p className={"small " + (msg.ok ? "" : "err")} style={{ margin: 0 }}>{msg.ok ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />} {msg.text}</p>}
        </section>
        <CallAI context={{ name, phone }} note={note} onNote={setNote} />
        <RecentCalls mine limit={10} title="My recent calls" refreshKey={k} onRedial={(r) => { setPhone(r.phone); setName(r.name || ""); }} />
      </div>
    </div>
  );
}
