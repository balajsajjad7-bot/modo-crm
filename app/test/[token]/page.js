"use client";
// The candidate's Modo English Assessment (opened from their private link, no login).
// Speaking answers are recorded in the browser; sentences to repeat or type are spoken by the browser's voice.
import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, Play, Volume2, Headphones, Clock3, CheckCircle2, ArrowRight, Loader2, Video, CalendarPlus, ShieldCheck, AlertTriangle,
  BookOpen, Repeat2, Puzzle, SpellCheck, Keyboard, Mail, MessagesSquare, Chrome, Copy, Sparkles, Lock, FileText, UploadCloud } from "lucide-react";
import ModoLogo from "@/components/ModoLogo";
import Bot3D from "@/components/Bot3D";

const SEC = { read: [BookOpen, "#a78bfa", "#6d28d9"], repeat: [Repeat2, "#67e8f9", "#0891b2"], build: [Puzzle, "#fcd34d", "#d97706"], listen: [Headphones, "#93c5fd", "#2563eb"], mcq: [SpellCheck, "#6ee7b7", "#059669"], dictation: [Keyboard, "#fda4af", "#e11d48"], write: [Mail, "#f0abfc", "#a21caf"], speak: [MessagesSquare, "#fdba74", "#ea580c"] };
const fmtTime = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;
const when = (t) => new Date(t).toLocaleString(undefined, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
const dayKey = (t) => new Date(t).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
const hour = (t) => new Date(t).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

// WhatsApp / Instagram / Facebook open links in their own mini browser, which blocks the microphone.
const inAppBrowser = () => typeof navigator !== "undefined" && /WhatsApp|FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|TikTok|; wv\)/i.test(navigator.userAgent || "");
const isAndroid = () => typeof navigator !== "undefined" && /Android/i.test(navigator.userAgent || "");

// One audio player for the whole test. "Unlocked" on the first tap, so phones then allow it to play later.
let player = null;
const getPlayer = () => (player ||= typeof Audio !== "undefined" ? new Audio() : null);
let unlocked = false;
function unlockAudio() {
  const a = getPlayer(); if (!a || unlocked) return; unlocked = true;
  try { a.muted = true; a.src = "/audio/et/sample.mp3"; const p = a.play(); if (p) p.then(() => { a.pause(); a.muted = false; a.currentTime = 0; }).catch(() => { a.muted = false; }); } catch {}
}
// Play a recorded clip → resolves true when it starts, false if the browser refused.
function playClip(url, onEnd) {
  const a = getPlayer(); if (!a) return Promise.resolve(false);
  try { a.pause(); } catch {}
  a.muted = false; a.src = url; a.currentTime = 0;
  a.onended = onEnd; a.onerror = onEnd;
  unlocked = true;
  return a.play().then(() => true).catch(() => false);
}
const stopClip = () => { try { player?.pause(); } catch {} };

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

// Live sound bars from the microphone (used in the system check and while recording).
function Wave({ stream, on = true, bars = 28 }) {
  const ref = useRef(null);
  useEffect(() => {
    const s = stream?.current; if (!s || !on) return;
    let raf = 0, ctx;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)(); const an = ctx.createAnalyser(); an.fftSize = 128; ctx.createMediaStreamSource(s).connect(an);
      const buf = new Uint8Array(an.frequencyBinCount);
      const loop = () => {
        an.getByteFrequencyData(buf); const el = ref.current; if (!el) return;
        [...el.children].forEach((b, i) => { const v = buf[Math.floor((i / bars) * buf.length * 0.7) + 1] / 255; b.style.transform = `scaleY(${Math.max(0.08, v)})`; });
        raf = requestAnimationFrame(loop);
      }; loop();
    } catch {}
    return () => { cancelAnimationFrame(raf); try { ctx?.close(); } catch {} };
  }, [stream, on, bars]);
  return <div className="et-wave" ref={ref}>{Array.from({ length: bars }, (_, i) => <i key={i} />)}</div>;
}

