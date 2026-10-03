"use client";
// Supervisor listen-in panel: both voices live, animated voice meters, subtitles and AI nervousness per side.
import { useEffect, useRef, useState } from "react";
import { startListening } from "@/components/listen";
import { dur } from "@/lib/fmt";
import { Headphones, Volume2, VolumeX, X, Sparkles } from "lucide-react";

const lines = (t) => (t || "").split("\n").filter(Boolean).map((l) => (l.startsWith("C: ") ? { who: "C", text: l.slice(3) } : { who: "A", text: l.startsWith("A: ") ? l.slice(3) : l }));

// Animated bars driven by the real audio level of one voice
function VoiceWave({ stream, color, label, muted, onToggle, volume }) {
  const canvas = useRef(null); const audio = useRef(null);
  useEffect(() => {
    if (!stream) return;
    const el = audio.current; el.srcObject = stream; el.play?.().catch(() => {});
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    const src = ctx.createMediaStreamSource(stream); const an = ctx.createAnalyser(); an.fftSize = 128; an.smoothingTimeConstant = 0.75; src.connect(an);
    const data = new Uint8Array(an.frequencyBinCount); let raf;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const c = canvas.current; if (!c) return; const g = c.getContext("2d"); const w = c.width = c.clientWidth * 2, h = c.height = c.clientHeight * 2;
      an.getByteFrequencyData(data); g.clearRect(0, 0, w, h);
      // Mirrored spectrum: low voices in the middle, highs to the sides, with a soft glow
      const half = 24, gap = 5, bw = (w - gap * (half * 2 - 1)) / (half * 2);
      const grad = g.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, color); grad.addColorStop(0.5, "#ffffff"); grad.addColorStop(1, color);
      g.shadowColor = color; g.shadowBlur = 12;
      for (let i = 0; i < half; i++) {
        const v = Math.pow(data[Math.floor((i / half) * data.length * 0.6)] / 255, 1.3); const bh = Math.max(4, v * h * 0.95);
        g.fillStyle = grad; g.globalAlpha = 0.3 + v * 0.7;
        for (const side of [-1, 1]) {
          const x = w / 2 + (side === 1 ? i * (bw + gap) + gap / 2 : -(i + 1) * (bw + gap) + gap / 2); const y = (h - bh) / 2; const r = Math.min(bw / 2, 5);
          g.beginPath(); g.roundRect ? g.roundRect(x, y, bw, bh, r) : g.rect(x, y, bw, bh); g.fill();
        }
      }
    };
    draw();
    return () => { cancelAnimationFrame(raf); try { ctx.close(); } catch {} };
  }, [stream, color]);
  useEffect(() => { if (audio.current) { audio.current.muted = muted; audio.current.volume = volume; } }, [muted, volume]);
  return (
    <div className="wave">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span className="wave-lbl" style={{ color }}>{label}</span>
        <button className="ghost sm icon-btn" onClick={onToggle} aria-label={muted ? `Unmute ${label}` : `Mute ${label}`} disabled={!stream}>{muted ? <VolumeX size={13} /> : <Volume2 size={13} />}</button>
      </div>
      {stream ? <canvas ref={canvas} /> : <div className="wave-off">{label === "Customer" ? "Customer audio isn't shared yet (agent must press “Hear the customer too”)" : "Connecting…"}</div>}
      <audio ref={audio} autoPlay playsInline />
    </div>
  );
}

function Meter({ label, value, state }) {
  const v = Number.isFinite(value) ? value : null;
  return (
    <div className="nerv">
      <div className="row" style={{ justifyContent: "space-between" }}><span className="sf-l">{label}</span><b>{state || "—"}</b></div>
      <div className="nerv-track"><div style={{ width: (v ?? 0) + "%", background: v >= 60 ? "#ff4d5a" : v >= 35 ? "#e0c27c" : "#7fd6a0" }} /></div>
      <span className="small muted">{v == null ? "waiting for speech" : `${v}% nervous`}</span>
    </div>
  );
}

