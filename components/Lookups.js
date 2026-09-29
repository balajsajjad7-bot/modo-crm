"use client";
// USA lookups: free built-ins (ZIP, address, phone, email, time) + any API admin adds in Connectors.
import { useEffect, useState } from "react";
import { MapPin, Home, Phone, Mail, Clock, Search, Plug, Copy, ExternalLink, Building, Ruler, CloudSun, CalendarDays } from "lucide-react";
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u; } };

const BUILT = [
  { id: "phone", name: "Phone number", icon: Phone, hint: "10-digit US number", ph: "(512) 555-0142", desc: "Format, area code state, time zone and whether it's OK to call now" },
  { id: "zip", name: "ZIP code", icon: MapPin, hint: "5 digits", ph: "78731", desc: "City, state, time zone, local time" },
  { id: "address", name: "Address check", icon: Home, hint: "Street, city, state, ZIP", ph: "4410 Ridgeview Dr, Austin, TX 78731", desc: "Official US Census match, county, time zone" },
  { id: "email", name: "Email check", icon: Mail, hint: "name@domain.com", ph: "rmiller@gmail.com", desc: "Typos, whether the domain takes email, throwaway addresses" },
  { id: "time", name: "Time in a state", icon: Clock, hint: "TX or Texas", ph: "Texas", desc: "Local time and whether it's OK to call" },
  { id: "city", name: "City → ZIP codes", icon: Building, hint: "City, state", ph: "Austin, TX", desc: "Every ZIP code in a city" },
  { id: "weather", name: "Weather there", icon: CloudSun, hint: "ZIP code", ph: "78731", desc: "Current weather at the customer's ZIP (small talk, energy use)" },
  { id: "distance", name: "Distance between ZIPs", icon: Ruler, hint: "two ZIP codes", ph: "78731 to 30303", desc: "Miles and rough drive time" },
  { id: "holidays", name: "US holidays & call rules", icon: CalendarDays, hint: "year (optional)", ph: "2026", desc: "Federal holidays and legal calling hours" },
];

export default function Lookups({ compact = false, preset = null }) {
  const [custom, setCustom] = useState([]); const [tool, setTool] = useState(preset?.tool || "phone"); const [q, setQ] = useState(preset?.q || "");
  useEffect(() => { if (preset?.q) { setTool(preset.tool || "phone"); setQ(preset.q); run(null, { tool: preset.tool || "phone", q: preset.q }); } }, [preset?.q, preset?.tool]); // eslint-disable-line
  const [res, setRes] = useState(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [history, setHistory] = useState([]);
  useEffect(() => { const h = (e) => { setTool(e.detail.tool); setQ(e.detail.q); run(null, e.detail); }; window.addEventListener("modo-lookup", h); return () => window.removeEventListener("modo-lookup", h); }); // eslint-disable-line
  const [links, setLinks] = useState([]);
  useEffect(() => { fetch("/api/lookup?type=list").then((r) => r.json()).then((d) => Array.isArray(d) && setCustom(d)).catch(() => {}); try { setHistory(JSON.parse(localStorage.getItem("modo-lookups") || "[]")); } catch {}
    fetch("/api/settings").then((r) => r.json()).then((d) => { let q = []; try { q = JSON.parse(d.quickLinks || "[]"); } catch {} setLinks(Array.isArray(q) ? q : []); }).catch(() => {}); }, []);
  const all = [...BUILT, ...custom.map((c) => ({ id: c.id, name: c.name, icon: Plug, hint: c.hint || "Search", ph: c.hint || "", desc: c.id.startsWith("u:") ? "Your lookup" : "Your API" }))];
  const cur = all.find((t) => t.id === tool) || all[0];
  async function run(e, again) {
    e?.preventDefault(); const query = (again?.q ?? q).trim(); const t = again?.tool ?? tool; if (!query && t !== "holidays") return;
    setBusy(true); setErr(""); setRes(null);
    const url = t.startsWith("c:") ? `/api/lookup?type=custom&id=${t.slice(2)}&q=${encodeURIComponent(query)}`
      : t.startsWith("u:") ? `/api/lookup?type=urllookup&i=${t.slice(2)}&q=${encodeURIComponent(query)}`
      : `/api/lookup?type=${t}&q=${encodeURIComponent(query)}`;
    const r = await fetch(url); const d = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) return setErr(d.error || "Lookup failed.");
    setRes(d);
    const h = [{ tool: t, q: query, title: d.title, at: Date.now() }, ...history.filter((x) => !(x.tool === t && x.q === query))].slice(0, 12);
    setHistory(h); try { localStorage.setItem("modo-lookups", JSON.stringify(h)); } catch {}
  }
  return (
    <div className={"lookups" + (compact ? " compact" : "")}>
      <div className="lk-tools">
        {all.map((t) => { const I = t.icon; return (
          <button key={t.id} className={"lk-tool" + (t.id === tool ? " on" : "")} onClick={() => { setTool(t.id); setRes(null); setErr(""); }}>
            <I size={18} /><span><b>{t.name}</b><span>{t.desc}</span></span>
          </button>
        ); })}
      </div>
      <div className="stack">
        <form className="panel lk-search" onSubmit={run}>
          <Search size={18} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={cur.ph || cur.hint} aria-label={cur.name} autoFocus />
          <button disabled={busy || (!q.trim() && tool !== "holidays")}>{busy ? "Looking up…" : "Look up"}</button>
        </form>
        {err && <div className="panel err">{err}</div>}
        {res && (
          <section className="panel stack lk-result">
            <div className="row" style={{ justifyContent: "space-between" }}><h2>{res.title}</h2>
              <div className="row" style={{ gap: 6 }}>
                <button className="ghost sm" onClick={() => navigator.clipboard?.writeText(res.rows.map(([k, v]) => `${k}: ${v}`).join("\n"))}><Copy size={13} /> Copy</button>
                {res.map && <a className="btn-link" href={`https://www.google.com/maps?q=${res.map.lat},${res.map.lng}`} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Map</a>}
              </div></div>
            <div className="lk-rows">{res.rows.map(([k, v], i) => <div key={i}><span>{k}</span><b>{v}</b></div>)}</div>
            {res.note && <p className="muted small" style={{ margin: 0 }}>{res.note}</p>}
          </section>
        )}
        {history.length > 0 && (
          <section className="panel stack">
            <h2 style={{ fontSize: 15 }}>Recent</h2>
            <div className="row" style={{ gap: 6 }}>{history.map((h, i) => <button key={i} className="ghost sm" onClick={() => { setTool(h.tool); setQ(h.q); run(null, h); }}>{all.find((t) => t.id === h.tool)?.name || "Lookup"}: {h.q}</button>)}</div>
          </section>
        )}
        {links.length > 0 && (
          <section className="panel stack">
            <h2 style={{ fontSize: 15 }}><ExternalLink size={15} /> Quick links</h2>
            <p className="muted small" style={{ margin: 0 }}>Open a carrier portal or tracker in a new tab (use your VPN if the site needs a US location).</p>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>{links.map((l, i) => <a key={i} className="btn-link" href={l.url} target="_blank" rel="noreferrer"><ExternalLink size={13} /> {l.label || hostOf(l.url)}</a>)}</div>
          </section>
        )}
        {!custom.length && <p className="muted small">More lookups (phone carrier, utility providers, internet providers…): admin can add any API in Tools → Connectors → Lookup API, and it shows up here.</p>}
      </div>
    </div>
  );
}
