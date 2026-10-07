"use client";
import { Coffee, Radio, Receipt, Target, Trophy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { pkr, dur } from "@/lib/fmt";
import { startSending } from "@/components/listen";
import AssistTools from "./AssistTools";
import Spectrum from "@/components/Spectrum";
import FoldHead from "@/components/FoldHead";

export const post = (url, body, extra) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body || {}), ...extra });
export const markActive = () => window.dispatchEvent(new Event("modo-active"));

export function ShiftMeter({ me, now }) {
  const t = me.today;
  const late = t?.lateSeconds > 0 && !t?.waived;
  const onShift = t ? Math.floor((now - new Date(t.clockIn)) / 1000) : 0;
  return (
    <section className="panel meter" aria-label="Your shift">
      <div>
        <div className={"big " + (late ? "late" : "ontime")}>{t ? dur(onShift) : "--"}</div>
        <div className="muted small">on shift since {t ? new Date(t.clockIn).toLocaleTimeString() : "—"}</div>
        {t && <div className="muted small">{{ login: "Clocked in when you signed in", auto: "Clocked in automatically when you opened the CRM", qr: "Checked in at the office (QR)", kiosk: "Checked in at the office kiosk", admin: "Set by admin" }[t.source] || ""}{t.location ? ` · ${t.location === "office" ? "in office" : "remote"}` : ""}</div>}
      </div>
      <div className="facts">
        <div><b>{me.shiftStart}</b><span>shift starts</span></div>
        <div><b>{late ? dur(t.lateSeconds) : "On time"}</b><span>late today</span></div>
        <div><b style={{ color: late ? "var(--red)" : undefined }}>{late ? "−" + pkr(t.deduction) : pkr(0)}</b><span>late deduction today</span></div>
        <div><b>{pkr(me.slip.net)}</b><span>this month so far</span></div>
      </div>
    </section>
  );
}

// Reports time away from this tab, or with no mouse/keyboard, to the admin log.
export function useIdleTracking(idleAfterMin) {
  useEffect(() => {
    if (!idleAfterMin) return;
    let last = Date.now(), idleStart = null, awayStart = null;
    const send = (kind, start, end) => { if (end - start > 5000) post("/api/activity", { kind, start: new Date(start), end: new Date(end) }, { keepalive: true }); };
    const active = () => { const n = Date.now(); if (idleStart) { send("IDLE", idleStart, n); idleStart = null; window.__modoIdle = false; } last = n; };
    const vis = () => {
      const n = Date.now();
      if (document.hidden) { if (idleStart) { send("IDLE", idleStart, n); idleStart = null; } awayStart = n; }
      else if (awayStart) { send("AWAY", awayStart, n); awayStart = null; last = n; }
    };
    const check = setInterval(() => { if (!document.hidden && !idleStart && Date.now() - last > idleAfterMin * 60000) { idleStart = last; window.__modoIdle = true; } }, 15000);
    const evs = ["mousemove", "keydown", "mousedown", "scroll", "touchstart", "modo-active"];
    evs.forEach((e) => window.addEventListener(e, active, { passive: true }));
    document.addEventListener("visibilitychange", vis);
    const leave = () => { const n = Date.now(); if (awayStart) send("AWAY", awayStart, n); else if (idleStart) send("IDLE", idleStart, n); };
    window.addEventListener("pagehide", leave);
    return () => { clearInterval(check); evs.forEach((e) => window.removeEventListener(e, active)); document.removeEventListener("visibilitychange", vis); window.removeEventListener("pagehide", leave); };
  }, [idleAfterMin]);
}

export function BreakBox({ me, now, toggle: doToggle }) {
  const [busy, setBusy] = useState(false);
  const b = me.breaks;
  const used = b.usedSeconds + (b.open ? Math.max(0, Math.floor((now - me.loadedAt) / 1000)) : 0);
  const left = b.allowance - used;
  const overCost = left < 0 ? -left * me.rates.perSecond : 0;
  async function toggle() { setBusy(true); await doToggle(); setBusy(false); }
  return (
    <section id="break" className="panel stack">
      <div className="row" style={{ justifyContent: "space-between" }}><h2><Coffee size={17} /> Breaks</h2>{b.open && <span className="chip late">on break</span>}</div>
      <div className="facts">
        <div><b style={{ color: left < 0 ? "var(--red)" : undefined }}>{left >= 0 ? dur(left) : "−" + dur(-left)}</b><span>{left >= 0 ? "break time left" : "over allowance"}</span></div>
        <div><b>{dur(used)}</b><span>used of {dur(b.allowance)}</span></div>
        {overCost > 0 && <div><b style={{ color: "var(--red)" }}>−{pkr(overCost)}</b><span>over-break deduction</span></div>}
      </div>
      <div><button className={b.open ? "" : "ghost"} onClick={toggle} disabled={busy}>{b.open ? "End break" : "Start break"}</button></div>
    </section>
  );
}

