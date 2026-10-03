"use client";
import { useEffect, useRef } from "react";

// Voice spectrum visualizer for live-listen. Attaches a Web Audio AnalyserNode to the
// hidden <audio> element that plays the agent's relayed mic, and draws animated frequency
// bars on a canvas while listening. Nothing is recorded — it only reads what is playing.
export default function Spectrum({ audioRef, active }) {
  const canvas = useRef(null);
  const ctxRef = useRef(null);      // AudioContext (created once, reused)
  const srcRef = useRef(null);      // MediaElementSource (one per element, ever)
  const anRef = useRef(null);       // AnalyserNode
  const raf = useRef(0);

  // Build the audio graph once, the first time we go active (needs a user gesture to resume).
  useEffect(() => {
    if (!active) return;
    const el = audioRef?.current;
    if (!el) return;
    try {
      if (!ctxRef.current) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctxRef.current = new AC();
      }
      const ac = ctxRef.current;
      if (ac.state === "suspended") ac.resume().catch(() => {});
      if (!srcRef.current) {
        // createMediaElementSource can only be called once per element for the life of the page.
        srcRef.current = ac.createMediaElementSource(el);
        anRef.current = ac.createAnalyser();
        anRef.current.fftSize = 128;
        anRef.current.smoothingTimeConstant = 0.78;
        srcRef.current.connect(anRef.current);
        anRef.current.connect(ac.destination); // keep audio audible
      }
    } catch {}
  }, [active, audioRef]);

  // Draw loop.
  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const g = cv.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => { const w = cv.clientWidth || 300, h = cv.clientHeight || 54; cv.width = w * dpr; cv.height = h * dpr; };
    resize();
    window.addEventListener("resize", resize);

    const bars = 40;
    let t = 0;
    const draw = () => {
      raf.current = requestAnimationFrame(draw);
      const W = cv.width, H = cv.height;
      g.clearRect(0, 0, W, H);
      const an = anRef.current;
      let data;
      if (active && an) {
        data = new Uint8Array(an.frequencyBinCount);
        an.getByteFrequencyData(data);
      }
      t += 0.05;
      const bw = W / bars;
      for (let i = 0; i < bars; i++) {
        let v;
        if (data) {
          const idx = Math.floor((i / bars) * data.length);
          v = data[idx] / 255;
        } else {
          // Gentle idle shimmer when not connected.
          v = active ? 0.04 : (Math.sin(t + i * 0.5) * 0.5 + 0.5) * 0.12 + 0.03;
        }
        const bh = Math.max(2 * dpr, v * H * 0.92);
        const x = i * bw + bw * 0.18;
        const y = (H - bh) / 2;
        const w = bw * 0.64;
        const grad = g.createLinearGradient(0, y, 0, y + bh);
        grad.addColorStop(0, "#ff8a3d");
        grad.addColorStop(1, "#ff4d2e");
        g.fillStyle = grad;
        const r = Math.min(w / 2, 3 * dpr);
        // rounded bar
        g.beginPath();
        g.moveTo(x + r, y);
        g.arcTo(x + w, y, x + w, y + bh, r);
        g.arcTo(x + w, y + bh, x, y + bh, r);
        g.arcTo(x, y + bh, x, y, r);
        g.arcTo(x, y, x + w, y, r);
        g.closePath();
        g.fill();
      }
    };
    draw();
    return () => { cancelAnimationFrame(raf.current); window.removeEventListener("resize", resize); };
  }, [active]);

  if (!active) return null;
  return (
    <div className="spectrum-wrap">
      <canvas ref={canvas} className="spectrum-canvas" />
    </div>
  );
}
