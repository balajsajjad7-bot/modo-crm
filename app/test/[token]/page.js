"use client";
// The candidate's English fluency test (opened from their private link, no login).
// Speaking answers are recorded in the browser; sentences to repeat or type are spoken by the browser's voice.
import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, Play, Volume2, Headphones, Clock3, CheckCircle2, ArrowRight, Loader2, Video, CalendarPlus, ShieldCheck, AlertTriangle } from "lucide-react";
import ModoLogo from "@/components/ModoLogo";

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;
const when = (t) => new Date(t).toLocaleString(undefined, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
const dayKey = (t) => new Date(t).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const hour = (t) => new Date(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

function speak(text, onEnd) {
  try {
    const s = window.speechSynthesis; if (!s) return false;
    s.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang = "en-US"; u.rate = 0.95;
    const v = s.getVoices().filter((x) => /^en[-_]US/i.test(x.lang));
    u.voice = v.find((x) => /natural|google|samantha|aria|jenny|guy/i.test(x.name)) || v[0] || null;
    u.onend = onEnd; u.onerror = onEnd; s.speak(u); return true;
  } catch { return false; }
}

export default function TestPage({ params }) {
  const token = params.token;
  const [st, setSt] = useState(null); const [err, setErr] = useState("");
  const [phase, setPhase] = useState("intro"); // intro → section → item → submitting → done
  const [secIdx, setSecIdx] = useState(0); const [itemIdx, setItemIdx] = useState(0); const [secLeft, setSecLeft] = useState(0);
  const [done, setDone] = useState({}); const queue = useRef(Promise.resolve()); const [pending, setPending] = useState(0);
  const stream = useRef(null);

  const call = useCallback((body) => fetch(`/api/test/${token}`, { method: body ? "POST" : "GET", headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" }).then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) })), [token]);
  useEffect(() => {
    const h = document.documentElement; h.setAttribute("data-appearance", "dark"); h.setAttribute("data-theme", "dark");
    call().then((r) => { if (!r.ok) return setErr(r.d.error || "This link doesn't work."); setSt(r.d); setDone(Object.fromEntries((r.d.answered || []).map((k) => [k, 1]))); if (r.d.finished) setPhase("done"); });
    try { window.speechSynthesis?.getVoices(); } catch {}
  }, [call]);
  // Leaving the page during the test is noted for the recruiter.
  useEffect(() => {
    if (!(phase === "section" || phase === "item")) return;
    const f = () => { if (document.hidden) call({ action: "event", kind: "tab" }); };
    document.addEventListener("visibilitychange", f); return () => document.removeEventListener("visibilitychange", f);
  }, [phase, call]);

  const sections = (st?.sections || []).filter((s) => st.items.some((i) => i.section === s.key));
  const sec = sections[secIdx];
  const items = sec ? st.items.filter((i) => i.section === sec.key) : [];
  const item = items[itemIdx];

  // Section timer: when it runs out, move on.
  useEffect(() => {
    if (phase !== "item") return;
    const t = setInterval(() => setSecLeft((s) => s - 1), 1000); return () => clearInterval(t);
  }, [phase, secIdx]);
  useEffect(() => { if (phase === "item" && secLeft <= 0) nextSection(); }, [secLeft]); // eslint-disable-line

  const enqueue = (fn) => { setPending((n) => n + 1); queue.current = queue.current.then(fn).catch(() => {}).finally(() => setPending((n) => n - 1)); };
  const answered = (id) => setDone((d) => ({ ...d, [id]: 1 }));
  const sendJson = (body) => { answered(body.item); enqueue(() => call({ action: "answer", ...body })); next(); };
  const sendAudio = (id, blob, secs) => {
    answered(id);
    enqueue(async () => {
      const f = new FormData(); f.set("item", id); f.set("secs", String(secs)); f.set("audio", new File([blob], "answer." + (/mp4/.test(blob.type) ? "m4a" : "webm"), { type: blob.type }));
      for (let i = 0; i < 3; i++) { const r = await fetch(`/api/test/${token}/audio`, { method: "POST", body: f }).catch(() => null); if (r && (r.ok || r.status < 500)) return; await new Promise((x) => setTimeout(x, 1500)); }
    });
    next();
  };
  const firstOpen = (sIdx) => { const s = sections[sIdx]; const its = s ? st.items.filter((i) => i.section === s.key) : []; return its.findIndex((i) => !done[i.id]); };
  const next = () => { const rest = items.findIndex((i, k) => k > itemIdx && !done[i.id]); if (rest >= 0) setItemIdx(rest); else nextSection(); };
  const nextSection = () => {
    let n = secIdx + 1; while (n < sections.length && firstOpen(n) < 0) n++;
    if (n >= sections.length) return finish();
    setSecIdx(n); setItemIdx(Math.max(0, firstOpen(n))); setPhase("section");
  };
  const finish = async () => {
    setPhase("submitting"); try { window.speechSynthesis?.cancel(); } catch {}
    await queue.current;
    const r = await call({ action: "finish" });
    try { stream.current?.getTracks().forEach((t) => t.stop()); } catch {}
    if (r.ok) setSt(r.d); setPhase("done");
  };
  const begin = async () => {
    const r = await call({ action: "start" }); if (!r.ok) return setErr(r.d.error);
    let n = 0; while (n < sections.length && firstOpen(n) < 0) n++;
    if (n >= sections.length) return finish();
    setSecIdx(n); setItemIdx(Math.max(0, firstOpen(n))); setPhase("section");
  };

  if (err) return <Frame><div className="et-card et-center"><AlertTriangle size={36} color="#f59e0b" /><h2>{err}</h2></div></Frame>;
  if (!st) return <Frame><div className="et-card et-center"><Loader2 className="spin" /> Loading your test…</div></Frame>;
  if (st.expired) return <Frame><div className="et-card et-center"><Clock3 size={36} color="#f59e0b" /><h2>This test link has expired</h2><p>Ask the recruiter to send you a new link.</p></div></Frame>;

  if (phase === "done" || st.finished) return <Frame><Done st={st} setSt={setSt} call={call} /></Frame>;
  if (phase === "submitting") return <Frame><div className="et-card et-center"><Loader2 size={30} className="spin" /><h2>Submitting your answers…</h2><p>{pending > 0 ? `Uploading ${pending} recording${pending > 1 ? "s" : ""}…` : "Marking your test — this takes a few seconds."} Don't close this page.</p></div></Frame>;
  if (phase === "intro") return <Frame><Intro st={st} stream={stream} onStart={begin} /></Frame>;

  const total = st.items.length; const doneN = Object.keys(done).length;
  return (
    <Frame>
      <div className="et-top">
        <span>{sec?.title} <small>· {secIdx + 1} of {sections.length}</small></span>
        <div className="et-prog"><i style={{ width: (doneN / total) * 100 + "%" }} /></div>
        {phase === "item" && <span className={"et-clock" + (secLeft < 30 ? " low" : "")}><Clock3 size={14} /> {fmtTime(secLeft)}</span>}
      </div>
      {phase === "section" && (
        <div className="et-card et-center">
          <span className="et-badge">{sec.skill}</span>
          <h2>{sec.title}</h2>
          <p>{sec.help}</p>
          <p className="et-mute">{items.length} question{items.length > 1 ? "s" : ""} · {sec.mins} minutes</p>
          <button data-plain className="et-btn" onClick={() => { setSecLeft(sec.mins * 60); setPhase("item"); }}>Start this part <ArrowRight size={16} /></button>
        </div>
      )}
      {phase === "item" && item && <Item key={item.id} it={item} n={itemIdx + 1} of={items.length} stream={stream} onJson={sendJson} onAudio={sendAudio} onPaste={() => call({ action: "event", kind: "paste" })} />}
    </Frame>
  );
}

function Frame({ children }) {
  return <div className="et"><header className="et-head"><ModoLogo size={26} /><span><ShieldCheck size={14} /> English fluency test</span></header><main className="et-main">{children}</main></div>;
}

function Intro({ st, stream, onStart }) {
  const [mic, setMic] = useState("idle"); const [lvl, setLvl] = useState(0); const raf = useRef(0);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  const checkMic = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      stream.current = s; setMic("ok");
      const ctx = new (window.AudioContext || window.webkitAudioContext)(); const an = ctx.createAnalyser(); ctx.createMediaStreamSource(s).connect(an);
      const buf = new Uint8Array(an.fftSize);
      const loop = () => { an.getByteTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v - 128)); setLvl(Math.min(1, m / 60)); raf.current = requestAnimationFrame(loop); }; loop();
    } catch { setMic("no"); }
  };
  return (
    <div className="et-card">
      <h1>Hi {st.name} 👋</h1>
      <p>This is the <b>{st.company}</b> English test for <b>{st.track}</b>. It checks how well you speak, listen, read and write English for phone calls with US customers.</p>
      <div className="et-facts">
        <div><Clock3 size={18} /><b>About 30 minutes</b><small>Each part has its own timer. You must finish within {st.limitMin} minutes of starting.</small></div>
        <div><Headphones size={18} /><b>Headset + quiet room</b><small>Use Chrome on a laptop or phone. Sound must be on.</small></div>
        <div><Mic size={18} /><b>You'll speak out loud</b><small>Some answers are recorded. Speak clearly at a natural speed.</small></div>
        <div><ShieldCheck size={18} /><b>One attempt</b><small>Answers can't be changed. Leaving the page or pasting text is noted.</small></div>
      </div>
      <div className="et-check">
        <div><b>1. Microphone</b>{mic === "ok" ? <span className="et-meter"><i style={{ width: lvl * 100 + "%" }} /></span> : <button data-plain className="et-btn ghost sm" onClick={checkMic}><Mic size={14} /> Allow microphone</button>}{mic === "ok" && <small>Say something — the bar should move.</small>}{mic === "no" && <small className="et-err">Microphone blocked. Allow it in the browser's address bar, then reload.</small>}</div>
        <div><b>2. Sound</b><button data-plain className="et-btn ghost sm" onClick={() => speak("Hello! If you can hear this clearly, your sound is working.") || alert("Your browser can't play the test voice — please use Google Chrome.")}><Volume2 size={14} /> Play a test sentence</button></div>
      </div>
      <button data-plain className="et-btn" disabled={mic !== "ok"} onClick={onStart}>{st.started ? "Continue my test" : "Start the test"} <ArrowRight size={16} /></button>
      {mic !== "ok" && <small className="et-mute" style={{ display: "block", marginTop: 8 }}>Allow the microphone to start.</small>}
    </div>
  );
}

function useRecorder(stream, maxSecs) {
  const [rec, setRec] = useState(false); const [secs, setSecs] = useState(0); const r = useRef(null); const chunks = useRef([]); const t = useRef(null); const t0 = useRef(0);
  useEffect(() => () => { clearInterval(t.current); try { if (r.current) r.current.onstop = null; r.current?.state === "recording" && r.current.stop(); } catch {} }, []); // time ran out mid-answer: drop it
  const start = (onDone) => {
    const s = stream.current; if (!s) return;
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || "";
    const m = new MediaRecorder(s, mime ? { mimeType: mime } : undefined); chunks.current = [];
    m.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    m.onstop = () => { clearInterval(t.current); setRec(false); onDone(new Blob(chunks.current, { type: m.mimeType || "audio/webm" }), Math.max(1, Math.round((Date.now() - t0.current) / 1000))); };
    r.current = m; m.start(500); t0.current = Date.now(); setRec(true); setSecs(0);
    t.current = setInterval(() => setSecs((x) => { if (x + 1 >= maxSecs) { try { m.stop(); } catch {} } return x + 1; }), 1000);
  };
  const stop = () => { try { r.current?.state === "recording" && r.current.stop(); } catch {} };
  return { rec, secs, start, stop };
}

function Item({ it, n, of, stream, onJson, onAudio, onPaste }) {
  const [plays, setPlays] = useState(0); const [playing, setPlaying] = useState(false);
  const [choice, setChoice] = useState(null); const [text, setText] = useState(""); const tStart = useRef(Date.now());
  const maxSecs = it.type === "speak-open" ? it.secs : it.type === "speak-text" ? 25 : 15;
  const R = useRecorder(stream, maxSecs);
  const play = () => { if (plays >= 2 || playing) return; setPlaying(true); setPlays((p) => p + 1); if (!speak(it.type === "choice-audio" ? it.audio : it.text, () => setPlaying(false))) setPlaying(false); };
  useEffect(() => { if (it.type === "speak-audio" || it.type === "choice-audio" || it.type === "type-audio") setTimeout(play, 600); return () => { try { window.speechSynthesis?.cancel(); } catch {} }; }, []); // eslint-disable-line
  const needsAudio = it.type === "speak-audio" || it.type === "choice-audio" || it.type === "type-audio";
  const wordsN = text.trim().split(/\s+/).filter(Boolean).length;
  const noPaste = (e) => { e.preventDefault(); onPaste(); };
  const recBtn = (
    R.rec ? <button data-plain className="et-btn rec" onClick={R.stop}><Square size={16} /> Stop · {fmtTime(R.secs)} / {fmtTime(maxSecs)}</button>
      : <button data-plain className="et-btn" disabled={needsAudio && plays === 0} onClick={() => R.start((blob, secs) => onAudio(it.id, blob, secs))}><Mic size={16} /> Record my answer</button>
  );
  return (
    <div className="et-card">
      <div className="et-qn">Question {n} of {of}</div>
      {needsAudio && (
        <div className="et-play">
          <button data-plain className={"et-playbtn" + (playing ? " on" : "")} onClick={play} disabled={plays >= 2 || playing}>{playing ? <Volume2 size={22} /> : <Play size={22} />}</button>
          <span>{playing ? "Listening…" : plays >= 2 ? "No more replays" : plays ? "Play again (1 left)" : "Press play"}</span>
        </div>
      )}
      {it.type === "speak-text" && <><p className="et-mute">Read this out loud:</p><blockquote className="et-read">{it.text}</blockquote>{recBtn}</>}
      {it.type === "speak-audio" && <><p className="et-mute">Listen, then repeat the sentence exactly.</p>{recBtn}</>}
      {it.type === "speak-build" && <><p className="et-mute">Put these phrases in the right order and say the whole sentence:</p><div className="et-chips">{it.parts.map((p) => <span key={p}>{p}</span>)}</div>{recBtn}</>}
      {it.type === "speak-open" && <><blockquote className="et-read sm">{it.prompt}</blockquote><p className="et-mute">Think for a few seconds, then record. Speak for 30–60 seconds.</p>{recBtn}</>}
      {(it.type === "choice" || it.type === "choice-audio") && (
        <>
          <h3 className="et-q">{it.q}</h3>
          <div className="et-opts">{it.options.map((o, i) => <button data-plain key={i} className={choice === i ? "on" : ""} disabled={it.type === "choice-audio" && plays === 0} onClick={() => setChoice(i)}><b>{"ABCD"[i]}</b>{o}</button>)}</div>
          <button data-plain className="et-btn" disabled={choice == null} onClick={() => onJson({ item: it.id, choice })}>Next <ArrowRight size={16} /></button>
        </>
      )}
      {it.type === "type-audio" && (
        <>
          <p className="et-mute">Type exactly what you heard.</p>
          <input className="et-input" value={text} onChange={(e) => setText(e.target.value)} onPaste={noPaste} autoComplete="off" spellCheck={false} autoCorrect="off" autoCapitalize="off" placeholder="Type the sentence here" />
          <button data-plain className="et-btn" disabled={!text.trim()} onClick={() => onJson({ item: it.id, text })}>Next <ArrowRight size={16} /></button>
        </>
      )}
      {it.type === "essay" && (
        <>
          <blockquote className="et-read sm">{it.prompt}</blockquote>
          <textarea className="et-input" rows={9} value={text} onChange={(e) => setText(e.target.value)} onPaste={noPaste} spellCheck={false} placeholder="Write your email here…" />
          <div className="et-row"><small className={wordsN < it.minWords ? "et-err" : "et-mute"}>{wordsN} words{wordsN < it.minWords ? ` — at least ${it.minWords}` : ""}</small>
            <button data-plain className="et-btn" disabled={wordsN < 10} onClick={() => onJson({ item: it.id, text, secs: Math.round((Date.now() - tStart.current) / 1000) })}>Submit email <ArrowRight size={16} /></button></div>
        </>
      )}
    </div>
  );
}

function Done({ st, setSt, call }) {
  const [busy, setBusy] = useState(""); const [err, setErr] = useState("");
  const book = async (id) => { setBusy(id); setErr(""); const r = await call({ action: "book", slotId: id }); setBusy(""); if (r.ok) setSt(r.d); else setErr(r.d.error); };
  const iv = st.interview;
  const days = {}; (st.slots || []).forEach((s) => (days[dayKey(s.at)] = [...(days[dayKey(s.at)] || []), s]));
  const gcal = iv ? (() => { const f = (d) => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z"); return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(st.company + " interview")}&dates=${f(iv.at)}/${f(new Date(new Date(iv.at).getTime() + iv.mins * 60000))}&details=${encodeURIComponent("Zoom: " + iv.joinUrl)}&location=${encodeURIComponent(iv.joinUrl)}`; })() : "";
  return (
    <div className="et-card et-center">
      <span className="et-ok"><CheckCircle2 size={34} /></span>
      <h2>Thank you, {st.name}! Your test is submitted.</h2>
      {iv ? (
        <div className="et-iv">
          <h3><Video size={18} /> Your Zoom interview</h3>
          <p><b>{when(iv.at)}</b> · {iv.mins} minutes{iv.interviewer ? ` · with ${iv.interviewer}` : ""}</p>
          <div className="et-row" style={{ justifyContent: "center" }}>
            <a className="et-btn" href={iv.joinUrl} target="_blank" rel="noreferrer"><Video size={16} /> Join on Zoom</a>
            <a className="et-btn ghost" href={gcal} target="_blank" rel="noreferrer"><CalendarPlus size={16} /> Add to calendar</a>
          </div>
          {iv.passcode && <p className="et-mute">Passcode: <b>{iv.passcode}</b></p>}
          <p className="et-mute">Join 5 minutes early, with a headset and your camera on. Save this page — the link stays here.</p>
        </div>
      ) : st.slots?.length ? (
        <div className="et-iv">
          <h3><CalendarPlus size={18} /> You're shortlisted — pick your Zoom interview time</h3>
          <div className="et-slots">{Object.entries(days).map(([d, list]) => <div key={d}><b>{d}</b><div>{list.map((s) => <button data-plain key={s.id} disabled={!!busy} onClick={() => book(s.id)}>{busy === s.id ? <Loader2 size={13} className="spin" /> : hour(s.at)}</button>)}</div></div>)}</div>
          <p className="et-mute">Times are shown in your local time.</p>
          {err && <p className="et-err">{err}</p>}
        </div>
      ) : (
        <p>The recruitment team will review your results and contact you about the next step.</p>
      )}
    </div>
  );
}
