"use client";
// Small map for Customer 360: the customer's pin plus the nearest UPS and carrier stores.
import { useEffect, useRef } from "react";
import "maplibre-gl/dist/maplibre-gl.css";

const STYLE = "https://tiles.openfreemap.org/styles/liberty";
const COLORS = { customer: "#8b5cf6", UPS: "#a16207", Verizon: "#e11d48", "AT&T": "#0ea5e9", "T-Mobile": "#db2777" };

export default function IntelMap({ center, stores }) {
  const box = useRef(null), map = useRef(null);
  useEffect(() => {
    let dead = false;
    (async () => {
      if (!box.current || !center) return;
      const maplibregl = (await import("maplibre-gl")).default;
      if (dead) return;
      map.current?.remove();
      const m = new maplibregl.Map({ container: box.current, style: STYLE, center: [center.lng, center.lat], zoom: 12.5, attributionControl: { compact: true } });
      map.current = m;
      m.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      const pin = (lng, lat, color, label, big) => {
        const el = document.createElement("div");
        el.className = "ci-pin" + (big ? " big" : "");
        el.style.setProperty("--c", color);
        el.title = label;
        new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).setPopup(new maplibregl.Popup({ offset: 14, closeButton: false }).setText(label)).addTo(m);
      };
      const all = [...(stores?.ups || []), ...(stores?.carriers || [])];
      all.forEach((s) => pin(s.lng, s.lat, COLORS[s.brand] || "#64748b", `${s.name}${s.addr ? " — " + s.addr : ""} · ${s.mi.toFixed(1)} mi`));
      pin(center.lng, center.lat, COLORS.customer, "Customer", true);
      if (all.length) {
        const b = new maplibregl.LngLatBounds([center.lng, center.lat], [center.lng, center.lat]);
        all.slice(0, 6).forEach((s) => b.extend([s.lng, s.lat]));
        m.once("load", () => m.fitBounds(b, { padding: 48, maxZoom: 14, duration: 0 }));
      }
    })();
    return () => { dead = true; map.current?.remove(); map.current = null; };
  }, [center?.lat, center?.lng, stores]);
  return <div ref={box} className="ci-map" role="img" aria-label="Map of the customer's area" />;
}
