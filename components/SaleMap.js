"use client";
// 3D map of the customer's location with the nearest UPS locations (free OpenFreeMap tiles, 3D buildings).
import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapPin, Navigation, RefreshCw, Store, Box, ExternalLink } from "lucide-react";

const mi = (m) => (m == null ? "" : m < 160 ? `${Math.round(m * 3.28)} ft` : `${(m / 1609.34).toFixed(m < 16093 ? 1 : 0)} mi`);
const STYLE = "https://tiles.openfreemap.org/styles/liberty";

export default function SaleMap({ sale }) {
  const box = useRef(null); const map = useRef(null); const marks = useRef([]);
  const [geo, setGeo] = useState(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [three, setThree] = useState(true);
  const addr = [sale.address, sale.zip].filter(Boolean).join(" ");

  async function load(refresh) {
    setBusy(true); setErr("");
    const r = await fetch(`/api/sales/geo?id=${encodeURIComponent(sale.id)}${refresh ? "&refresh=1" : ""}`, { cache: "no-store" });
    const d = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) return setErr(d.error || "Couldn't load the map.");
    setGeo(d);
  }
  useEffect(() => { if (sale.id && addr) load(false); }, [sale.id]); // eslint-disable-line

  useEffect(() => {
    if (!geo || !box.current) return;
    let alive = true;
    (async () => {
      const maplibregl = (await import("maplibre-gl")).default;
      if (!alive) return;
      if (!map.current) {
        map.current = new maplibregl.Map({ container: box.current, style: STYLE, center: [geo.lng, geo.lat], zoom: 16.2, pitch: 62, bearing: -25, antialias: true, attributionControl: { compact: true } });
        map.current.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
        map.current.scrollZoom.disable(); // don't hijack page scrolling; pinch / buttons still zoom
        map.current.on("click", () => map.current.scrollZoom.enable());
      }
      marks.current.forEach((m) => m.remove()); marks.current = [];
      const pin = (cls, html) => { const el = document.createElement("div"); el.className = "sm-pin " + cls; el.innerHTML = html; return el; };
      marks.current.push(new maplibregl.Marker({ element: pin("cust", "<span>🏠</span>"), anchor: "bottom" }).setLngLat([geo.lng, geo.lat])
        .setPopup(new maplibregl.Popup({ offset: 24 }).setText(`${sale.customer || "Customer"} — ${addr}`)).addTo(map.current));
      geo.stores.forEach((s, i) => marks.current.push(new maplibregl.Marker({ element: pin("ups", `<span>${i + 1}</span>`), anchor: "bottom" }).setLngLat([s.lng, s.lat])
        .setPopup(new maplibregl.Popup({ offset: 24 }).setText(`${s.name}${s.addr ? " — " + s.addr : ""} (${mi(s.m)})`)).addTo(map.current)));
      // Show the customer and the nearest store together
      if (geo.stores[0]) {
        const b = new maplibregl.LngLatBounds([geo.lng, geo.lat], [geo.lng, geo.lat]); b.extend([geo.stores[0].lng, geo.stores[0].lat]);
        map.current.fitBounds(b, { padding: 70, pitch: 62, bearing: -25, maxZoom: 16.5, duration: 1200 });
      } else map.current.flyTo({ center: [geo.lng, geo.lat], zoom: 16.2, pitch: 62, duration: 1000 });
    })();
    return () => { alive = false; };
  }, [geo]); // eslint-disable-line
  useEffect(() => () => { try { map.current?.remove(); } catch {} map.current = null; }, []);

  const tilt = () => { const on = !three; setThree(on); map.current?.easeTo({ pitch: on ? 62 : 0, bearing: on ? -25 : 0, duration: 700 }); };
  const focus = (s) => { map.current?.flyTo({ center: [s.lng, s.lat], zoom: 17, pitch: 62, duration: 900 }); };
  const gmaps = (to) => `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(addr)}&destination=${encodeURIComponent(to)}`;

  if (!addr) return <p className="muted small" style={{ margin: 0 }}>No address on this sale, so there's no map.</p>;
  return (
    <div className="smap">
      <div className="sm-map-wrap">
        <div ref={box} className="sm-map" />
        {!geo && <div className="sm-overlay">{err ? <span className="err small">{err}</span> : <span className="muted small">Finding {sale.customer?.split(" ")[0] || "the customer"} on the map…</span>}</div>}
        {geo && <div className="sm-tools">
          <button className="ghost sm" onClick={tilt}><Box size={13} /> {three ? "2D" : "3D"}</button>
          <button className="ghost sm" onClick={() => focus(geo)}><MapPin size={13} /> Customer</button>
          <button className="ghost sm icon-btn" aria-label="Refresh" onClick={() => load(true)} disabled={busy}><RefreshCw size={13} className={busy ? "spin" : ""} /></button>
        </div>}
      </div>
      <div className="sm-side">
        <div className="sm-h"><Store size={14} /> Nearest UPS {geo && !geo.stores.length && <span className="muted small">— none mapped nearby</span>}</div>
        {!geo && !err && <p className="muted small" style={{ margin: 0 }}>Looking…</p>}
        {geo?.stores.map((s, i) => (
          <div key={i} className="sm-store">
            <button className="ghost sm-num" onClick={() => focus(s)} aria-label={`Show ${s.name} on the map`}>{i + 1}</button>
            <div className="sm-st"><b>{s.name}</b><span className="small muted">{s.addr || "address not listed"}{s.hours ? ` · ${s.hours}` : ""}</span></div>
            <div className="sm-st-r"><b className="num">{mi(s.m)}</b><a className="small" href={gmaps(s.addr || `${s.lat},${s.lng}`)} target="_blank" rel="noreferrer"><Navigation size={11} /> Route</a></div>
          </div>
        ))}
        <a className="small" href={`https://www.google.com/maps/search/${encodeURIComponent("UPS near " + addr)}`} target="_blank" rel="noreferrer"><ExternalLink size={11} /> More UPS drop-offs near the customer</a>
      </div>
    </div>
  );
}