export function TargetBox({ me }) {
  const [board, setBoard] = useState(null);
  useEffect(() => { const l = () => fetch("/api/leaderboard").then((r) => r.json()).then(setBoard); l(); const t = setInterval(l, 30000); return () => clearInterval(t); }, []);
  const g = me.target, extra = Math.max(0, g.verified - g.goal);
  const pct = g.goal ? Math.min(100, (g.verified / g.goal) * 100) : 100;
  const rank = board?.rows.findIndex((r) => r.agentId === me.agentId);
  return (
    <section id="target" className="panel stack">
      <div className="row" style={{ justifyContent: "space-between" }}><h2><Target size={17} /> Today's target</h2>{rank >= 0 && <span className="chip">#{rank + 1} of {board.rows.length}</span>}</div>
      <div className="facts">
        <div><b>{g.verified} / {g.goal}</b><span>verified sales</span></div>
        <div><b>{g.submitted}</b><span>submitted</span></div>
        <div><b style={{ color: extra ? "var(--green)" : undefined }}>{pkr(extra * g.bonusPerSale)}</b><span>bonus today</span></div>
      </div>
      <div className="progress" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}><div style={{ width: pct + "%" }} /></div>
      <p className="muted small" style={{ margin: 0 }}>Each verified sale above {g.goal} earns {pkr(g.bonusPerSale)}.</p>
    </section>
  );
}

export function SaleBox({ onDone }) {
  const [raw, setRaw] = useState("");
  useEffect(() => { try { const p = sessionStorage.getItem("modo-sale-prefill"); if (p) { sessionStorage.removeItem("modo-sale-prefill"); setRaw(p + "\n\nCustomer name: \nPhone: \nAddress: \nPayment: \nNotes: "); } } catch {} }, []); const [receipt, setReceipt] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true); setErr(""); setReceipt("");
    const r = await post("/api/sales", { raw }); const d = await r.json(); setBusy(false);
    if (!r.ok) return setErr(d.error);
    setRaw(""); setReceipt(d.receipt); onDone();
  }
  return (
    <section id="sale" className="panel stack">
      <div><h2><Receipt size={17} /> Submit a sale</h2><p className="muted small" style={{ margin: "4px 0 0" }}>Paste the full sale details. They go straight to admin and are removed from this screen once submitted.</p></div>
      <textarea value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="Customer name, phone, product, amount, payment details, notes…" autoComplete="off" spellCheck={false} />
      {err && <div className="err">{err}</div>}
      {receipt && <div className="receipt">Sale submitted. Receipt {receipt}</div>}
      <div><button onClick={submit} disabled={busy || raw.trim().length < 10}>{busy ? "Submitting…" : "Submit sale"}</button></div>
    </section>
  );
}

