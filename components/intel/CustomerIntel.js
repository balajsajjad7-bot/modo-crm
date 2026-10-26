"use client";
// Customer 360 — one scan runs every connector (phone carrier & safe-call hours, verified address &
// neighbourhood, power company & internet providers, email checks, IMEI/device, Modo history) and
// shows it as a single detailed profile. Used on its own page, on a customer's page and on sales.
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Radar, Phone, MapPin, Zap, Mail, Smartphone, History, Gauge, ShieldAlert, Copy, Check, RefreshCw, Sparkles, ExternalLink, Plug, ClipboardPaste, Clock, Store, Wifi, Home, ListTree, X } from "lucide-react";

const IntelMap = dynamic(() => import("./IntelMap"), { ssr: false, loading: () => <div className="ci-map ci-skel" /> });

const PACKS = [
  { key: "overview", label: "Overview", icon: Gauge },
  { key: "phone", label: "Phone", icon: Phone },
  { key: "address", label: "Address", icon: MapPin },
  { key: "availability", label: "Services", icon: Zap },
  { key: "email", label: "Email", icon: Mail },
  { key: "device", label: "Device", icon: Smartphone },
  { key: "history", label: "In Modo", icon: History },
  { key: "sources", label: "Sources", icon: ListTree },
];
const EMPTY = { name: "", phone: "", email: "", address: "", zip: "", imei: "", device: "" };

