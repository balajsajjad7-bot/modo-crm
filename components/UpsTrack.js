"use client";
// UPS package on a sale card: tracking link + a live progress graphic kept up to date by the Modo bot.
import { useEffect, useState } from "react";
import { Tag, Store, Truck, Navigation, PackageCheck, ExternalLink, RefreshCw, Bot, AlertTriangle, ChevronDown, Copy, Check } from "lucide-react";

const STEPS = [["label", "Label", Tag], ["dropped_off", "Dropped off", Store], ["in_transit", "On the way", Truck], ["out_for_delivery", "Out for delivery", Navigation], ["delivered", "Delivered", PackageCheck]];
const LABEL = { label: "Label made — waiting for the customer to drop it off", dropped_off: "Dropped off at UPS", in_transit: "On the way", out_for_delivery: "Out for delivery", delivered: "Delivered", exception: "Problem with the package — check UPS", returned: "Returned to sender", unknown: "Waiting for UPS's first scan" };
const idxOf = (st) => { const i = STEPS.findIndex(([k]) => k === st); return st === "exception" || st === "returned" ? -1 : i < 0 ? 0 : i; };
const ago = (d) => { if (!d) return ""; const m = Math.round((Date.now() - new Date(d)) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
const day = (d) => (d ? new Date(d).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }) : "");
const when = (d) => (d ? new Date(d).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");
export const trackLink = (n, service) => /^usps/i.test(service || "") ? `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(n)}`
  : /^fedex/i.test(service || "") ? `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(n)}` : `https://www.ups.com/track?loc=en_US&tracknum=${encodeURIComponent(String(n).replace(/\s/g, ""))}`;

export default function UpsTrack({ s, compact }) {
  const num = s.returnTracking || (!/^(verizon|att|tmobile)$/i.test(s.carrier || "") ? s.trackingNo : null);
  const service = s.returnTracking ? s.returnService : s.carrier;
  const [t, setT] = useState(() => pick(s)); const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [open, setOpen] = useState(false); const [copied, setCopied] = useState(false);
  useEffect(() => { setT((x) => (new Date(s.upsAt || 0) >= new Date(x.upsAt || 0) ? pick(s) : x)); }, [s.upsAt, s.upsStatus]); // eslint-disable-line
  async function check() {
    setBusy(true); setErr("");
    const r = await fetch("/api/sales/ups-bot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: s.id }) });
    const d = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) return setErr(d.error || "Couldn't check UPS.");
    if (d.sale) setT(pick(d.sale));
  }
  // Never checked yet → let the bot look right away
  useEffect(() => { if (num && !s.upsAt && !compact) check(); }, [s.id]); // eslint-disable-line
  if (!num) return null;

  const st = t.upsStatus || "unknown"; const i = idxOf(st); const bad = i < 0;
  const pct = bad ? 100 : (Math.max(0, i) / (STEPS.length - 1)) * 100;
  const events = (() => { try { return JSON.parse(t.upsEvents || "[]"); } catch { return []; } })();
  const isUps = !/^(usps|fedex)/i.test(service || "");
  return (
    <div className={"ups-t " + st + (bad ? " bad" : "")}>
      <div className="ups-top">
        <span className="ups-badge" aria-hidden>{isUps ? "UPS" : String(service || "").split(" ")[0].toUpperCase()}</span>
        <div className="ups-num">
          <span className="sf-l">{s.returnTracking ? "Return package" : "Package"} tracking</span>
          <a href={trackLink(num, service)} target="_blank" rel="noreferrer" className="num">{num} <ExternalLink size={11} /></a>
        </div>
        <span style={{ flex: 1 }} />
        <button className="ghost sm icon-btn" title="Copy tracking number" aria-label="Copy tracking number" onClick={() => { navigator.clipboard?.writeText(num); setCopied(true); setTimeout(() => setCopied(false), 1300); }}>{copied ? <Check size={13} /> : <Copy size={13} />}</button>
        <a className="btn-link ups-go" href={trackLink(num, service)} target="_blank" rel="noreferrer"><Truck size={13} /> Track on {isUps ? "UPS" : "carrier"}</a>
      </div>

      <div className="ups-rail" role="img" aria-label={`Package status: ${LABEL[st] || st}`}>
        <div className="ups-line"><i style={{ width: pct + "%" }} /></div>
        {STEPS.map(([k, l, Icon], n) => (
          <div key={k} className={"ups-step" + (!bad && n < i ? " done" : "") + (!bad && n === i ? " now" : "")} style={{ left: (n / (STEPS.length - 1)) * 100 + "%" }}>
            <span className="ups-dot"><Icon size={13} /></span><span className="ups-sl">{l}</span>
          </div>
        ))}
        {!bad && i > 0 && i < 4 && <span className="ups-truck" style={{ left: `calc(${pct}% - 2px)` }}>🚚</span>}
      </div>

      <div className="ups-now">
        {bad ? <AlertTriangle size={15} /> : st === "delivered" ? <PackageCheck size={15} /> : <Bot size={15} />}
        <div style={{ minWidth: 0 }}>
          <b>{LABEL[st] || st}</b>
          <span className="small muted">{[t.upsStage && t.upsStage !== LABEL[st] ? t.upsStage : "", events[0]?.loc, st === "delivered" && s.deliveredAt ? when(s.deliveredAt) : t.upsEta && st !== "delivered" ? "arrives " + day(t.upsEta) : ""].filter(Boolean).join(" · ")}</span>
        </div>
        <span style={{ flex: 1 }} />
        <span className="ups-bot small muted" title={t.upsSrc ? "Read from " + t.upsSrc : ""}><Bot size={12} /> {t.upsAt ? `checked ${ago(t.upsAt)}` : "Modo bot"}</span>
        <button className="ghost sm icon-btn" aria-label="Check UPS now" title="Check UPS now" onClick={check} disabled={busy}><RefreshCw size={13} className={busy ? "spin" : ""} /></button>
        {events.length > 0 && <button className="ghost sm icon-btn" aria-label="Show scans" title="Show UPS scans" onClick={() => setOpen(!open)}><ChevronDown size={14} style={{ transform: open ? "rotate(180deg)" : "", transition: ".2s" }} /></button>}
      </div>
      {(err || t.upsError) && <p className="small ups-err">{err || (/NO_SOURCE/.test(t.upsError) ? "Connect UPS tracking in Connectors so the bot can follow this package." : t.upsError)}</p>}
      {open && <ol className="ups-scans">{events.map((e, n) => <li key={n}><b>{e.msg}</b><span className="small muted">{[e.loc, when(e.at)].filter(Boolean).join(" · ")}</span></li>)}</ol>}
    </div>
  );
}
function pick(s) { return { upsStatus: s.upsStatus, upsStage: s.upsStage, upsEta: s.upsEta, upsEvents: s.upsEvents, upsAt: s.upsAt, upsSrc: s.upsSrc, upsError: s.upsError }; }
