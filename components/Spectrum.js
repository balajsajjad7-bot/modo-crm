"use client";
// Live voice spectrum. Draws animated, mirrored frequency bars from one or more audio sources:
//  • getStreams(): returns MediaStreams (your mic, a call peer, captured tab audio), and/or
//  • audioRef: an <audio> element (WebRTC srcObject or a MediaSource/URL src).
// It only *reads* audio through an AnalyserNode that is never connected to the speakers, so it can't
// mute, echo or reroute what you hear (the old version hijacked the <audio> output and could go silent).
import { useEffect, useRef } from "react";

const elStream = (el) => {
  if (!el) return null;
  if (el.srcObject instanceof MediaStream) return el.srcObject;
  try { if (el.src && !el.paused) return el.captureStream ? el.captureStream() : el.mozCaptureStream ? el.mozCaptureStream() : null; } catch {}
  return null;
};

export default function Spectrum({ audioRef, getStreams, active, label, height = 54, bars = 48 }) {
  const canvas = useRef(null);
  const getRef = useRef(getStreams); getRef.current = getStreams; // inline functions don't restart the audio graph
  useEffect(() => {
    if (!active) return;
    const cv = canvas.current; if (!cv) return;
    const g = cv.getContext("2d"); if (!g) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    let ac = null, an = null, data = null, raf = 0, stop = false;
    const linked = new Map(); // stream id -> source node
    try { if (AC) { ac = new AC(); an = ac.createAnalyser(); an.fftSize = 256; an.smoothingTimeConstant = 0.8; data = new Uint8Array(an.frequencyBinCount); } } catch { ac = null; }
    const resume = () => ac && ac.state === "suspended" && ac.resume().catch(() => {});
    window.addEventListener("pointerdown", resume);

    const sync = () => {
      if (!ac) return;
      const list = [...(getRef.current?.() || []), elStream(audioRef?.current)].filter((s) => s && s.getAudioTracks?.().some((t) => t.readyState === "live"));
      const ids = new Set(list.map((s) => s.id));
      for (const s of list) if (!linked.has(s.id)) { try { const src = ac.createMediaStreamSource(s); src.connect(an); linked.set(s.id, src); } catch {} }
      for (const [id, src] of linked) if (!ids.has(id)) { try { src.disconnect(); } catch {} linked.delete(id); }
      resume();
    };
    sync(); const syncT = setInterval(sync, 800);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => { cv.width = (cv.clientWidth || 300) * dpr; cv.height = (cv.clientHeight || height) * dpr; };
    resize(); window.addEventListener("resize", resize);
    const css = getComputedStyle(document.documentElement);
    const c1 = css.getPropertyValue("--accent").trim() || "#8b5cf6", c2 = css.getPropertyValue("--gold").trim() || "#22d3ee";
    let t = 0;
    const draw = () => {
      if (stop) return;
      raf = requestAnimationFrame(draw);
      const W = cv.width, H = cv.height; g.clearRect(0, 0, W, H);
      const hasAudio = an && linked.size > 0;
      if (hasAudio) an.getByteFrequencyData(data);
      t += 0.05;
      const half = bars / 2, bw = W / bars;
      const grad = g.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, c2); grad.addColorStop(0.5, c1); grad.addColorStop(1, c2);
      g.fillStyle = grad;
      for (let i = 0; i < half; i++) {
        // mirrored: low frequencies (voice) in the middle, highs out to the sides; voice band ≈ first 40% of bins
        const v = hasAudio ? data[Math.floor((i / half) * data.length * 0.4)] / 255 : (Math.sin(t + i * 0.45) * 0.5 + 0.5) * 0.08 + 0.02;
        const bh = Math.max(2 * dpr, v * H * 0.94), y = (H - bh) / 2, w = bw * 0.62, r = Math.min(w / 2, 3 * dpr);
        for (const x of [(half + i) * bw + bw * 0.19, (half - 1 - i) * bw + bw * 0.19]) {
          g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + bh, r); g.arcTo(x + w, y + bh, x, y + bh, r); g.arcTo(x, y + bh, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); g.fill();
        }
      }
    };
    draw();
    return () => {
      stop = true; cancelAnimationFrame(raf); clearInterval(syncT);
      window.removeEventListener("resize", resize); window.removeEventListener("pointerdown", resume);
      for (const [, src] of linked) { try { src.disconnect(); } catch {} }
      try { ac?.close(); } catch {}
    };
  }, [active, audioRef, height, bars]);

  if (!active) return null;
  return (
    <div className="spectrum-wrap">
      {label && <span className="spectrum-label">{label}</span>}
      <canvas ref={canvas} className="spectrum-canvas" style={{ height }} />
    </div>
  );
}
