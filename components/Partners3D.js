"use client";
// Living 3D ring of affiliated partners. Logos are drawn locally (brand-colored chips) so it
// never waits on the internet. The ring slowly spins; drag or hover pauses it.
import { useState } from "react";

const PARTNERS = [
  { name: "Verizon", bg: "#ee0000", fg: "#fff" },
  { name: "AT&T", bg: "#00a8e0", fg: "#fff" },
  { name: "T-Mobile", bg: "#e20074", fg: "#fff" },
  { name: "Amazon", bg: "#ff9900", fg: "#111" },
  { name: "eBay", bg: "#ffffff", fg: "#e53238" },
  { name: "Walmart", bg: "#0071ce", fg: "#ffc220" },
  { name: "Western Union", bg: "#ffdd00", fg: "#111" },
  { name: "MoneyGram", bg: "#e31b23", fg: "#fff" },
  { name: "UPS", bg: "#351c15", fg: "#ffb500" },
  { name: "FedEx", bg: "#4d148c", fg: "#ff6600" },
  { name: "USPS", bg: "#333366", fg: "#fff" },
  { name: "DHL", bg: "#ffcc00", fg: "#d40511" },
];

export default function Partners3D() {
  const [paused, setPaused] = useState(false);
  const n = PARTNERS.length;
  const radius = 300; // px
  return (
    <div className="p3d-wrap" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <span className="p3d-label">Campaigns &amp; partners</span>
      <div className="p3d-stage">
        <div className={"p3d-ring" + (paused ? " paused" : "")}>
          {PARTNERS.map((p, i) => (
            <div key={p.name} className="p3d-card" style={{ transform: `rotateY(${(360 / n) * i}deg) translateZ(${radius}px)` }}>
              <span className="p3d-logo" style={{ background: p.bg, color: p.fg }}>{p.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