// Pull phone / email / ZIP / IMEI / address out of anything pasted (a sale, a note, a lead row).
export function parsePasted(text) {
  const t = String(text || ""); const out = {};
  const email = t.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i); if (email) out.email = email[0];
  const imei = t.match(/\b(\d{15})\b/) || t.match(/\b(\d{2}[ -]?\d{6}[ -]?\d{6}[ -]?\d)\b/); if (imei) out.imei = imei[1].replace(/\D/g, "");
  const noImei = imei ? t.replace(imei[0], " ") : t;
  const ph = noImei.match(/(?:\+?1[\s.-]?)?\(?([2-9]\d{2})\)?[\s.-]?(\d{3})[\s.-]?(\d{4})\b/); if (ph) out.phone = `(${ph[1]}) ${ph[2]}-${ph[3]}`;
  const lines = t.split(/\n|;|\|/).map((l) => l.trim()).filter(Boolean);
  const addr = lines.find((l) => /^\d{1,6}\s+\w+.*\b(st|street|ave|avenue|rd|road|dr|drive|ln|lane|blvd|ct|court|way|pl|place|pkwy|hwy|cir|circle|ter|trail|trl|loop)\b/i.test(l.replace(/^address\s*[:\-]\s*/i, "")));
  if (addr) out.address = addr.replace(/^address\s*[:\-]\s*/i, "");
  const zip = (addr || t).match(/\b(\d{5})(?:-\d{4})?\b(?![\d-])/); if (zip && zip[1] !== out.phone?.replace(/\D/g, "").slice(0, 5)) out.zip = zip[1];
  const name = t.match(/(?:name|customer)\s*[:\-]\s*([A-Za-z][A-Za-z .'-]{1,50})/i); if (name) out.name = name[1].trim();
  const dev = t.match(/(?:device|phone model|model)\s*[:\-]\s*([^\n,;|]{2,60})/i); if (dev) out.device = dev[1].trim();
  return out;
}

const tone = (t) => (t === "ok" ? "ok" : t === "bad" ? "red" : t === "warn" ? "late" : t === "info" ? "" : "muted");
function Badges({ list }) {
  if (!list?.length) return null;
  return <div className="ci-badges">{list.map((b, i) => <span key={i} className={"chip " + tone(b.tone)}>{b.text}</span>)}</div>;
}
function Facts({ rows }) {
  if (!rows?.length) return null;
  return (
    <dl className="ci-facts">
      {rows.map(([k, v, t], i) => (
        <div key={i} className={"ci-fact" + (t ? " t-" + t : "")}><dt>{k}</dt><dd>{v}</dd></div>
      ))}
    </dl>
  );
}
function Links({ list }) {
  if (!list?.length) return null;
  return <div className="ci-links">{list.map((l) => <a key={l.href} href={l.href} target="_blank" rel="noreferrer noopener" className="btn-link"><ExternalLink size={12} /> {l.label}</a>)}</div>;
}
function Card({ icon: Icon, title, right, children, wide }) {
  return (
    <section className={"ci-card" + (wide ? " wide" : "")}>
      <header><h3><Icon size={16} /> {title}</h3>{right}</header>
      {children}
    </section>
  );
}
function Err({ pack }) { return pack?.error ? <p className="muted small" style={{ margin: 0 }}>{pack.error}</p> : null; }
function Ring({ score, grade }) {
  const r = 30, c = 2 * Math.PI * r, v = score == null ? 0 : score;
  const col = score == null ? "var(--muted-fg)" : score >= 85 ? "var(--green)" : score >= 60 ? "var(--amber)" : "var(--red)";
  return (
    <div className="ci-ring" aria-label={score == null ? "No score" : `Trust score ${score} of 100, ${grade}`}>
      <svg viewBox="0 0 72 72" width="72" height="72" aria-hidden="true">
        <circle cx="36" cy="36" r={r} fill="none" stroke="var(--border)" strokeWidth="7" />
        <circle cx="36" cy="36" r={r} fill="none" stroke={col} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(v / 100) * c} ${c}`} transform="rotate(-90 36 36)" />
      </svg>
      <div><b>{score ?? "—"}</b><span>{grade || "trust"}</span></div>
    </div>
  );
}

function summaryText(d) {
  const L = [`Customer 360 — ${d.input?.name || "customer"} · ${new Date(d.at).toLocaleString()}`];
  if (d.score != null) L.push(`Trust score: ${d.score}/100 (${d.grade})`);
  for (const p of PACKS.slice(1, 7)) {
    const pk = d.packs?.[p.key]; if (!pk || pk.error) continue;
    L.push("", p.label.toUpperCase());
    for (const [k, v] of pk.facts || []) L.push(`• ${k}: ${v}`);
    if (p.key === "address" && pk.hood) for (const [k, v] of pk.hood) L.push(`• ${k}: ${v}`);
    if (p.key === "availability" && pk.providers) L.push(`• Internet providers: ${pk.providers.map((x) => `${x.name}${x.type ? " (" + x.type + ")" : ""}`).join(", ")}`);
  }
  if (d.flags?.length) L.push("", "FLAGS", ...d.flags.map((f) => "• " + f.text));
  return L.join("\n");
}

export default function CustomerIntel({ contactId, saleId, initial, auto = false, compact = false, isAdmin = false, onClose }) {
  const [f, setF] = useState({ ...EMPTY, ...(initial || {}) });
  const [paste, setPaste] = useState("");
  const [deep, setDeep] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [d, setD] = useState(null);
  const [tab, setTab] = useState("overview");
  const [copied, setCopied] = useState(false);
  const [recent, setRecent] = useState([]);
  const linked = !!(contactId || saleId);

  const run = useCallback(async (opts = {}) => {
    setBusy(true); setErr("");
    const body = { ...(linked ? {} : f), contactId, saleId, deep: opts.deep ?? deep };
    try {
      const r = await fetch("/api/intel", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Scan failed.");
      setD(j); setTab("overview");
      if (!linked) setRecent((x) => [{ label: f.name || f.phone || f.email || f.address || f.imei, f: { ...f } }, ...x.filter((y) => JSON.stringify(y.f) !== JSON.stringify(f))].slice(0, 6));
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }, [f, contactId, saleId, deep, linked]);

  useEffect(() => { if (auto && linked) run(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [auto, contactId, saleId]);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const applyPaste = (text) => { const p = parsePasted(text); setF((x) => ({ ...x, ...Object.fromEntries(Object.entries(p).filter(([, v]) => v)) })); };
  const P = d?.packs || {};
  const tabs = useMemo(() => PACKS.filter((p) => p.key === "overview" || p.key === "sources" || P[p.key]), [P]);
  const copy = () => { navigator.clipboard?.writeText(summaryText(d)); setCopied(true); setTimeout(() => setCopied(false), 1600); };

  return (
    <div className={"ci" + (compact ? " compact" : "")}>
      {/* ── Scan bar ── */}
      <section className="panel ci-scan">
        <div className="ci-scan-head">
          <span className="ci-orb"><Radar size={20} /></span>
          <div style={{ minWidth: 0 }}>
            <h2>Customer 360</h2>
            <p className="muted small" style={{ margin: 0 }}>{linked ? "Every connector, one scan — carrier, call hours, verified address, neighbourhood, utility, internet, email, device and Modo history." : "Type or paste anything — a sale, a lead, a note. Modo pulls out the phone, email, address, ZIP and IMEI for you."}</p>
          </div>
          {onClose && <button className="ghost sm icon-btn" aria-label="Close" onClick={onClose} style={{ marginLeft: "auto" }}><X size={16} /></button>}
        </div>
        {!linked && (
          <>
            <div className="ci-paste">
              <ClipboardPaste size={16} className="muted" />
              <textarea rows={2} value={paste} placeholder="Paste customer details here…" onChange={(e) => { setPaste(e.target.value); applyPaste(e.target.value); }} />
            </div>
            <div className="ci-fields">
              <label>Name<input value={f.name} onChange={set("name")} placeholder="Jane Carter" /></label>
              <label>Phone<input value={f.phone} onChange={set("phone")} inputMode="tel" placeholder="(512) 555-0143" /></label>
              <label>Email<input value={f.email} onChange={set("email")} inputMode="email" placeholder="jane@gmail.com" /></label>
              <label className="span2">Address<input value={f.address} onChange={set("address")} placeholder="1600 Main St, Austin, TX" /></label>
              <label>ZIP<input value={f.zip} onChange={set("zip")} inputMode="numeric" placeholder="78701" /></label>
              <label>IMEI<input value={f.imei} onChange={set("imei")} inputMode="numeric" placeholder="15 digits" /></label>
              <label>Device<input value={f.device} onChange={set("device")} placeholder="iPhone 16 Pro 256GB" /></label>
            </div>
          </>
        )}
        <div className="row ci-actions">
          <button onClick={() => run()} disabled={busy}>{busy ? <><RefreshCw size={15} className="spin" /> Scanning…</> : <><Radar size={15} /> {d ? "Scan again" : "Run full scan"}</>}</button>
          <label className="ci-toggle" title="Adds a live AI web search for internet providers at the address and today's device prices">
            <input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} /><span><Sparkles size={13} /> Deep scan</span>
          </label>
          {!linked && Object.values(f).some(Boolean) && <button className="ghost sm" onClick={() => { setF(EMPTY); setPaste(""); setD(null); }}>Clear</button>}
          {d && <button className="ghost sm" onClick={copy}>{copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy summary</>}</button>}
          {isAdmin && <Link href="/admin/connectors" className="btn-link small"><Plug size={13} /> Connect more sources</Link>}
        </div>
        {recent.length > 0 && !linked && <div className="ci-recent">{recent.map((r, i) => <button key={i} className="ghost sm" onClick={() => setF(r.f)}>{r.label}</button>)}</div>}
        {err && <div className="err">{err}</div>}
      </section>

      {busy && !d && <div className="ci-grid"><div className="ci-card ci-skel" /><div className="ci-card ci-skel" /><div className="ci-card ci-skel" /></div>}

      {d && (
        <>
          {/* ── Hero ── */}
          <section className="panel ci-hero">
            <Ring score={d.score} grade={d.grade} />
            <div className="ci-hero-mid">
              <h2>{d.input?.name || P.address?.geo?.matched?.split(",")[0] || d.input?.phone || d.input?.email || "Scan result"}</h2>
              <div className="ci-hero-meta small muted">
                {d.input?.phone && <span><Phone size={12} /> {d.input.phone}</span>}
                {P.address?.geo && <span><MapPin size={12} /> {P.address.geo.city || ""}{P.address.geo.state ? ", " + P.address.geo.state : ""}</span>}
                <span><Clock size={12} /> {(d.ms / 1000).toFixed(1)}s · {d.sourceCount.ok}/{d.sourceCount.all} sources answered{d.deep ? " · deep" : ""}</span>
              </div>
              <Badges list={d.flags} />
            </div>
            {d.callable != null && (
              <div className={"ci-call " + (d.callable ? "go" : "stop")}>
                <span className="ci-light" />
                <div><b>{d.callable ? "OK to call" : "Don't call now"}</b><span>{P.phone?.facts?.find((x) => x[0] === "Their time now")?.[1] || ""}</span></div>
              </div>
            )}
          </section>

          {/* ── Tabs ── */}
          <div className="ci-tabs" role="tablist">
            {tabs.map(({ key, label, icon: Icon }) => {
              const pk = P[key]; const bad = pk?.badges?.some((b) => b.tone === "bad");
              return <button key={key} role="tab" aria-selected={tab === key} className={tab === key ? "on" : ""} onClick={() => setTab(key)}><Icon size={14} /> {label}{bad && <i className="ci-dot" />}</button>;
            })}
          </div>

          {tab === "overview" && (
            <div className="ci-grid">
              {P.phone && <Card icon={Phone} title="Phone" right={<button className="ghost sm" onClick={() => setTab("phone")}>More</button>}><Err pack={P.phone} /><Badges list={P.phone.badges} /><Facts rows={(P.phone.facts || []).filter((x) => ["Carrier", "Line type", "Safe to call now?", "Their time now", "Carrier / line type"].includes(x[0]))} /></Card>}
              {P.address && <Card icon={MapPin} title="Address" right={<button className="ghost sm" onClick={() => setTab("address")}>More</button>}><Err pack={P.address} /><Badges list={P.address.badges} /><Facts rows={(P.address.facts || []).slice(0, 3)} />{P.address.hood && <Facts rows={P.address.hood.slice(0, 2)} />}</Card>}
              {P.availability && <Card icon={Zap} title="Services at address" right={<button className="ghost sm" onClick={() => setTab("availability")}>More</button>}><Err pack={P.availability} /><Facts rows={(P.availability.facts || []).filter((x) => /utility|rate|bill|broadband|Likely/i.test(x[0])).slice(0, 4)} />{P.availability.providers && <p className="small" style={{ margin: 0 }}><Wifi size={12} /> {P.availability.providers.map((p) => p.name).join(" · ")}</p>}</Card>}
              {P.email && <Card icon={Mail} title="Email" right={<button className="ghost sm" onClick={() => setTab("email")}>More</button>}><Err pack={P.email} /><Badges list={P.email.badges} /><Facts rows={(P.email.facts || []).filter((x) => ["Type", "Domain accepts email", "Did they mean?", "Mailbox check"].includes(x[0]))} /></Card>}
              {P.device && <Card icon={Smartphone} title="Device" right={<button className="ghost sm" onClick={() => setTab("device")}>More</button>}><Err pack={P.device} /><Badges list={P.device.badges} /><Facts rows={(P.device.facts || []).slice(0, 4)} /></Card>}
              {P.history && <Card icon={History} title="In Modo" right={<button className="ghost sm" onClick={() => setTab("history")}>More</button>}><Err pack={P.history} /><Badges list={P.history.badges} /><Facts rows={P.history.facts} /></Card>}
              {P.address?.map && <Card icon={Store} title="Map" wide><IntelMap center={P.address.map} stores={P.address.stores} /></Card>}
            </div>
          )}

          {tab === "phone" && P.phone && <div className="ci-grid"><Card icon={Phone} title="Phone intel" wide><Err pack={P.phone} /><Badges list={P.phone.badges} /><Facts rows={P.phone.facts} />{P.phone.note && <p className="muted small" style={{ margin: 0 }}>{P.phone.note}</p>}<Links list={P.phone.links} /></Card></div>}

          {tab === "address" && P.address && (
            <div className="ci-grid">
              <Card icon={MapPin} title="Verified address"><Err pack={P.address} /><Badges list={P.address.badges} /><Facts rows={P.address.facts} /><Links list={P.address.links} /></Card>
              {P.address.hood && <Card icon={Home} title="Neighbourhood profile"><Facts rows={P.address.hood} /><p className="muted small" style={{ margin: 0 }}>{P.address.hoodNote}</p></Card>}
              {P.address.map && <Card icon={Store} title="Map & nearby stores" wide>
                <IntelMap center={P.address.map} stores={P.address.stores} />
                {P.address.stores ? (
                  <div className="ci-stores">
                    {[...(P.address.stores.ups || []), ...(P.address.stores.carriers || [])].map((s, i) => (
                      <a key={i} className="ci-store" target="_blank" rel="noreferrer noopener" href={`https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}`}>
                        <b>{s.brand === "UPS" ? "📦 " : "📱 "}{s.name}</b><span className="muted small">{s.addr || "—"}</span><span className="chip">{s.mi.toFixed(1)} mi</span>
                      </a>
                    ))}
                    {!P.address.stores.ups?.length && !P.address.stores.carriers?.length && <p className="muted small">No UPS or carrier stores within 10 miles on OpenStreetMap.</p>}
                  </div>
                ) : <p className="muted small" style={{ margin: 0 }}>Store search didn't answer this time.</p>}
              </Card>}
            </div>
          )}

          {tab === "availability" && P.availability && (
            <div className="ci-grid">
              <Card icon={Zap} title="Power & internet at this address" wide><Err pack={P.availability} /><Badges list={P.availability.badges} /><Facts rows={P.availability.facts} />{P.availability.note && <p className="muted small" style={{ margin: 0 }}>{P.availability.note} <button className="ghost sm" onClick={() => { setDeep(true); run({ deep: true }); }} disabled={busy}><Sparkles size={13} /> Deep scan now</button></p>}</Card>
              {P.availability.providers && <Card icon={Wifi} title="Internet providers (live web)" wide>
                <div className="tablewrap"><table><thead><tr><th>Provider</th><th>Type</th><th>Top speed</th><th>From</th></tr></thead><tbody>{P.availability.providers.map((p, i) => <tr key={i}><td><b>{p.name}</b></td><td>{p.type || "—"}</td><td>{p.maxDown || "—"}</td><td>{p.from || "—"}</td></tr>)}</tbody></table></div>
                <p className="muted small" style={{ margin: 0 }}>{P.availability.providersNote}</p>
              </Card>}
              <Card icon={ExternalLink} title="Check at the provider" wide><Links list={P.availability.links} /></Card>
            </div>
          )}

          {tab === "email" && P.email && <div className="ci-grid"><Card icon={Mail} title="Email intel" wide right={P.email.avatar ? <img src={P.email.avatar} alt="" width="40" height="40" style={{ borderRadius: 12 }} /> : null}><Err pack={P.email} /><Badges list={P.email.badges} /><Facts rows={P.email.facts} /></Card></div>}

          {tab === "device" && P.device && <div className="ci-grid"><Card icon={Smartphone} title="Device intel" wide><Err pack={P.device} /><Badges list={P.device.badges} /><Facts rows={P.device.facts} />{P.device.note && <p className="muted small" style={{ margin: 0 }}>{P.device.note}</p>}<Links list={P.device.links} /></Card></div>}

          {tab === "history" && P.history && (
            <div className="ci-grid">
              <Card icon={History} title="Already in Modo" wide><Err pack={P.history} /><Badges list={P.history.badges} /><Facts rows={P.history.facts} /></Card>
              {P.history.sales?.length > 0 && <Card icon={ShieldAlert} title="Sales with this phone or email" wide>
                <div className="tablewrap"><table><thead><tr><th>Receipt</th><th>Customer</th><th>Product</th><th>Agent</th><th>Status</th><th>Date</th></tr></thead>
                  <tbody>{P.history.sales.map((x) => <tr key={x.id}><td className="small">{x.receipt}</td><td>{x.customer || "—"}{x.dup && <span className="chip late" style={{ marginLeft: 6 }}>dup</span>}</td><td className="small">{x.product || "—"}</td><td className="small">{x.agent || "—"}</td><td><span className={"chip " + x.status}>{{ NEW: "New", VERIFIED: "Active", REJECTED: "Not active" }[x.status] || x.status}</span></td><td className="small muted">{new Date(x.at).toLocaleDateString()}</td></tr>)}</tbody></table></div>
              </Card>}
              {P.history.contacts?.length > 0 && <Card icon={Home} title="Customer records">{P.history.contacts.map((c) => <Link key={c.id} href={`${isAdmin ? "/admin" : "/agent"}/contacts/${c.id}`} className="ci-store"><b>{c.name}</b><span className="muted small">updated {new Date(c.at).toLocaleDateString()}</span></Link>)}</Card>}
              {P.history.calls?.length > 0 && <Card icon={Phone} title="Recent calls">{P.history.calls.map((c, i) => <div key={i} className="ci-store"><b>{c.result || "Call"}</b><span className="muted small">{new Date(c.at).toLocaleString()}{c.agent ? " · " + c.agent : ""}{c.seconds ? ` · ${Math.round(c.seconds / 60)} min` : ""}</span></div>)}</Card>}
            </div>
          )}

          {tab === "sources" && (
            <div className="ci-grid">
              <Card icon={ListTree} title="Every source this scan used" wide>
                <div className="tablewrap"><table><thead><tr><th>Source</th><th>Result</th><th className="r">Time</th></tr></thead>
                  <tbody>{Object.entries(P).flatMap(([k, p]) => (p?.sources || []).map((s, i) => <tr key={k + i}><td>{s.name}</td><td>{s.ok ? <span className="chip ok">answered</span> : <span className="chip red" title={s.note || ""}>{s.note ? s.note.slice(0, 60) : "no answer"}</span>}</td><td className="r small muted">{s.ms ? `${s.ms} ms` : "—"}</td></tr>))}</tbody></table></div>
                <div className="ci-badges">{Object.entries(d.connected || {}).map(([k, on]) => <span key={k} className={"chip " + (on ? "ok" : "muted")}>{({ veriphone: "Veriphone", numverify: "NumVerify", abstractphone: "Abstract Phone", abstractemail: "Abstract Email", nrel: "NREL rates", usps: "USPS", census: "Census key" })[k]}{on ? " ✓" : " — not connected"}</span>)}</div>
                {isAdmin && <p className="muted small" style={{ margin: 0 }}>Free built-ins always run: Census geocoder & neighbourhood data, OpenStreetMap, Open-Meteo, National Weather Service, federal utility maps, Google DNS, RDAP, Gravatar, Osmocom IMEI database. Add the optional free keys above in <Link href="/admin/connectors">Connectors → Customer intel</Link> for carrier, mailbox, USPS and power-rate data.</p>}
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