export default function ListenPanel({ call, onClose, muted, setMuted }) {
  const [streams, setStreams] = useState({}); const [err, setErr] = useState(""); const [vol, setVol] = useState(1); const [side, setSide] = useState({ agent: false, customer: false });
  const handle = useRef(null); const [slow, setSlow] = useState(false);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => alive && setSlow(true), 15000); // stop hanging forever with a helpful hint
    startListening(call.id, (who, st) => { if (alive) { clearTimeout(t); setSlow(false); setStreams((s) => ({ ...s, [who]: st })); } }, () => alive && setErr("The call ended."))
      .then((h) => { if (alive) handle.current = h; else h.close(); })
      .catch((e) => setErr(e.message));
    return () => { alive = false; clearTimeout(t); handle.current?.close(); };
  }, [call.id]);
  const L = lines(call.transcript).slice(-6);
  const secs = Math.floor((Date.now() - new Date(call.startedAt)) / 1000);
  return (
    <article className={"panel listen" + (muted ? " dim" : "")}>
      <header className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
        <div className="row" style={{ gap: 8 }}><Headphones size={17} /><b>{call.user.name}</b><span className="live-dot" /><span className="muted small num">{dur(secs)}</span></div>
        <div className="row" style={{ gap: 6 }}>
          <input type="range" min="0" max="1" step="0.05" value={vol} onChange={(e) => setVol(+e.target.value)} aria-label="Volume" style={{ width: 90, padding: 0 }} />
          <button className="ghost sm" onClick={() => setMuted(!muted)}>{muted ? "Unmute call" : "Mute call"}</button>
          <button className="ghost sm icon-btn" onClick={onClose} aria-label="Stop listening"><X size={14} /></button>
        </div>
      </header>
      {err && <p className="err small" style={{ margin: 0 }}>{err}</p>}
      {!streams.agent && !err && !slow && <p className="muted small" style={{ margin: 0 }}>Connecting to {call.user.name.split(" ")[0]}'s browser… Their Call assist page must be open.</p>}
      {!streams.agent && !err && slow && <p className="err small" style={{ margin: 0 }}>Couldn't connect to {call.user.name.split(" ")[0]}'s browser. This needs: (1) the agent has <b>Call assist</b> open with a live call, and (2) a working voice relay (TURN). For a real customer call, use the <b>Dialer → Listen</b> button instead — it rings your phone through VICIdial and doesn't need any of this.</p>}
      <div className="waves">
        <VoiceWave stream={streams.agent} color="#d12254" label="Agent" muted={muted || side.agent} volume={vol} onToggle={() => setSide({ ...side, agent: !side.agent })} />
        <VoiceWave stream={streams.customer} color="#6cc4ff" label="Customer" muted={muted || side.customer} volume={vol} onToggle={() => setSide({ ...side, customer: !side.customer })} />
      </div>
      <div className="nervs">
        <Meter label="Agent" value={call.agentNerv} state={call.agentState} />
        <Meter label="Customer" value={call.custNerv} state={call.customerState || call.mood} />
      </div>
      <div className="subs">{L.length ? L.map((l, i) => <p key={i} className={l.who === "C" ? "c" : "a"} style={{ opacity: 0.45 + (i + 1) / L.length * 0.55 }}><b>{l.who === "C" ? "Customer" : call.user.name.split(" ")[0]}</b>{l.text}</p>) : <p className="muted">Waiting for speech…</p>}</div>
      {call.summary && <p className="live-sum"><Sparkles size={12} /> {call.summary}</p>}
      {(() => { let x = null; try { x = JSON.parse(call.live || "null"); } catch {} if (!x) return null; const f = Object.entries(x.facts || {}).filter(([, v]) => v);
        return (<div className="la-grid">
          {x.objection && <div className="la-card obj"><span className="sf-l">Objection</span><b>“{x.objection}”</b>{x.rebuttal && <p className="small">AI suggests: {x.rebuttal}</p>}</div>}
          {x.warning && <div className="la-warn">⚠ {x.warning}</div>}
          {x.buyingSignal && <div className="la-buy">🔥 {x.buyingSignal}</div>}
          {f.length > 0 && <div className="la-card"><span className="sf-l">What we know</span><div className="la-facts">{f.map(([k, v]) => <div key={k}><span>{k}</span><b>{String(v)}</b></div>)}</div></div>}
          <div className="la-card"><span className="sf-l">Checklist</span><div className="la-check">{Object.entries({ intro: "Intro", recorded: "Recorded", needs: "Needs", price: "Price", terms: "Terms", agreement: "Yes", confirmed: "Confirmed" }).map(([k, l]) => <span key={k} className={x.checklist?.[k] ? "on" : ""}>{x.checklist?.[k] ? "✓" : "○"} {l}</span>)}</div></div>
        </div>); })()}
    </article>
  );
}
