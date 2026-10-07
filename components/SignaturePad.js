"use client";
// Draw a signature with a finger, pen or mouse. onChange(dataUrl | "") whenever it changes.
import { useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";

export default function SignaturePad({ onChange }) {
  const cv = useRef(null); const drawing = useRef(false); const last = useRef(null); const [empty, setEmpty] = useState(true);
  useEffect(() => {
    const c = cv.current; const r = c.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
    const g = c.getContext("2d"); g.scale(dpr, dpr); g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = "#1e1b4b"; g.lineWidth = 2.4;
  }, []);
  const pt = (e) => { const r = cv.current.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const down = (e) => { e.preventDefault(); cv.current.setPointerCapture?.(e.pointerId); drawing.current = true; last.current = pt(e); };
  const move = (e) => {
    if (!drawing.current) return; e.preventDefault();
    const g = cv.current.getContext("2d"); const p = pt(e); const l = last.current;
    g.beginPath(); g.moveTo(l.x, l.y); g.quadraticCurveTo(l.x, l.y, (l.x + p.x) / 2, (l.y + p.y) / 2); g.lineTo(p.x, p.y); g.stroke();
    last.current = p; if (empty) setEmpty(false);
  };
  const up = () => { if (!drawing.current) return; drawing.current = false; onChange?.(cv.current.toDataURL("image/png")); };
  const clear = () => { const c = cv.current; c.getContext("2d").clearRect(0, 0, c.width, c.height); setEmpty(true); onChange?.(""); };
  return (
    <div className="sigpad">
      <canvas ref={cv} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} onPointerCancel={up} aria-label="Signature box — draw your signature" />
      {empty && <span className="sigpad-hint">Sign here ✍️</span>}
      <span className="sigpad-line" />
      <button type="button" className="ghost sm sigpad-clear" onClick={clear} disabled={empty}><Eraser size={13} /> Clear</button>
    </div>
  );
}
