"use client";
// MODO logo. Mark: a monogram "M" drawn as one continuous ribbon, inside a glass tile, with a "live" dot —
// a call that's on. Wordmark: geometric MODO where the last O carries the same live dot.
// Colours follow the current palette (--s secondary → --p primary), so the logo always matches the theme.
import { useId } from "react";

const GRAD = (id) => (
  <linearGradient id={id} x1="0" y1="0" x2=".6" y2="1">
    <stop offset="0" style={{ stopColor: "rgb(var(--s-hi, 165,243,252))" }} />
    <stop offset="1" style={{ stopColor: "rgb(var(--s, 34,211,238))" }} />
  </linearGradient>
);

export function ModoMark({ size = 40, glow = true, className = "" }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg className={"modo-mark " + className} width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Modo">
      <defs>
        {GRAD("g" + id)}
        <linearGradient id={"t" + id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: "rgb(var(--p-lo, 76,29,149))" }} />
          <stop offset="1" style={{ stopColor: "rgb(var(--bg, 7,8,15))" }} />
        </linearGradient>
        <radialGradient id={"h" + id} cx=".3" cy=".15" r=".9">
          <stop offset="0" stopColor="#fff" stopOpacity=".28" />
          <stop offset=".5" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        {/* back half is darkest at the fold (where it runs under the front half) and lightens towards the top */}
        <linearGradient id={"b" + id} gradientUnits="userSpaceOnUse" x1="32" y1="37" x2="45" y2="20">
          <stop offset="0" style={{ stopColor: "rgb(var(--p-lo, 76,29,149))" }} />
          <stop offset=".35" style={{ stopColor: "rgb(var(--p, 139,92,246))" }} />
          <stop offset="1" style={{ stopColor: "rgb(var(--p-hi, 196,181,253))" }} />
        </linearGradient>
        {glow && <filter id={"f" + id} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.8" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>}
      </defs>
      <rect x="1" y="1" width="62" height="62" rx="18" fill={`url(#t${id})`} />
      <rect x="1" y="1" width="62" height="62" rx="18" fill={`url(#h${id})`} />
      <rect x="1.5" y="1.5" width="61" height="61" rx="17.5" fill="none" stroke={`url(#g${id})`} strokeOpacity=".55" />
      {/* M as a folded ribbon: the back half (primary) runs under the front half (secondary), with a soft fold shadow */}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round" filter={glow ? `url(#f${id})` : undefined}>
        <path d="M32 37 L42.5 22.5 Q45.5 18.6 45.5 23.5 V46" stroke={`url(#b${id})`} strokeWidth="7" />
        <path d="M18.5 46 V23.5 Q18.5 18.6 21.5 22.5 L32 37" stroke={`url(#g${id})`} strokeWidth="7" />
      </g>
      <circle cx="50.5" cy="13.5" r="3.6" fill="#4ade80" />
      <circle cx="50.5" cy="13.5" r="3.6" fill="none" stroke="#4ade80" strokeOpacity=".5" strokeWidth="2.2" className="modo-live" />
    </svg>
  );
}

export function ModoWord({ height = 22, className = "" }) {
  const id = useId().replace(/:/g, "");
  // 184 x 44 grid, stroke letters, even optical gaps between letters
  return (
    <svg className={"modo-word " + className} height={height} viewBox="0 0 184 44" role="img" aria-label="MODO">
      <defs><linearGradient id={"w" + id} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" className="mw1" />
        <stop offset=".55" className="mw2" />
        <stop offset="1" className="mw3" />
      </linearGradient></defs>
      <g fill="none" stroke={`url(#w${id})`} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 39 V9 Q5 5 8 8 L21 24 L34 8 Q37 5 37 9 V39" />
        <circle cx="70" cy="22" r="17" />
        <path d="M103 5 H110 A17 17 0 0 1 110 39 H103 Z" />
        <circle cx="160" cy="22" r="17" />
      </g>
      <circle cx="160" cy="22" r="5.5" fill="#4ade80" />
    </svg>
  );
}

export default function ModoLogo({ size = 40, word = true, stack = false, className = "" }) {
  return (
    <span className={"modo-logo" + (stack ? " stack" : "") + (className ? " " + className : "")}>
      <ModoMark size={size} />
      {word && <ModoWord height={Math.round(size * (stack ? 0.62 : 0.5))} />}
    </span>
  );
}
