"use client";
// Admin: add your own free lookups by URL (no naming needed) + an optional proxy ("Modo VPN")
// that Modo routes those lookups through. Modo fetches every lookup from its own server, so agents
// never need a VPN on their device — this proxy is only for sites that block datacenter servers.
import { useEffect, useState } from "react";
import { api } from "./api";
import { Link2, ShieldCheck, Save } from "lucide-react";

export default function LookupUrls() {
  const [urls, setUrls] = useState(""); const [proxy, setProxy] = useState(""); const [loaded, setLoaded] = useState(false);
  const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  useEffect(() => { api("/api/settings").then((r) => { if (!r.ok) return; let a = []; try { a = JSON.parse(r.data.lookupUrls || "[]"); } catch {} setUrls((Array.isArray(a) ? a : []).join("\n")); setProxy(r.data.lookupProxy || ""); setLoaded(true); }); }, []);
  async function save() {
    setMsg(""); setErr("");
    const r = await api("/api/settings", "PATCH", { lookupUrls: urls, lookupProxy: proxy });
    if (!r.ok) return setErr(r.data.error || "Couldn't save.");
    let a = []; try { a = JSON.parse(r.data.lookupUrls || "[]"); } catch {}
    setUrls((Array.isArray(a) ? a : []).join("\n"));
    setMsg("Saved. Your lookups now show up in the tools above.");
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
      <div className="stack" style={{ gap: 6 }}>
        <label><ShieldCheck size={13} style={{ verticalAlign: "-2px" }} /> Proxy / VPN for lookups (optional)
          <input value={proxy} onChange={(e) => setProxy(e.target.value)} placeholder="http://user:pass@proxy-host:port  (or socks5://…)" />
        </label>
        <p className="muted small" style={{ margin: 0 }}>Modo already does every lookup from its own server, so your agents don't need a VPN. Only fill this in if a site blocks Modo's server — paste a proxy/VPN endpoint (from any proxy provider) and Modo will route your lookups through it.</p>
      </div>
      {err && <div className="err">{err}</div>}{msg && <div className="receipt">{msg}</div>}
      <div><button onClick={save}><Save size={15} /> Save lookups</button></div>
    </section>
  );
}
