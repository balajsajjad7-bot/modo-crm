"use client";
// Congrats! When admin marks a sale Active, the agent who made it gets a celebration (confetti, the device,
// "Well done") the moment Modo is open. Admin sees a quick "Well done" burst when approving.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PartyPopper, X } from "lucide-react";
import DeviceArt from "@/components/DeviceArt";

const COLORS = ["#a78bfa", "#f472b6", "#22d3ee", "#facc15", "#34d399", "#fb923c"];
const $ = (n) => (n == null ? "" : "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 }));
const LINES = ["Well done!", "Brilliant work!", "Another one closed!", "You're on fire!", "Great job!"];

function chime() {
  try {
    const A = window.AudioContext || window.webkitAudioContext; if (!A) return; const a = new A();
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => { const o = a.createOscillator(), g = a.createGain(); o.type = "triangle"; o.frequency.value = f; o.connect(g); g.connect(a.destination);
      const t = a.currentTime + i * 0.11; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45); o.start(t); o.stop(t + 0.5); });
    setTimeout(() => a.close(), 1500);
  } catch {}
}

export function Confetti({ n = 70 }) {
  const bits = useRef(Array.from({ length: n }, (_, i) => ({ l: Math.random() * 100, d: Math.random() * 0.9, t: 2.2 + Math.random() * 1.6, c: COLORS[i % COLORS.length], r: Math.random() * 360, w: 6 + Math.random() * 6, s: Math.random() > 0.5 })));
  return <div className="cf" aria-hidden>{bits.current.map((b, i) => <i key={i} style={{ left: b.l + "%", animationDelay: b.d + "s", animationDuration: b.t + "s", background: b.c, width: b.w, height: b.s ? b.w : b.w * 0.45, borderRadius: b.s ? "50%" : 2, transform: `rotate(${b.r}deg)` }} />)}</div>;
}

// Admin approves → call cheer({ title, body, device, color }) for a quick burst.
export const cheer = (d) => { try { window.dispatchEvent(new CustomEvent("modo-cheer", { detail: d })); } catch {} };

export default function Cheers({ me }) {
  const [c, setC] = useState(null); const [burst, setBurst] = useState(null);
  const line = useRef(LINES[Math.floor(Math.random() * LINES.length)]);
  useEffect(() => {
    if (!me) return;
    let alive = true;
    const look = () => !document.hidden && fetch("/api/sales/cheers", { cache: "no-store" }).then((r) => r.json()).then((d) => { if (alive && d.sales?.length) { setC((x) => x || d); chime(); } }).catch(() => {});
    look(); const t = setInterval(look, 30000); document.addEventListener("visibilitychange", look);
    return () => { alive = false; clearInterval(t); document.removeEventListener("visibilitychange", look); };
  }, [me?.uid]); // eslint-disable-line
  useEffect(() => {
    const on = (e) => { setBurst({ ...e.detail, k: Date.now() }); chime(); };
    window.addEventListener("modo-cheer", on); return () => window.removeEventListener("modo-cheer", on);
  }, []);
  useEffect(() => { if (!burst) return; const t = setTimeout(() => setBurst(null), 3800); return () => clearTimeout(t); }, [burst]);

  const close = () => { if (c) fetch("/api/sales/cheers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: c.sales.map((s) => s.id) }) }).catch(() => {}); setC(null); };
  if (typeof document === "undefined") return null;
  const first = String(c?.name || me?.name || "").split(" ")[0];
  const top = c?.sales?.[0];
  return createPortal(<>
    {c && top && (
      <div className="cheer-bg" role="alertdialog" aria-label="Sale approved" onClick={close}>
        <Confetti />
        <div className="cheer" onClick={(e) => e.stopPropagation()}>
          <button className="ghost sm icon-btn cheer-x" aria-label="Close" onClick={close}><X size={16} /></button>
          <div className="cheer-art"><span className="cheer-glow" /><DeviceArt device={top.device} color={top.deviceColor} size={92} /><span className="cheer-pop">🎉</span></div>
          <h2>Congrats{first ? `, ${first}` : ""}!</h2>
          <p className="cheer-line">{line.current} {c.sales.length > 1 ? `${c.sales.length} of your sales were approved` : "Your sale was approved"} and {c.sales.length > 1 ? "are" : "is"} now <b>Active</b>.</p>
          <div className="cheer-list">
            {c.sales.map((s) => (
              <div key={s.id} className="cheer-row">
                <DeviceArt device={s.device} color={s.deviceColor} size={30} />
                <div style={{ minWidth: 0 }}><b>#{s.orderNumber || "—"} · {s.customer || "Customer"}</b><span className="small muted">{[s.device, s.storage].filter(Boolean).join(" · ") || "Device"}</span></div>
                <span className="cheer-val">{s.deviceValue != null ? $(s.deviceValue) : s.billAfter != null ? $(s.billAfter) + "/mo" : "✓"}</span>
              </div>
            ))}
          </div>
          {c.today > 1 && <p className="small muted" style={{ margin: 0 }}>🔥 {c.today} sales approved in the last 24 hours. Keep it going!</p>}
          <button onClick={close}><PartyPopper size={16} /> Thanks!</button>
        </div>
      </div>
    )}
    {burst && (
      <div className="cheer-burst" key={burst.k} role="status">
        <Confetti n={40} />
        <div className="cheer-toast">
          {burst.device ? <DeviceArt device={burst.device} color={burst.color} size={38} /> : <PartyPopper size={22} />}
          <div><b>{burst.title || "Well done!"}</b><span className="small">{burst.body}</span></div>
        </div>
      </div>
    )}
  </>, document.body);
}