function Ring({ left, total }) {
  const r = 18, c = 2 * Math.PI * r, p = total ? Math.max(0, left) / total : 0;
  return (
    <span className={"et-ring" + (left < 30 ? " low" : "")} title="Time left in this part">
      <svg viewBox="0 0 44 44"><circle cx="22" cy="22" r={r} className="bg" /><circle cx="22" cy="22" r={r} className="fg" style={{ strokeDasharray: c, strokeDashoffset: c * (1 - p) }} /></svg>
      <b>{fmtTime(left)}</b>
    </span>
  );
}

export default function TestPage({ params }) {
  const token = params.token;
  const [st, setSt] = useState(null); const [err, setErr] = useState("");
  const [phase, setPhase] = useState("intro"); // intro → section → item → submitting → done
  const [secIdx, setSecIdx] = useState(0); const [itemIdx, setItemIdx] = useState(0); const [secLeft, setSecLeft] = useState(0);
  const [done, setDone] = useState({}); const queue = useRef(Promise.resolve()); const [pending, setPending] = useState(0);
  const stream = useRef(null);

  const call = useCallback((body) => fetch(`/api/test/${token}`, { method: body ? "POST" : "GET", headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" }).then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({ error: "Server error (" + r.status + ")" })) })).catch(() => ({ ok: false, d: { error: "No internet connection. Check your connection and reload." } })), [token]);
  useEffect(() => {
    const h = document.documentElement; h.setAttribute("data-appearance", "dark"); h.setAttribute("data-theme", "dark");
    call().then((r) => { if (!r.ok) return setErr(r.d.error || "This link doesn't work."); setSt(r.d); setDone(Object.fromEntries((r.d.answered || []).map((k) => [k, 1]))); if (r.d.finished) setPhase("done"); });
    try { window.speechSynthesis?.getVoices(); } catch {}
  }, [call]);
  useEffect(() => {
    if (!(phase === "section" || phase === "item")) return;
    const f = () => { if (document.hidden) call({ action: "event", kind: "tab" }); };
    document.addEventListener("visibilitychange", f); return () => document.removeEventListener("visibilitychange", f);
  }, [phase, call]);

  const sections = (st?.sections || []).filter((s) => (st.items || []).some((i) => i.section === s.key));
  const sec = sections[secIdx];
  const items = sec ? st.items.filter((i) => i.section === sec.key) : [];
  const item = items[itemIdx];

  useEffect(() => { if (phase !== "item") return; const t = setInterval(() => setSecLeft((s) => s - 1), 1000); return () => clearInterval(t); }, [phase, secIdx]);
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
  const firstOpen = (sIdx, d = done) => { const s = sections[sIdx]; const its = s ? st.items.filter((i) => i.section === s.key) : []; return its.findIndex((i) => !d[i.id]); };
  const next = () => { const rest = items.findIndex((i, k) => k > itemIdx && !done[i.id]); if (rest >= 0) setItemIdx(rest); else nextSection(); };
  const nextSection = () => {
    let n = secIdx + 1; while (n < sections.length && firstOpen(n) < 0) n++;
    if (n >= sections.length) return finish();
    setSecIdx(n); setItemIdx(Math.max(0, firstOpen(n))); setPhase("section");
  };
  const finish = async () => {
    setPhase("submitting"); stopClip(); try { window.speechSynthesis?.cancel(); } catch {}
    await queue.current;
    const r = await call({ action: "finish" });
    try { stream.current?.getTracks().forEach((t) => t.stop()); } catch {}
    if (r.ok) setSt(r.d); else { const g = await call(); if (g.ok) setSt(g.d); }
    setPhase("done");
  };
  const begin = async () => {
    unlockAudio();
    const r = await call({ action: "start" }); if (!r.ok) return setErr(r.d.error);
    let n = 0; while (n < sections.length && firstOpen(n) < 0) n++;
    if (n >= sections.length) return finish();
    setSecIdx(n); setItemIdx(Math.max(0, firstOpen(n))); setPhase("section");
  };

  if (err) return <Frame><div className="et-card et-center"><span className="et-badge-ic warn"><AlertTriangle size={26} /></span><h2>{err}</h2><p className="et-mute">If you think this is a mistake, ask the recruiter to send you a new link.</p></div></Frame>;
  if (!st) return <Frame><div className="et-card et-center"><Loader2 className="spin" /> Loading your assessment…</div></Frame>;
  if (st.expired) return <Frame><div className="et-card et-center"><span className="et-badge-ic warn"><Clock3 size={26} /></span><h2>This link has expired</h2><p>Ask the recruiter to send you a new link.</p></div></Frame>;
  if (phase === "done" || st.finished) return <Frame name={st.name}><Done st={st} setSt={setSt} call={call} /></Frame>;
  if (phase === "submitting") return <Frame name={st.name}><Scoring pending={pending} /></Frame>;
  if (phase === "intro") return <Frame name={st.name}><Intro st={st} stream={stream} onStart={begin} /></Frame>;

  const total = st.items.length; const doneN = Object.keys(done).length;
  const [SIc, g1, g2] = SEC[sec?.key] || [Sparkles, "#a78bfa", "#6d28d9"];
  return (
    <Frame name={st.name} wide>
      <div className="et-shell">
        <aside className="et-rail">
          {sections.map((s, i) => { const [I, a, b] = SEC[s.key] || [Sparkles, "#a78bfa", "#6d28d9"]; const stt = i < secIdx || firstOpen(i) < 0 ? "done" : i === secIdx ? "on" : ""; return (
            <div key={s.key} className={"et-step " + stt}><span className="et-step-ic" style={{ "--g1": a, "--g2": b }}>{stt === "done" ? <CheckCircle2 size={15} /> : <I size={15} />}</span><span><b>{s.title}</b><small>{s.skill}</small></span></div>
          ); })}
        </aside>
        <div className="et-stage">
          <div className="et-top">
            <span className="et-sec-ic" style={{ "--g1": g1, "--g2": g2 }}><SIc size={16} /></span>
            <span className="et-top-t"><b>{sec?.title}</b><small>Part {secIdx + 1} of {sections.length} · {doneN}/{total} answered</small></span>
            {phase === "item" ? <Ring left={secLeft} total={(sec?.mins || 1) * 60} /> : null}
          </div>
          <div className="et-prog"><i style={{ width: (doneN / total) * 100 + "%" }} /></div>
          {phase === "section" && (
            <div className="et-card et-center et-secintro" key={"s" + secIdx}>
              <span className="et-hero-ic" style={{ "--g1": g1, "--g2": g2 }}><SIc size={34} /></span>
              <span className="et-badge">{sec.skill}</span>
              <h2>{sec.title}</h2>
              <p>{sec.help}</p>
              <div className="et-meta"><span><Clock3 size={14} /> {sec.mins} min</span><span><Sparkles size={14} /> {items.length} question{items.length > 1 ? "s" : ""}</span></div>
              <button data-plain className="et-btn" onClick={() => { unlockAudio(); setSecLeft(sec.mins * 60); setPhase("item"); }}>Start this part <ArrowRight size={16} /></button>
            </div>
          )}
          {phase === "item" && item && <Item key={item.id} it={item} n={itemIdx + 1} of={items.length} stream={stream} onJson={sendJson} onAudio={sendAudio} onPaste={() => call({ action: "event", kind: "paste" })} />}
        </div>
      </div>
    </Frame>
  );
}

function Frame({ children, name, wide }) {
  return (
    <div className="et">
      <div className="et-glow" aria-hidden="true" />
      <header className="et-head"><ModoLogo size={26} /><span className="et-head-t"><ShieldCheck size={14} /> Modo English Assessment</span>{name && <span className="et-who">{name}</span>}</header>
      <main className={"et-main" + (wide ? " wide" : "")}>{children}</main>
    </div>
  );
}

function OpenInBrowser() {
  const url = typeof location !== "undefined" ? location.href : "";
  const [copied, setCopied] = useState(false);
  const chrome = isAndroid() ? `intent://${url.replace(/^https?:\/\//, "")}#Intent;scheme=https;package=com.android.chrome;end` : url;
  return (
    <div className="et-inapp">
      <AlertTriangle size={18} />
      <div><b>Open this in Chrome first</b><p>WhatsApp's built-in browser can't use your microphone, so the assessment won't work here.{isAndroid() ? " Tap the button below." : " Tap ⋯ (top right) → Open in Safari/Chrome, or copy the link."}</p>
        <div className="et-row" style={{ justifyContent: "flex-start" }}>
          {isAndroid() && <a className="et-btn sm" href={chrome}><Chrome size={14} /> Open in Chrome</a>}
          <button data-plain className="et-btn ghost sm" onClick={() => navigator.clipboard?.writeText(url).then(() => setCopied(true))}><Copy size={14} /> {copied ? "Copied!" : "Copy link"}</button>
        </div>
      </div>
    </div>
  );
}

function Intro({ st, stream, onStart }) {
  const [mic, setMic] = useState("idle"); const [snd, setSnd] = useState("idle");
  const inApp = inAppBrowser();
  const canMic = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof window !== "undefined" && !!window.MediaRecorder;
  const canTts = true; // recorded clips play in every modern browser
  const [sndErr, setSndErr] = useState("");
  const testSound = async () => { setSndErr(""); const ok = await playClip("/audio/et/sample.mp3", () => {}); if (ok) setSnd("ok"); else setSndErr("Couldn't play sound. Turn the volume up, check silent mode, then tap again."); };
  const checkMic = async () => {
    if (!canMic) return setMic("unsupported");
    try { stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); setMic("ok"); } catch { setMic("no"); }
  };
  const ready = mic === "ok";
  return (
    <div className="et-intro">
      <div className="et-card et-hero">
        <div className="et-hero-l">
          <span className="et-badge"><Sparkles size={12} /> {st.track}</span>
          <h1>Hi {st.name}, welcome to your English assessment</h1>
          <p>{st.company} uses this to see how you'd sound on calls with US customers: speaking, listening, reading and writing. Relax, speak naturally, and do your best.</p>
          <div className="et-facts">
            <div><Clock3 size={18} /><b>About 30 minutes</b><small>8 short parts, each with its own timer. Finish within {st.limitMin} minutes.</small></div>
            <div><Headphones size={18} /><b>Headset + quiet room</b><small>Chrome on a laptop or phone, sound on.</small></div>
            <div><Mic size={18} /><b>You'll speak out loud</b><small>Some answers are recorded for the recruiter.</small></div>
            <div><Lock size={18} /><b>One attempt</b><small>Answers can't be changed. Leaving the page is noted.</small></div>
          </div>
        </div>
        <div className="et-hero-r" aria-hidden="true"><Bot3D c1="#a5b4fc" c2="#4338ca" eye="#67e8f9" size={0.95} /><span className="et-bubble">I'm your guide. Let's check your setup first!</span></div>
      </div>
      {inApp && <OpenInBrowser />}
      <div className="et-card">
        <h3>System check</h3>
        <div className="et-checks">
          <div className={"et-chk " + (mic === "ok" ? "ok" : mic === "no" || mic === "unsupported" ? "bad" : "")}>
            <span className="et-chk-ic"><Mic size={18} /></span>
            <div><b>Microphone</b><small>{mic === "ok" ? "Working — say something and watch the bars move." : mic === "no" ? "Blocked. Tap the 🔒 next to the address, allow Microphone, then reload." : mic === "unsupported" ? "This browser can't record. Open the link in Google Chrome." : "Allow Modo to use your microphone."}</small>
              {mic === "ok" && <Wave stream={stream} />}</div>
            {mic !== "ok" && <button data-plain className="et-btn sm" onClick={checkMic}><Mic size={14} /> Allow</button>}
          </div>
          <div className={"et-chk " + (snd === "ok" ? "ok" : !canTts ? "bad" : "")}>
            <span className="et-chk-ic"><Volume2 size={18} /></span>
            <div><b>Speaker / headset</b><small>{sndErr || (snd === "ok" ? "Playing — you should hear a voice now. Didn't hear it? Turn the volume up and play again." : "Turn your volume up, play the sample and make sure you hear it clearly.")}</small></div>
            {canTts && <button data-plain className="et-btn ghost sm" onClick={testSound}><Play size={14} /> Play sample</button>}
          </div>
          <div className={"et-chk " + (inApp ? "bad" : "ok")}>
            <span className="et-chk-ic"><Chrome size={18} /></span>
            <div><b>Browser</b><small>{inApp ? "You're inside WhatsApp's browser — open the link in Chrome." : "Supported."}</small></div>
          </div>
        </div>
        <button data-plain className="et-btn et-go" disabled={!ready} onClick={onStart}>{st.started ? "Continue my assessment" : "Start the assessment"} <ArrowRight size={16} /></button>
      </div>
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
  const [audioErr, setAudioErr] = useState("");
  // A play only counts once sound actually starts (if the phone blocks auto-play, the candidate just taps play).
  const play = async (auto) => {
    if (plays >= 2 || playing) return; setAudioErr("");
    if (it.clip) {
      setPlaying(true);
      const ok = await playClip(it.clip, () => setPlaying(false));
      if (ok) setPlays((p) => p + 1); else { setPlaying(false); if (!auto) setAudioErr("Couldn't play the audio. Turn the volume up and tap play again."); }
      return;
    }
    setPlaying(true); setPlays((p) => p + 1); if (!speak(it.type === "choice-audio" ? it.audio : it.text, () => setPlaying(false))) setPlaying(false);
  };
  useEffect(() => { if (it.type === "speak-audio" || it.type === "choice-audio" || it.type === "type-audio") setTimeout(() => play(true), 600); return () => { stopClip(); try { window.speechSynthesis?.cancel(); } catch {} }; }, []); // eslint-disable-line
  const isChoice = it.type === "choice" || it.type === "choice-audio";
  useEffect(() => {
    if (!isChoice) return;
    const k = (e) => { const i = "abcd".indexOf(e.key.toLowerCase()); if (i >= 0 && i < it.options.length) setChoice(i); if (e.key === "Enter" && choice != null) onJson({ item: it.id, choice }); };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [isChoice, choice]); // eslint-disable-line
  const needsAudio = it.type === "speak-audio" || it.type === "choice-audio" || it.type === "type-audio";
  const wordsN = text.trim().split(/\s+/).filter(Boolean).length;
  const noPaste = (e) => { e.preventDefault(); onPaste(); };
  const recBox = (
    <div className={"et-rec" + (R.rec ? " on" : "")}>
      {R.rec ? <>
        <div className="et-rec-top"><span className="et-dot" /> Recording <b>{fmtTime(R.secs)}</b><small>max {fmtTime(maxSecs)}</small></div>
        <Wave stream={stream} bars={40} />
        <div className="et-rec-bar"><i style={{ width: (R.secs / maxSecs) * 100 + "%" }} /></div>
        <button data-plain className="et-btn rec" onClick={R.stop}><Square size={15} /> Stop & save answer</button>
      </> : <button data-plain className="et-mic" disabled={needsAudio && plays === 0} onClick={() => R.start((blob, secs) => onAudio(it.id, blob, secs))}><Mic size={26} /><span>{needsAudio && plays === 0 ? "Listen first" : "Tap to record"}</span></button>}
    </div>
  );
  return (
    <div className="et-card et-q-card">
      <div className="et-qhead"><span className="et-qn">Question {n} of {of}</span><span className="et-dots">{Array.from({ length: of }, (_, i) => <i key={i} className={i < n - 1 ? "d" : i === n - 1 ? "c" : ""} />)}</span></div>
      {needsAudio && (
        <div className="et-play">
          <button data-plain className={"et-orb" + (playing ? " on" : "")} onClick={() => play(false)} disabled={plays >= 2 || playing} aria-label="Play">{playing ? <Volume2 size={26} /> : <Play size={26} />}<i /><i /></button>
          <div><b>{playing ? "Listen carefully…" : plays >= 2 ? "No more replays" : plays ? "Play once more" : "Tap play to listen"}</b><small>{audioErr ? <span className="et-err">{audioErr}</span> : `${2 - plays} play${2 - plays === 1 ? "" : "s"} left`}</small></div>
        </div>
      )}
      {it.type === "speak-text" && <><p className="et-mute">Read this out loud, clearly and at a natural pace:</p><blockquote className="et-read">{it.text}</blockquote>{recBox}</>}
      {it.type === "speak-audio" && <><p className="et-mute">Listen, then repeat the sentence exactly as you heard it.</p>{recBox}</>}
      {it.type === "speak-build" && <><p className="et-mute">Put these phrases in the right order and say the whole sentence:</p><div className="et-chips">{it.parts.map((p, i) => <span key={p}><em>{i + 1}</em>{p}</span>)}</div>{recBox}</>}
      {it.type === "speak-open" && <><span className="et-badge"><MessagesSquare size={12} /> Role-play</span><blockquote className="et-read sm">{it.prompt}</blockquote><p className="et-mute">Take a few seconds to think, then answer as the agent for 30–60 seconds.</p>{recBox}</>}
      {isChoice && (
        <>
          <h3 className="et-q">{it.q}</h3>
          <div className="et-opts">{it.options.map((o, i) => <button data-plain key={i} className={choice === i ? "on" : ""} disabled={it.type === "choice-audio" && plays === 0} onClick={() => setChoice(i)}><b>{"ABCD"[i]}</b><span>{o}</span>{choice === i && <CheckCircle2 size={16} />}</button>)}</div>
          <div className="et-row"><small className="et-mute">Tip: press A–D, then Enter</small><button data-plain className="et-btn" disabled={choice == null} onClick={() => onJson({ item: it.id, choice })}>Next <ArrowRight size={16} /></button></div>
        </>
      )}
      {it.type === "type-audio" && (
        <>
          <p className="et-mute">Type exactly what you heard.</p>
          <input className="et-input" value={text} onChange={(e) => setText(e.target.value)} onPaste={noPaste} onKeyDown={(e) => e.key === "Enter" && text.trim() && onJson({ item: it.id, text })} autoComplete="off" spellCheck={false} autoCorrect="off" autoCapitalize="off" placeholder="Type the sentence here" />
          <div className="et-row" style={{ justifyContent: "flex-end" }}><button data-plain className="et-btn" disabled={!text.trim()} onClick={() => onJson({ item: it.id, text })}>Next <ArrowRight size={16} /></button></div>
        </>
      )}
      {it.type === "essay" && (
        <>
          <blockquote className="et-read sm">{it.prompt}</blockquote>
          <div className="et-mail"><div className="et-mail-h"><Mail size={14} /> Reply to customer</div><textarea className="et-input" rows={10} value={text} onChange={(e) => setText(e.target.value)} onPaste={noPaste} spellCheck={false} placeholder="Hi there, …" /></div>
          <div className="et-row"><small className={wordsN < it.minWords ? "et-warn" : "et-good"}>{wordsN} words{wordsN < it.minWords ? ` · aim for ${it.minWords}+` : " ✓"}</small>
            <button data-plain className="et-btn" disabled={wordsN < 10} onClick={() => onJson({ item: it.id, text, secs: Math.round((Date.now() - tStart.current) / 1000) })}>Send email <ArrowRight size={16} /></button></div>
        </>
      )}
    </div>
  );
}

function Scoring({ pending }) {
  const steps = ["Saving your answers", "Listening to your recordings", "Checking grammar and vocabulary", "Calculating your Fluency Score"];
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((x) => Math.min(steps.length - 1, x + 1)), 1800); return () => clearInterval(t); }, []); // eslint-disable-line
  return (
    <div className="et-card et-center">
      <div className="et-orbit"><span /><span /><span /><Sparkles size={26} /></div>
      <h2>Finishing your assessment…</h2>
      <div className="et-steps">{steps.map((s, k) => <div key={s} className={k < i ? "d" : k === i ? "c" : ""}>{k < i ? <CheckCircle2 size={15} /> : k === i ? <Loader2 size={15} className="spin" /> : <i />} {s}</div>)}</div>
      <p className="et-mute">{pending > 0 ? `Uploading ${pending} recording${pending > 1 ? "s" : ""}… ` : ""}Please don't close this page.</p>
    </div>
  );
}

function Done({ st, setSt, call }) {
  const [busy, setBusy] = useState(""); const [err, setErr] = useState("");
  const book = async (id) => { setBusy(id); setErr(""); const r = await call({ action: "book", slotId: id }); setBusy(""); if (r.ok) setSt(r.d); else setErr(r.d.error); };
  const iv = st.interview;
  const days = {}; (st.slots || []).forEach((s) => (days[dayKey(s.at)] = [...(days[dayKey(s.at)] || []), s]));
  const gcal = iv ? (() => { const f = (d) => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z"); return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(st.company + " interview")}&dates=${f(iv.at)}/${f(new Date(new Date(iv.at).getTime() + iv.mins * 60000))}&details=${encodeURIComponent("Zoom: " + (iv.joinUrl || "link coming"))}&location=${encodeURIComponent(iv.joinUrl || "Zoom")}`; })() : "";
  return (
    <div className="et-card et-center et-done">
      <span className="et-ok"><CheckCircle2 size={36} /></span>
      <h2>Assessment complete. Well done, {st.name}!</h2>
      {iv ? (
        <div className="et-iv">
          <span className="et-badge"><Video size={12} /> Interview booked</span>
          <h3>{when(iv.at)}</h3>
          <p className="et-mute">{iv.mins} minute Zoom interview{iv.interviewer ? ` with ${iv.interviewer}` : ""}</p>
          <div className="et-row" style={{ justifyContent: "center" }}>
            {iv.joinUrl ? <a className="et-btn" href={iv.joinUrl} target="_blank" rel="noreferrer"><Video size={16} /> Join on Zoom</a> : <span className="et-mute">The Zoom link will be sent to you before the interview.</span>}
            <a className="et-btn ghost" href={gcal} target="_blank" rel="noreferrer"><CalendarPlus size={16} /> Add to calendar</a>
          </div>
          {iv.passcode && <p className="et-mute">Passcode: <b>{iv.passcode}</b></p>}
          <p className="et-mute">Join 5 minutes early with a headset and your camera on. This page keeps your link — bookmark it.</p>
        </div>
      ) : st.slots?.length ? (
        <div className="et-iv">
          <span className="et-badge"><Sparkles size={12} /> You're shortlisted</span>
          <h3>Pick a time for your Zoom interview</h3>
          <div className="et-slots">{Object.entries(days).map(([d, list]) => <div key={d}><b>{d}</b><div>{list.map((s) => <button data-plain key={s.id} disabled={!!busy} onClick={() => book(s.id)}>{busy === s.id ? <Loader2 size={13} className="spin" /> : hour(s.at)}</button>)}</div></div>)}</div>
          <p className="et-mute">Times are in your local time.</p>
          {err && <p className="et-err">{err}</p>}
        </div>
      ) : (
        <p>Thank you for your time. The recruitment team will review your assessment and contact you about the next step.</p>
      )}
      {!st.hasCv && <CvUpload />}
    </div>
  );
}

function CvUpload() {
  const [s, setS] = useState("idle"); const [err, setErr] = useState(""); const ref = useRef(null);
  const send = async (file) => {
    if (!file) return; setErr("");
    if (file.size > 6 * 1024 * 1024) return setErr("That file is over 6 MB.");
    setS("busy"); const fd = new FormData(); fd.set("file", file);
    const token = location.pathname.split("/").pop();
    const r = await fetch(`/api/test/${token}/cv`, { method: "POST", body: fd }).then(async (x) => ({ ok: x.ok, d: await x.json().catch(() => ({})) })).catch(() => ({ ok: false, d: { error: "Network problem." } }));
    if (r.ok) setS("done"); else { setS("idle"); setErr(r.d.error || "Upload failed."); }
  };
  return (
    <div className="et-cv">
      {s === "done" ? <><CheckCircle2 size={18} /><span><b>Resume received.</b> Thank you!</span></> : <>
        <FileText size={18} /><span><b>Add your resume</b><small>Optional — PDF, Word or a photo, up to 6 MB.</small></span>
        <input ref={ref} type="file" hidden accept=".pdf,.docx,.txt,.jpg,.jpeg,.png" onChange={(e) => send(e.target.files?.[0])} />
        <button data-plain className="et-btn ghost sm" disabled={s === "busy"} onClick={() => ref.current?.click()}>{s === "busy" ? <Loader2 size={14} className="spin" /> : <UploadCloud size={14} />} {s === "busy" ? "Uploading…" : "Upload"}</button>
        {err && <small className="et-err" style={{ gridColumn: "1/-1" }}>{err}</small>}
      </>}
    </div>
  );
}
