"use client";
// 3D map of the customer's location with the nearest UPS locations (free OpenFreeMap tiles, 3D buildings).
// The map appears as soon as the address is found; UPS stores are added when the (slower) search finishes.
import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapPin, Navigation, RefreshCw, Store, Box, ExternalLink, Copy, Check, Star } from "lucide-react";

const mi = (m) => (m == null ? "" : m < 160 ? `${Math.round(m * 3.28)} ft` : `${(m / 1609.34).toFixed(m < 16093 ? 1 : 0)} mi`);
const drive = (m) => { const min = Math.max(2, Math.round(((m * 1.35) / 1609.34 / 28) * 60)); return min < 60 ? `about ${min} min drive` : `about ${(min / 60).toFixed(1)} h drive`; };
const STYLE = "https://tiles.openfreemap.org/styles/liberty";

const dropKey = (x) => (x ? `${x.name}|${x.addr || ""}` : "");
const when = (d) => (d ? new Date(d).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");

export default function SaleMap({ sale, big, onDrop }) {
  const box = useRef(null); const map = useRef(null); const lib = useRef(null); const marks = useRef([]);
  const [geo, setGeo] = useState(null); const [stores, setStores] = useState(null); const [err, setErr] = useState(""); const [sErr, setSErr] = useState("");
  const [busy, setBusy] = useState(false); const [three, setThree] = useState(true); const [mapErr, setMapErr] = useState(""); const [copied, setCopied] = useState(false);
  const addr = [sale.address, sale.zip].filter(Boolean).join(" ");
  const [drop, setDrop] = useState(() => { try { return JSON.parse(sale.dropStore || "null"); } catch { return null; } });
  const [dBusy, setDBusy] = useState(false); const [dMsg, setDMsg] = useState("");
  async function saveDrop(body) {
    setDBusy(true); setDMsg("");
    const r = await fetch("/api/sales/drop", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: sale.id, ...body }) });
    const d = await r.json().catch(() => ({})); setDBusy(false);
    if (!r.ok) return setDMsg(d.error || "Couldn't save.");
    setDrop(d.drop); onDrop?.(d.drop); if (d.note) setDMsg(d.note);
  }
  // Has the customer dropped it off? Check UPS tracking by itself when there's a return label
  useEffect(() => { if (sale.id && sale.returnTracking && !drop) saveDrop({ check: true }).then(() => setDMsg("")); }, [sale.id]); // eslint-disable-line

  async function load(refresh) {
    setBusy(true); setErr(""); setSErr("");
    const r = await fetch(`/api/sales/geo?id=${encodeURIComponent(sale.id)}${refresh ? "&refresh=1" : ""}`, { cache: "no-store" });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { setBusy(false); return setErr(d.error || "Couldn't load the map."); }
    setGeo({ lat: d.lat, lng: d.lng });
    if (d.stores?.length && !refresh) { setStores(d.stores); setBusy(false); return; }
    const r2 = await fetch(`/api/sales/geo?id=${encodeURIComponent(sale.id)}&stores=1`, { cache: "no-store" });
    const d2 = await r2.json().catch(() => ({})); setBusy(false);
    setStores(d2.stores || []); if (d2.storesError || !r2.ok) setSErr(d2.storesError || d2.error || "Couldn't search for UPS stores.");
  }
  useEffect(() => { if (sale.id && addr) load(false); }, [sale.id]); // eslint-disable-line

  // Draw the map as soon as we know where the customer is
  useEffect(() => {
    if (!geo || !box.current || map.current) return;
    let alive = true;
    (async () => {
      try {
        const maplibregl = (await import("maplibre-gl")).default; lib.current = maplibregl;
        if (!alive || !box.current) return;
        map.current = new maplibregl.Map({ container: box.current, style: STYLE, center: [geo.lng, geo.lat], zoom: 16, pitch: 60, bearing: -25, attributionControl: { compact: true } });
        map.current.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
        map.current.scrollZoom.disable(); map.current.on("click", () => map.current.scrollZoom.enable());
        map.current.on("error", (e) => { if (/WebGL|context/i.test(e?.error?.message || "")) setMapErr("This device couldn't draw the 3D map."); });
        const el = document.createElement("div"); el.className = "sm-pin-wrap"; el.innerHTML = '<div class="sm-pin cust"><span>🏠</span></div>';
        new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([geo.lng, geo.lat]).setPopup(new maplibregl.Popup({ offset: 24 }).setText(`${sale.customer || "Customer"} — ${addr}`)).addTo(map.current);
        const ro = new ResizeObserver(() => map.current?.resize()); ro.observe(box.current); map.current._modoRo = ro;
        drawStores();
      } catch (e) { setMapErr("Couldn't start the map: " + (e.message || e)); }
    })();
    return () => { alive = false; };
  }, [geo]); // eslint-disable-line
  useEffect(() => { drawStores(); }, [stores, drop]); // eslint-disable-line
  useEffect(() => () => { try { map.current?._modoRo?.disconnect(); map.current?.remove(); } catch {} map.current = null; }, []);

  function drawStores() {
    const m = map.current, L = lib.current; if (!m || !L || !stores) return;
    marks.current.forEach((x) => x.remove()); marks.current = [];
    stores.forEach((s, i) => {
      const el = document.createElement("div"); el.className = "sm-pin-wrap"; el.innerHTML = `<div class="sm-pin ups${i === 0 ? " best" : ""}${dropKey(drop) === dropKey(s) ? " dropped" : ""}"><span>${dropKey(drop) === dropKey(s) ? "✓" : i + 1}</span></div>`;
      marks.current.push(new L.Marker({ element: el, anchor: "bottom" }).setLngLat([s.lng, s.lat]).setPopup(new L.Popup({ offset: 24 }).setText(`${s.name}${s.addr ? " — " + s.addr : ""} (${mi(s.m)})`)).addTo(m));
    });
    if (stores[0]) { const b = new L.LngLatBounds([geo.lng, geo.lat], [geo.lng, geo.lat]); b.extend([stores[0].lng, stores[0].lat]); m.fitBounds(b, { padding: 70, pitch: 60, bearing: -25, maxZoom: 16.5, duration: 1200 }); }
  }
  const tilt = () => { const on = !three; setThree(on); map.current?.easeTo({ pitch: on ? 60 : 0, bearing: on ? -25 : 0, duration: 700 }); };
  const focus = (s) => map.current?.flyTo({ center: [s.lng, s.lat], zoom: 17, pitch: 60, duration: 900 });
  const route = (s) => `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(addr)}&destination=${encodeURIComponent(s.addr || `${s.lat},${s.lng}`)}`;
  const best = stores?.[0];

  if (!addr) return <p className="muted small" style={{ margin: 0 }}>No address on this sale, so there's no map.</p>;
  return (
    <div className={"smap" + (big ? " big" : "")}>
      {drop ? (
        <div className="sm-drop">
          <span className="sm-drop-ic">✓</span>
          <div className="sm-best-t"><span className="sf-l">Customer dropped the package at</span><b>{drop.name}</b><span className="small">{[drop.addr, when(drop.at), drop.how === "tracking" ? "from UPS tracking" : "marked by hand"].filter(Boolean).join(" · ")}</span></div>
          <button className="ghost sm" onClick={() => saveDrop({ clear: true })} disabled={dBusy}>Undo</button>
        </div>
      ) : (sale.returnTracking || sale.trackingNo) ? (
        <div className="row" style={{ gap: 6 }}><button className="ghost sm" onClick={() => saveDrop({ check: true })} disabled={dBusy}><RefreshCw size={12} className={dBusy ? "spin" : ""} /> Has he dropped it off? Check UPS tracking</button></div>
      ) : null}
      {dMsg && <p className="small muted" style={{ margin: 0 }}>{dMsg}</p>}
      {best && !drop && (
        <div className="sm-best">
          <Star size={16} className="sm-star" />
          <div className="sm-best-t"><span className="sf-l">Suggested drop-off · nearest to the customer</span><b>{best.name}</b><span className="small">{best.addr || "address not listed"} · <b>{mi(best.m)}</b> · {drive(best.m)}{best.hours ? ` · ${best.hours}` : ""}</span></div>
          <div className="row" style={{ gap: 6 }}>
            <a className="btn-link" href={route(best)} target="_blank" rel="noreferrer"><Navigation size={12} /> Route</a>
            <button className="ghost sm" onClick={() => { navigator.clipboard?.writeText(`Nearest UPS drop-off: ${best.name}, ${best.addr || ""} (${mi(best.m)} from you)`); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? <Check size={12} /> : <Copy size={12} />} Copy for customer</button>
          </div>
        </div>
      )}
      <div className="sm-body">
        <div className="sm-map-wrap">
          <div ref={box} className="sm-map" />
          {(!geo || mapErr) && <div className="sm-overlay">{err || mapErr ? <span className="err small">{err || mapErr}</span> : <span className="muted small">Finding {sale.customer?.split(" ")[0] || "the customer"} on the map…</span>}</div>}
          {geo && !mapErr && <div className="sm-tools">
            <button className="ghost sm" onClick={tilt}><Box size={13} /> {three ? "2D" : "3D"}</button>
            <button className="ghost sm" onClick={() => focus(geo)}><MapPin size={13} /> Customer</button>
            <button className="ghost sm icon-btn" aria-label="Look up again" onClick={() => load(true)} disabled={busy}><RefreshCw size={13} className={busy ? "spin" : ""} /></button>
          </div>}
        </div>
        <div className="sm-side">
          <div className="sm-h"><Store size={14} /> Nearest UPS</div>
          {!stores && !err && <p className="muted small" style={{ margin: 0 }}>Searching nearby UPS locations…</p>}
          {sErr && <p className="small" style={{ margin: 0, color: "var(--amber)" }}>{sErr}</p>}
          {stores && !stores.length && !sErr && <p className="muted small" style={{ margin: 0 }}>No UPS locations are mapped near this address.</p>}
          {stores?.map((s, i) => (
            <div key={i} className={"sm-store" + (i === 0 ? " best" : "")}>
              <button className="ghost sm-num" onClick={() => focus(s)} aria-label={`Show ${s.name} on the map`}>{i + 1}</button>
              <div className="sm-st"><b>{s.name}</b><span className="small muted">{s.addr || "address not listed"}{s.hours ? ` · ${s.hours}` : ""}</span></div>
              <div className="sm-st-r"><b className="num">{mi(s.m)}</b><span className="row" style={{ gap: 8 }}><a className="small" href={route(s)} target="_blank" rel="noreferrer"><Navigation size={11} /> Route</a>
                {dropKey(drop) === dropKey(s) ? <span className="small sm-dropped">✓ dropped here</span> : <button className="ghost sm-mark small" disabled={dBusy} onClick={() => saveDrop({ store: s })}>Dropped here</button>}</span></div>
            </div>
          ))}
          <a className="small" href={`https://www.google.com/maps/search/${encodeURIComponent("UPS near " + addr)}`} target="_blank" rel="noreferrer"><ExternalLink size={11} /> More UPS drop-offs near the customer</a>
        </div>
      </div>
    </div>
  );
}
