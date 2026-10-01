"use client";
// Admin: add your own free lookups by URL (no naming needed) + an optional proxy ("Modo VPN")
// that Modo routes those lookups through. Modo fetches every lookup from its own server, so agents
// never need a VPN on their device — this proxy is only for sites that block datacenter servers.
import { useEffect, useState } from "react";
import { api } from "./api";
import { Link2, ShieldCheck, Save, Globe, Plus } from "lucide-react";
import LINK_PACK from "@/lib/quicklinks.json";

export default function LookupUrls() {
  const [urls, setUrls] = useState(""); const [proxy, setProxy] = useState(""); const [quick, setQuick] = useState(""); const [loaded, setLoaded] = useState(false);
  const [linksOn, setLinksOn] = useState(true);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  const [exit, setExit] = useState(null); const [exitBusy, setExitBusy] = useState(false);
  async function checkExit() { setExitBusy(true); setExit(null); const r = await api("/api/lookup?type=exitip"); setExitBusy(false); setExit(r.ok ? r.data : { error: r.data.error || "Couldn't check." }); }
  useEffect(() => { api("/api/settings").then((r) => { if (!r.ok) return; let a = []; try { a = JSON.parse(r.data.lookupUrls || "[]"); } catch {} setUrls((Array.isArray(a) ? a : []).join("\n")); setProxy(r.data.lookupProxy || "");
    let q = []; try { q = JSON.parse(r.data.quickLinks || "[]"); } catch {} setQuick((Array.isArray(q) ? q : []).map((x) => x.label ? `${x.label} | ${x.url}` : x.url).join("\n")); setLinksOn(r.data.quickLinksOn !== false); setLoaded(true); }); }, []);
  async function save() {
    setMsg(""); setErr("");
    const r = await api("/api/settings", "PATCH", { lookupUrls: urls, lookupProxy: proxy, quickLinks: quick, quickLinksOn: linksOn });
    if (!r.ok) return setErr(r.data.error || "Couldn't save.");
    let a = []; try { a = JSON.parse(r.data.lookupUrls || "[]"); } catch {}
    setUrls((Array.isArray(a) ? a : []).join("\n"));
    let q = []; try { q = JSON.parse(r.data.quickLinks || "[]"); } catch {} setQuick((Array.isArray(q) ? q : []).map((x) => x.label ? `${x.label} | ${x.url}` : x.url).join("\n"));
    setMsg("Saved. Your lookups and quick links now show up on the Lookups page.");
  }
  function addPack() {
    const lines = quick.split("\n").map((l) => l.trim()).filter(Boolean);
    const haveUrl = new Set(lines.map((l) => (l.includes("|") ? l.split("|").slice(1).join("|") : l).trim()));
    let added = 0;
    for (const l of LINK_PACK) if (!haveUrl.has(l.url)) { lines.push(`${l.label} | ${l.url}`); haveUrl.add(l.url); added++; }
    setQuick(lines.join("\n"));
    setMsg(added ? `Added ${added} built-in links. Press Save to keep them.` : "All built-in links are already in your list.");
  }
  if (!loaded) return null;
  return (
    <section className="panel stack">
      <h2><Link2 size={17} /> Your own lookups</h2>
      <p className="muted small" style={{ margin: 0 }}>Paste one lookup URL per line. Put <code>{"{q}"}</code> where the search term goes — Modo replaces it and fetches the page for you. No names needed; each one is labelled by its website. Free URL-based lookups only.</p>
      <label>Lookup URLs (one per line)
        <textarea style={{ minHeight: 110, fontFamily: "monospace", fontSize: 13 }} value={urls} onChange={(e) => setUrls(e.target.value)}
          placeholder={"https://example.com/api?number={q}\nhttps://another-free-lookup.com/search/{q}"} />
      </label>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <label className="row" style={{ margin: 0, color: "var(--foreground)", gap: 8, flexWrap: "nowrap" }}>Show quick links to everyone
          <button type="button" role="switch" aria-checked={linksOn} className={"toggle" + (linksOn ? " on" : "")} onClick={() => setLinksOn(!linksOn)}><span /></button></label>
        <button type="button" className="ghost sm" onClick={addPack}><Plus size={13} /> Add built-in link pack ({LINK_PACK.length})</button>
      </div>
      <label style={{ margin: 0 }}>Quick links (carriers, bill pay, order &amp; shipment tracking)</label>
      <label>
        <textarea style={{ minHeight: 90, fontFamily: "monospace", fontSize: 13 }} value={quick} onChange={(e) => setQuick(e.target.value)}
          placeholder={"Verizon — Track my order | https://www.verizon.com/digital/nsa/nos/ui/orders/trackmyorder/\nAT&T portal | https://www.att.com/..."} />
        <span className="muted small">One per line. Use <code>Label | https://the-link</code>, or just the link. These open in a new tab (agents use their VPN if the site needs one) — they're not data lookups.</span>
      </label>
      <div className="stack" style={{ gap: 6 }}>
        <label><ShieldCheck size={13} style={{ verticalAlign: "-2px" }} /> Proxy / VPN for lookups (optional)
          <input value={proxy} onChange={(e) => setProxy(e.target.value)} placeholder="http://user:pass@proxy-host:port  (or socks5://…)" />
        </label>
        <p className="muted small" style={{ margin: 0 }}>Modo already does every lookup from its own server, so your agents don't need a VPN. Only fill this in if a site blocks Modo's server — paste a proxy/VPN endpoint (from any proxy provider) and Modo will route your lookups through it.</p>
      </div>
      <div className="stack" style={{ gap: 6 }}>
        <div className="row" style={{ justifyContent: "space-between" }}><b className="row" style={{ gap: 6 }}><Globe size={15} /> Modo's US exit</b>
          <button className="ghost sm" onClick={checkExit} disabled={exitBusy}>{exitBusy ? "Checking…" : "Check location"}</button></div>
        {exit && (exit.error ? <div className="err" style={{ margin: 0 }}>{exit.error}</div> :
          <div className={exit.us ? "receipt" : "err"} style={{ margin: 0 }}>
            {exit.us ? "✓ " : "⚠ "}Your lookups run from <b>{[exit.city, exit.region, exit.country].filter(Boolean).join(", ") || exit.country || "?"}</b> (IP {exit.ip}){exit.proxied ? " · via your proxy" : ""}.
            {!exit.us && " This isn't a US location — US-only lookups may fail. Add a US proxy above."}
          </div>)}
        <p className="muted small" style={{ margin: 0 }}>Lookups are pinned to run from the US, so US-only sites see a US address. If one still blocks Modo (some block all datacenters), add a US proxy above.</p>
      </div>
      {err && <div className="err">{err}</div>}{msg && <div className="receipt">{msg}</div>}
      <div><button onClick={save}><Save size={15} /> Save lookups</button></div>
    </section>
  );
}