export function ScoreCard({ score, review }) {
  if (score == null || !review) return null;
  const r = typeof review === "string" ? JSON.parse(review) : review;
  return (
    <div className="stack" style={{ gap: 6, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
      <div className="row"><b>Last call score</b><span className={"chip " + (score >= 75 ? "ok" : score >= 50 ? "late" : "red")}>{score}/100</span></div>
      <div className="row small muted">Greeting {r.greeting}/25 · Pitch {r.pitch}/25 · Disclosure {r.disclosure}/25 · Closing {r.closing}/25</div>
      {r.strengths && <div className="small">Good: {r.strengths}</div>}
      {r.improve && <div className="small">Improve: {r.improve}</div>}
    </div>
  );
}

export function LiveAssist({ lastCall, onDone, onLive }) {
  const [live, setLive] = useState(false); const [lines, setLines] = useState([]); const [tip, setTip] = useState(null); const [err, setErr] = useState("");
  const [scoring, setScoring] = useState(false); const [asking, setAsking] = useState(false); const [cust, setCust] = useState(false); const [custErr, setCustErr] = useState("");
  const rec = useRef(null); const sid = useRef(null); const pending = useRef(""); const inflight = useRef(false); const tab = useRef(null);
  const [beAgent, setBeAgent] = useState(false);
  useEffect(() => { fetch("/api/me").then((r) => r.json()).then((d) => setBeAgent(!!d.budgetEase)).catch(() => {}); }, []);
  const [facts, setFacts] = useState({}); const [check, setCheck] = useState({}); const [obj, setObj] = useState(null); const [qs, setQs] = useState([]);
  const mic = useRef(null); const custStream = useRef(null); const senders = useRef(new Map()); const [watched, setWatched] = useState(false);
  // Supervisor listen-in: send my mic (and the customer, if captured) to any admin who asked to listen
  const restartSenders = () => { for (const [id, sd] of senders.current) { sd.close(); senders.current.delete(id); } };
  useEffect(() => {
    if (!live) return;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      const d = await fetch("/api/listen", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      const reqs = (d?.requests || []).filter((r) => r.callSessionId === sid.current);
      setWatched(!!d?.notice && reqs.length > 0);
      for (const r of reqs) if (!senders.current.has(r.id) && mic.current) {
        senders.current.set(r.id, { close: () => {} });
        try { const sd = await startSending(r.id, { agent: mic.current, customer: custStream.current }, () => senders.current.delete(r.id)); senders.current.set(r.id, sd); }
        catch { senders.current.delete(r.id); }
      }
      setTimeout(tick, 3000);
    };
    tick();
    return () => { stop = true; restartSenders(); };
  }, [live]);

  const ensureSession = async () => {
    if (sid.current) return sid.current;
    const d = await (await post("/api/assist", { chunk: "" })).json(); sid.current = d.sessionId; return sid.current;
  };
  async function flush() {
    if (inflight.current || !pending.current) return;
    inflight.current = true; const chunk = pending.current; pending.current = "";
    try {
      const d = await (await post("/api/assist", { sessionId: sid.current, chunk, speaker: "A" })).json();
      sid.current = d.sessionId; if (d.next || d.tip) setTip(d);
      if (d.facts) setFacts((f) => { const n = { ...f }; for (const [k, v] of Object.entries(d.facts)) if (v !== "" && v != null) n[k] = v; return n; });
      if (d.checklist) setCheck((c) => { const n = { ...c }; for (const [k, v] of Object.entries(d.checklist)) if (v) n[k] = true; return n; });
      if (d.objection) setObj({ q: d.objection, a: d.rebuttal });
      if (Array.isArray(d.questions) && d.questions.length) setQs(d.questions);
    } finally { inflight.current = false; if (pending.current) flush(); }
  }

  // Customer side: capture the dialer tab's audio (Chrome/Edge "Share tab audio") in short clips → Whisper on the server.
  async function startCustomer() {
    setCustErr("");
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: { echoCancellation: false, noiseSuppression: false } });
      stream.getVideoTracks().forEach((t) => t.stop());
      const track = stream.getAudioTracks()[0];
      if (!track) { setCustErr("No audio was shared. Pick your dialer tab and tick \"Share tab audio\"."); return; }
      const audio = new MediaStream([track]); await ensureSession();
      custStream.current = audio; restartSenders(); // listeners reconnect with the customer's voice included
      const clip = () => {
        if (!tab.current) return;
        const type = ["audio/webm;codecs=opus", "audio/webm"].find((x) => MediaRecorder.isTypeSupported(x)) || "";
        const mr = new MediaRecorder(audio, type ? { mimeType: type } : undefined); const parts = [];
        mr.ondataavailable = (e) => e.data.size && parts.push(e.data);
        mr.onstop = async () => {
          const blob = new Blob(parts, { type: mr.mimeType || "audio/webm" });
          if (tab.current) clip(); // next clip starts right away
          if (blob.size < 4000) return;
          const f = new FormData(); f.set("sessionId", sid.current); f.set("audio", blob, "c.webm");
          const r = await fetch("/api/assist/audio", { method: "POST", body: f }); const d = await r.json().catch(() => ({}));
          if (!r.ok) { setCustErr(d.error || "Couldn't transcribe the customer."); return; }
          if (d.text) { setLines((l) => [...l.slice(-40), { who: "C", text: d.text }]); pending.current += " "; flush(); }
        };
        mr.start(); setTimeout(() => mr.state === "recording" && mr.stop(), 7000);
      };
      tab.current = { track }; track.onended = () => { tab.current = null; setCust(false); };
      setCust(true); clip();
    } catch { setCustErr("Screen/tab sharing was cancelled."); }
  }
  function stopCustomer() { const t = tab.current; tab.current = null; t?.track.stop(); if (custStream.current) { custStream.current = null; restartSenders(); } setCust(false); }

  function start() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return setErr("Live assist needs Google Chrome or Microsoft Edge on a computer.");
    setErr(""); sid.current = null; setLines([]); setTip(null); setFacts({}); setCheck({}); setObj(null); setQs([]);
    const r = new SR(); r.continuous = true; r.interimResults = false; r.lang = "en-US";
    r.onresult = (e) => {
      markActive();
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) {
        const text = e.results[i][0].transcript.trim(); if (!text) continue;
        setLines((l) => [...l.slice(-40), { who: "A", text }]); pending.current += " " + text; flush();
      }
    };
    r.onerror = (e) => { if (e.error === "not-allowed") { setErr("Microphone is blocked. Allow it in the browser address bar, then start again."); stop(); } };
    r.onend = () => { if (rec.current === r) r.start(); };
    rec.current = r; r.start(); setLive(true);
    navigator.mediaDevices?.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }).then((st) => { mic.current = st; }).catch(() => {});
    ensureSession();
  }
  function stop() { const r = rec.current; rec.current = null; r?.stop(); stopCustomer(); restartSenders(); mic.current?.getTracks().forEach((t) => t.stop()); mic.current = null; setLive(false); if (sid.current) setAsking(true); }
  async function finish(endedBy) {
    setAsking(false); setScoring(true);
    await new Promise((res) => { const w = () => (inflight.current ? setTimeout(w, 300) : res()); w(); });
    await post("/api/assist", { sessionId: sid.current, end: true, endedBy });
    setScoring(false); onDone();
  }
  useEffect(() => () => { rec.current?.stop(); tab.current?.track.stop(); mic.current?.getTracks().forEach((t) => t.stop()); }, []);
  useEffect(() => { onLive?.(live); }, [live, onLive]);

  return (
    <section id="call" className="panel stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2><Radio size={17} /> Live call assist</h2>
        {live ? <span className="row small"><span className="live-dot" /> Listening{cust ? " to both sides" : " to you"}{watched && <span className="chip late">Supervisor listening</span>}</span> : null}
      </div>
      <Spectrum active={live} getStreams={() => [mic.current, custStream.current]} label={cust ? "You + customer" : "Your voice"} />
      <div className="suggest" aria-live="polite">{tip?.next || (live ? "Start talking. Suggestions appear here." : "Start a call to get suggestions on what to say next.")}</div>
      {tip && <div className="row small">{tip.tone && <span className={"chip " + tip.tone}>{tip.tone}</span>}{tip.confused && tip.confused !== "none" && <span className="chip late">confused: {tip.confused}</span>}<span className="muted">{tip.tip}</span></div>}
      {tip?.warning && <div className="la-warn">⚠ {tip.warning}</div>}
      {tip?.buyingSignal && <div className="la-buy">🔥 Buying signal: {tip.buyingSignal}. Go for the close.</div>}
      {(live || lines.length > 0) && (
        <div className="la-grid">
          {obj && <div className="la-card obj"><span className="sf-l">Objection</span><b>“{obj.q}”</b>{obj.a && <p>{obj.a}</p>}</div>}
          {qs.length > 0 && <div className="la-card"><span className="sf-l">Customer asked</span>{qs.map((x, i) => <div key={i} className="la-qa"><b>{x.q}</b><span>{x.a}</span></div>)}</div>}
          <div className="la-card"><span className="sf-l">Call checklist</span><div className="la-check">{[["intro", "Introduced"], ["recorded", "Said 'recorded'"], ["needs", "Asked needs"], ["price", "Stated price"], ["terms", "Explained terms"], ["agreement", "Got a yes"], ["confirmed", "Confirmed details"]].map(([k, l]) => <span key={k} className={check[k] ? "on" : ""}>{check[k] ? "✓" : "○"} {l}</span>)}</div></div>
          <div className="la-card"><span className="sf-l">What we know</span>
            {Object.values(facts).some(Boolean) ? <div className="la-facts">{[["name", "Name"], ["provider", "Provider"], ["bill", "Bill"], ["lines", "Lines"], ["zip", "ZIP"], ["email", "Email"], ["address", "Address"], ["wants", "Wants"]].filter(([k]) => facts[k]).map(([k, l]) => <div key={k}><span>{l}</span><b>{k === "bill" && !isNaN(facts[k]) ? "$" + facts[k] : facts[k]}</b></div>)}</div> : <p className="muted small" style={{ margin: 0 }}>Name, provider, bill and ZIP appear here as they're said.</p>}
            {Object.values(facts).some(Boolean) && <button className="ghost sm" onClick={() => { const pre = { customer: facts.name, billBefore: facts.bill, zip: facts.zip, email: facts.email, address: facts.address, notes: facts.wants }; try { localStorage.setItem("modo-sale-prefill", JSON.stringify(pre)); localStorage.setItem("modo-be-prefill", JSON.stringify({ customer: facts.name, company: facts.provider, billAmount: facts.bill, zip: facts.zip, email: facts.email, serviceAddress: facts.address })); } catch {} window.open(beAgent ? "/agent/budgetease" : "/agent/sale", "_blank"); }}>Use in sale form ↗</button>}
          </div>
          {(tip?.agentNervous != null || tip?.customerNervous != null) && <div className="la-card"><span className="sf-l">How it sounds</span>
            <div className="mini-nerv" style={{ gridTemplateColumns: "1fr" }}>
              <span>You <i><em style={{ width: (tip.agentNervous || 0) + "%", background: tip.agentNervous >= 60 ? "#ff4d5a" : tip.agentNervous >= 35 ? "#e0c27c" : "#7fd6a0" }} /></i> {tip.agentState || ""}</span>
              <span>Customer <i><em style={{ width: (tip.customerNervous || 0) + "%", background: tip.customerNervous >= 60 ? "#ff4d5a" : tip.customerNervous >= 35 ? "#e0c27c" : "#7fd6a0" }} /></i> {tip.customerState || tip.mood || ""}</span>
            </div>
            {(() => { const w = (who) => lines.filter((l) => l.who === who).reduce((t, l) => t + l.text.split(/\s+/).length, 0); const a = w("A"), c = w("C"); return a + c > 0 && c > 0 ? <span className="small muted">You talk {Math.round((a / (a + c)) * 100)}% of the time{a / (a + c) > 0.7 ? " — let the customer talk more" : ""}</span> : null; })()}
          </div>}
        </div>
      )}
      {lines.length > 0 && <div className="subs">{lines.slice(-8).map((l, i) => <p key={i} className={l.who === "C" ? "c" : "a"}><b>{l.who === "C" ? "Customer" : "You"}</b>{l.text}</p>)}</div>}
      {err && <div className="err">{err}</div>}
      {asking ? (
        <div className="panel stack" style={{ background: "rgba(255,255,255,.05)" }}>
          <b>Who ended the call?</b>
          <div className="row"><button onClick={() => finish("customer")}>Customer hung up</button><button className="ghost" onClick={() => finish("agent")}>I ended it</button><button className="ghost" onClick={() => finish("unknown")}>Not sure</button></div>
        </div>
      ) : (
        <div className="row">
          {live ? <button className="danger" onClick={stop}>End call</button> : <button onClick={start} disabled={scoring}>{scoring ? "Scoring the call…" : "Start call"}</button>}
          {live && (cust ? <button className="ghost" onClick={stopCustomer}>Stop hearing customer</button> : <button className="ghost" onClick={startCustomer}>Hear the customer too</button>)}
        </div>
      )}
      {live && !cust && <p className="muted small" style={{ margin: 0 }}>To caption the customer: press "Hear the customer too", pick your dialer tab and tick <b>Share tab audio</b>. Needs admin's free Groq key.</p>}
      {custErr && <div className="err small">{custErr}</div>}
      <AssistTools getSid={() => sid.current} />
      <p className="muted small" style={{ margin: 0 }}>Calls may be monitored by a supervisor for quality and training.</p>
      <ScoreCard score={lastCall?.score} review={lastCall?.review} />
    </section>
  );
}

export function Leaderboard({ me }) {
  const [board, setBoard] = useState(null);
  useEffect(() => { const l = () => fetch("/api/leaderboard").then((r) => r.json()).then(setBoard); l(); const t = setInterval(l, 30000); return () => clearInterval(t); }, []);
  if (!board) return <section className="panel muted">Loading leaderboard…</section>;
  return (
    <section className="panel stack">
      <FoldHead id="lb-agent" icon={<Trophy size={17} />} title="Today's leaderboard" />
      <div className="tablewrap"><table>
        <thead><tr><th>Rank</th><th>Agent</th><th className="r">Verified</th><th className="r">Submitted</th></tr></thead>
        <tbody>{board.rows.map((r, i) => (
          <tr key={r.agentId} style={r.agentId === me.agentId ? { background: "var(--accent-soft)" } : undefined}>
            <td className="num" style={{ fontSize: 18 }}>{i + 1}</td><td>{r.name}{r.agentId === me.agentId ? " (you)" : ""}</td>
            <td className="r num" style={{ fontSize: 18 }}>{r.verified}</td><td className="r">{r.submitted}</td>
          </tr>))}
        </tbody>
      </table></div>
    </section>
  );
}
