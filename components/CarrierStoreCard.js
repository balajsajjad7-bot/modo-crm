"use client";
// Professional carrier-store card: the customer's own carrier (Verizon / AT&T / …), their nearest
// branded store on a 3D map, and a running log of what the agent discussed on each call-back.
import { useEffect, useRef, useState } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import { Navigation, RefreshCw, Phone, Copy, Check, Store, MapPin, Box, ExternalLink, StickyNote, Plus, Clock, Signal } from "lucide-react";

const mi = (m) => (m == null ? "" : m < 160 ? `${Math.round(m * 3.28)} ft` : `${(m / 1609.34).toFixed(m < 16093 ? 1 : 0)} mi`);
const drive = (m) => { const min = Math.max(2, Math.round(((m * 1.35) / 1609.34 / 28) * 60)); return min < 60 ? `~${min} min drive` : `~${(min / 60).toFixed(1)} h drive`; };
const STYLE = "https://tiles.openfreemap.org/styles/liberty";

export default function CarrierStoreCard({ sale, onPatch }) {
  const box = useRef(null); const map = useRef(null); const lib = useRef(null); const marks = useRef([]);
  const [geo, setGeo] = useState(null); const [carrier, setCarrier] = useState(null); const [stores, setStores] = useState(null);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [note, setErrNote] = useState("");
  const [three, setThree] = useState(true); const [copied, setCopied] = useState(-1);
  const [draft, setDraft] = useState(""); const [saving, setSaving] = useState(false);
  const addr = [sale.address, sale.zip].filter(Boolean).join(" ");

  async function load(refresh) {
    setBusy(true); setErr(""); setErrNote("");
    try {
      const r = await fetch(`/api/sales/geo?id=${encodeURIComponent(sale.id)}&carrier=1${refresh ? "&refresh=1" : ""}`, { cache: "no-store" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error || "Couldn't load the carrier map."); return; }
      setGeo(d.lat != null ? { lat: d.lat, lng: d.lng } : null);
      setCarrier(d.carrier || null);
      setStores(d.carrierStores || []);
      if (d.carrierError) setErrNote(d.carrierError);
      if (d.carrierNote) setErrNote(d.carrierNote);
    } catch { setErr("Couldn't reach the server."); } finally { setBusy(false); }
  }
  useEffect(() => { if (sale.id && addr) load(false); }, [sale.id]); // eslint-disable-line

  // Draw the map once we know where the customer is
  useEffect(() => {
    if (!geo || !box.current || map.current) return; let alive = true;
    (async () => {
      try {
        const maplibregl = (await import("maplibre-gl")).default; lib.current = maplibregl;
        if (!alive || !box.current) return;
        map.current = new maplibregl.Map({ container: box.current, style: STYLE, center: [geo.lng, geo.lat], zoom: 15.5, pitch: 58, bearing: -22, attributionControl: { compact: true } });
        map.current.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
        map.current.scrollZoom.disable(); map.current.on("click", () => map.current.scrollZoom.enable());
        const el = document.createElement("div"); el.className = "sm-pin-wrap"; el.innerHTML = '<div class="sm-pin cust"><span>🏠</span></div>';
        new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([geo.lng, geo.lat]).setPopup(new maplibregl.Popup({ offset: 22 }).setText(`${sale.customer || "Customer"} — ${addr}`)).addTo(map.current);
        const ro = new ResizeObserver(() => map.current?.resize()); ro.observe(box.current); map.current._ro = ro;
        drawStores();
      } catch { /* map optional */ }
    })();
    return () => { alive = false; };
  }, [geo]); // eslint-disable-line
  useEffect(() => { drawStores(); }, [stores, carrier]); // eslint-disable-line
  useEffect(() => () => { try { map.current?._ro?.disconnect(); map.current?.remove(); } catch {} map.current = null; }, []);

  function drawStores() {
    const m = map.current, L = lib.current; if (!m || !L || !stores) return;
    marks.current.forEach((x) => x.remove()); marks.current = [];
    const color = carrier?.color || "#6b5cff";
    stores.forEach((s, i) => {
      const el = document.createElement("div"); el.className = "sm-pin-wrap";
      el.innerHTML = `<div class="sm-pin car${i === 0 ? " best" : ""}" style="--car:${color}"><span>${i + 1}</span></div>`;
      marks.current.push(new L.Marker({ element: el, anchor: "bottom" }).setLngLat([s.lng, s.lat]).setPopup(new L.Popup({ offset: 22 }).setText(`${s.name}${s.addr ? " — " + s.addr : ""} (${mi(s.m)})`)).addTo(m));
    });
    if (stores[0]) { const b = new L.LngLatBounds([geo.lng, geo.lat], [geo.lng, geo.lat]); b.extend([stores[0].lng, stores[0].lat]); m.fitBounds(b, { padding: 64, pitch: 58, bearing: -22, maxZoom: 16.5, duration: 1000 }); }
  }
  const tilt = () => { const on = !three; setThree(on); map.current?.easeTo({ pitch: on ? 58 : 0, bearing: on ? -22 : 0, duration: 650 }); };
  const focus = (s) => map.current?.flyTo({ center: [s.lng, s.lat], zoom: 17, pitch: 58, duration: 850 });
  const route = (s) => `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(addr)}&destination=${encodeURIComponent(s.addr || `${s.lat},${s.lng}`)}`;
  const copyFor = (s, i) => { navigator.clipboard?.writeText(`Nearest ${carrier?.label || ""} store: ${s.name}, ${s.addr || ""} (${mi(s.m)} away). Directions: ${route(s)}`); setCopied(i); setTimeout(() => setCopied(-1), 1500); };

  async function addNote() {
    const t = draft.trim(); if (!t) return;
    setSaving(true);
    try {
      const r = await fetch("/api/sales/note", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: sale.id, text: t }) });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { onPatch?.({ notes: d.notes }); setDraft(""); }
      else setErrNote(d.error || "Couldn't save the note.");
    } finally { setSaving(false); }
  }

  const best = stores?.[0];
  if (!addr) return null;

  return (
    <section className="cstore">
      <div className="cstore-top">
        <span className="cstore-badge" style={carrier ? { background: carrier.color, color: carrier.fg } : undefined}>
          <Signal size={13} /> {carrier ? carrier.label : "Carrier"}
        </span>
        <div className="cstore-ttl"><b>Nearest {carrier ? carrier.label : "carrier"} store</b><span className="muted small">the store this customer is associated with</span></div>
        <button className="ghost sm icon-btn" aria-label="Look up again" onClick={() => load(true)} disabled={busy}><RefreshCw size={13} className={busy ? "spin" : ""} /></button>
      </div>

      {err && <p className="err small" style={{ margin: 0 }}>{err}</p>}
      {!err && !carrier && !busy && <p className="muted small" style={{ margin: 0 }}>{note || "No carrier detected on this sale yet."}</p>}

      {carrier && best && (
        <div className="cstore-best" style={{ "--car": carrier.color }}>
          <Store size={18} className="cstore-star" />
          <div className="cstore-best-t">
            <b>{best.name}</b>
            <span className="small">{best.addr || "address not listed"}</span>
            <span className="small muted"><b className="num" style={{ color: carrier.color }}>{mi(best.m)}</b> · {drive(best.m)}{best.hours ? ` · ${best.hours}` : ""}</span>
          </div>
          <div className="cstore-acts">
            <a className="btn-link" href={route(best)} target="_blank" rel="noreferrer"><Navigation size={12} /> Route</a>
            {best.phone && <a className="btn-link" href={`tel:${best.phone.replace(/[^0-9+]/g, "")}`}><Phone size={12} /> Call</a>}
            <button className="ghost sm" onClick={() => copyFor(best, 0)}>{copied === 0 ? <Check size={12} /> : <Copy size={12} />} Copy for customer</button>
          </div>
        </div>
      )}

      {carrier && (
        <div className="cstore-body">
          <div className="cstore-map-wrap">
            <div ref={box} className="cstore-map" />
            {!geo && <div className="cstore-overlay"><span className="muted small">{busy ? "Finding the store on the map…" : (note || "No map yet.")}</span></div>}
            {geo && <div className="cstore-tools">
              <button className="ghost sm" onClick={tilt}><Box size={12} /> {three ? "2D" : "3D"}</button>
              <button className="ghost sm" onClick={() => focus(geo)}><MapPin size={12} /> Customer</button>
            </div>}
          </div>
          <div className="cstore-side">
            <div className="cstore-sh"><Store size={13} /> {carrier.label} nearby</div>
            {!stores && !err && <p className="muted small" style={{ margin: 0 }}>Searching…</p>}
            {stores && !stores.length && <p className="muted small" style={{ margin: 0 }}>No mapped {carrier.label} store near this address.{note ? " " + note : ""}</p>}
            {stores?.map((s, i) => (
              <div key={i} className={"cstore-row" + (i === 0 ? " best" : "")}>
                <button className="ghost sm-num" onClick={() => focus(s)} aria-label={`Show ${s.name}`}>{i + 1}</button>
                <div className="cstore-rt"><b>{s.name}</b><span className="small muted">{s.addr || "address not listed"}{s.hours ? ` · ${s.hours}` : ""}</span></div>
                <div className="cstore-rr"><b className="num">{mi(s.m)}</b><span className="row" style={{ gap: 8 }}>
                  <a className="small" href={route(s)} target="_blank" rel="noreferrer"><Navigation size={11} /> Route</a>
                  <button className="ghost sm-mark small" onClick={() => copyFor(s, i)}>{copied === i ? "Copied" : "Copy"}</button>
                </span></div>
              </div>
            ))}
            <a className="small" href={`https://www.google.com/maps/search/${encodeURIComponent((carrier.label) + " store near " + addr)}`} target="_blank" rel="noreferrer"><ExternalLink size={11} /> More {carrier.label} stores near the customer</a>
          </div>
        </div>
      )}

      {/* Call-back log: what the agent discussed with this customer */}
      <div className="cstore-notes">
        <div className="cstore-sh"><StickyNote size={13} /> Call-back log · what was discussed</div>
        {onPatch && (
          <div className="cstore-add">
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Add what you talked about on this call-back…" onKeyDown={(e) => e.key === "Enter" && addNote()} />
            <button className="btn-sq sm" onClick={addNote} disabled={saving || !draft.trim()}><Plus size={13} /> {saving ? "Saving…" : "Log"}</button>
          </div>
        )}
        {sale.notes ? (
          <div className="cstore-log">{sale.notes.split("\n").filter(Boolean).map((ln, i) => {
            const mm = ln.match(/^\[(.+?)\]\s*(.*)$/);
            return <div key={i} className="cstore-logline">{mm ? <><span className="cstore-when"><Clock size={10} /> {mm[1]}</span><span>{mm[2]}</span></> : <span>{ln}</span>}</div>;
          })}</div>
        ) : <p className="muted small" style={{ margin: 0 }}>No call-back notes yet.</p>}
      </div>
    </section>
  );
}
