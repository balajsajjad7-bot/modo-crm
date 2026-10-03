"use client";
// Full-width living 3D partner bar — a tilted conveyor of brand chips that scrolls across the
// whole screen. Drawn locally (no internet), pauses on hover, static for reduced-motion.

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
  const items = [...PARTNERS, ...PARTNERS]; // duplicated so the loop is seamless
  return (
    <div className="p3d-bar">
      <span className="p3d-label">Campaigns &amp; partners</span>
      <div className="p3d-viewport">
        <div className="p3d-track">
          {items.map((p, i) => (
            <div className="p3d-tile" key={i}>
              <span className="p3d-logo" style={{ background: p.bg, color: p.fg }}>{p.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
