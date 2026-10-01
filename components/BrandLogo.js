"use client";
// Real company logo for a brand name, with graceful fallback to a favicon, then a letter badge.
import { useState } from "react";
import { brandDomain } from "@/lib/brands";

export default function BrandLogo({ name, domain, size = 22, round = 5 }) {
  const d = domain || brandDomain(name);
  const [i, setI] = useState(0);
  const srcs = d ? [`https://logo.clearbit.com/${d}`, `https://www.google.com/s2/favicons?domain=${d}&sz=64`] : [];
  if (!d || i >= srcs.length) {
    const L = (String(name || "?").trim()[0] || "?").toUpperCase();
    return <span className="brand-badge" style={{ width: size, height: size, fontSize: Math.round(size * 0.5), borderRadius: round }} aria-hidden>{L}</span>;
  }
  return <img className="brand-logo" src={srcs[i]} alt={name || ""} width={size} height={size} loading="lazy"
    onError={() => setI((x) => x + 1)} style={{ width: size, height: size, borderRadius: round }} />;
}
