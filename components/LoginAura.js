"use client";
// Original animated backdrop for the login — rising wine-red embers + soft glow, drawn on a canvas.
// Lightweight (few particles), pauses when the tab is hidden, static if reduced-motion is on.
import { useEffect, useRef } from "react";

export default function LoginAura() {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, dpr = Math.min(window.devicePixelRatio || 1, 2), raf = 0, stop = false;
    const resize = () => { w = canvas.clientWidth; h = canvas.clientHeight; canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize(); window.addEventListener("resize", resize);

    const N = Math.max(18, Math.min(42, Math.round((w * h) / 26000)));
    const rnd = (a, b) => a + Math.random() * (b - a);
    const make = (seed) => ({ x: rnd(0, w), y: seed ? rnd(0, h) : h + rnd(0, 40), r: rnd(1, 3.4), vy: rnd(0.15, 0.6), vx: rnd(-0.25, 0.25), hue: rnd(336, 352), a: rnd(0.25, 0.8), t: rnd(0, Math.PI * 2) });
    let ps = Array.from({ length: N }, () => make(true));

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      // soft ambient glow
      const g = ctx.createRadialGradient(w * 0.25, h * 0.2, 0, w * 0.25, h * 0.2, Math.max(w, h) * 0.7);
      g.addColorStop(0, "rgba(200,33,80,0.10)"); g.addColorStop(1, "rgba(200,33,80,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      for (const p of ps) {
        ctx.beginPath();
        const grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
        grd.addColorStop(0, `hsla(${p.hue},72%,50%,${p.a})`);
        grd.addColorStop(1, `hsla(${p.hue},72%,45%,0)`);
        ctx.fillStyle = grd; ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2); ctx.fill();
        if (!reduce) { p.y -= p.vy; p.x += p.vx + Math.sin((p.t += 0.01)) * 0.2; if (p.y < -10) Object.assign(p, make(false)); }
      }
      if (!stop && !reduce) raf = requestAnimationFrame(draw);
    };
    draw();
    const onVis = () => { if (document.hidden) { stop = true; cancelAnimationFrame(raf); } else if (!reduce) { stop = false; draw(); } };
    document.addEventListener("visibilitychange", onVis);
    return () => { stop = true; cancelAnimationFrame(raf); window.removeEventListener("resize", resize); document.removeEventListener("visibilitychange", onVis); };
  }, []);
  return <canvas ref={ref} className="login-aura" aria-hidden="true" />;
}
