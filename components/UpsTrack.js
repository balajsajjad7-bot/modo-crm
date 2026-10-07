"use client";
import { markCheck } from "@/lib/checkIntent";
// UPS package on a sale card: tracking link + a live progress graphic kept up to date by the Modo bot.
import { useEffect, useRef, useState } from "react";
import { detectUps } from "@/lib/upsText";
import { encodeUps } from "@/lib/orderFill";
import { Tag, Store, Truck, Navigation, PackageCheck, ExternalLink, RefreshCw, Bot, AlertTriangle, ChevronDown, Copy, Check, Pencil, ClipboardPaste, Camera, X } from "lucide-react";

const STEPS = [["label", "Label", Tag], ["dropped_off", "Dropped off", Store], ["in_transit", "On the way", Truck], ["out_for_delivery", "Out for delivery", Navigation], ["delivered", "Delivered", PackageCheck]];
const LABEL = { label: "Label made — waiting for the customer to drop it off", dropped_off: "Dropped off at UPS", in_transit: "On the way", out_for_delivery: "Out for delivery", delivered: "Delivered", exception: "Problem with the package — check UPS", returned: "Returned to sender", unknown: "Waiting for UPS's first scan" };
const idxOf = (st) => { const i = STEPS.findIndex(([k]) => k === st); return st === "exception" || st === "returned" ? -1 : i < 0 ? 0 : i; };
const ago = (d) => { if (!d) return ""; const m = Math.round((Date.now() - new Date(d)) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
const day = (d) => (d ? new Date(d).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }) : "");
const when = (d) => (d ? new Date(d).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");
export const trackLink = (n, service) => /^usps/i.test(service || "") ? `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(n)}`
  : /^fedex/i.test(service || "") ? `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(n)}` : `https://www.ups.com/track?loc=en_US&tracknum=${encodeURIComponent(String(n).replace(/\s/g, ""))}`;

const isUpsNo = (n) => /^1Z[0-9A-Z]{16}$/i.test(String(n || "").replace(/\s/g, ""));
export default function UpsTrack({ s: s0, compact }) {
  const [own, setOwn] = useState(null); // tracking number added/changed here
  const s = own ? { ...s0, ...own } : s0;
  const num = s.returnTracking || (s.trackingNo && (isUpsNo(s.trackingNo) || !/^(verizon|att|tmobile)$/i.test(s.carrier || "")) ? s.trackingNo : null);
  // A 1Z… number written in the sale's notes/details but not in the Tracking box → offer it (and save it once).
  const found = !num ? (String([s.notes, s.specs, s.gift, s.raw].filter(Boolean).join(" ")).match(/\b1Z[\s-]?(?:[0-9A-Z][\s-]?){15}[0-9A-Z]\b/i)?.[0] || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase() : "";
  const service = s.returnTracking ? s.returnService : isUpsNo(s.trackingNo) ? "ups" : s.carrier;
  const [edit, setEdit] = useState(false); const [val, setVal] = useState(""); const [saved, setSaved] = useState("");
  async function saveNo(v) {
    setBusy(true); setErr("");
    const r = await fetch("/api/sales/ups-bot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: s.id, trackingNo: v }) });
    const d = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) return setErr(d.error || "Couldn't save.");
    setOwn({ trackingNo: d.sale?.trackingNo ?? null, carrier: d.sale?.carrier ?? null, upsAt: null }); setT(pick(d.sale || {})); setEdit(false); setVal("");
    setSaved(v ? (d.needsSetup ? "Saved on this sale. Connect UPS tracking in Connectors so the bot can read UPS scans." : "Saved on this sale ✓ The Modo bot tracks it from now on and alerts you when it's delivered.") : "");
  }
  const [t, setT] = useState(() => pick(s)); const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [open, setOpen] = useState(false); const [copied, setCopied] = useState(false);
  useEffect(() => { setT((x) => (new Date(s.upsAt || 0) >= new Date(x.upsAt || 0) ? pick(s) : x)); }, [s.upsAt, s.upsStatus]); // eslint-disable-line
  async function check() {
    setBusy(true); setErr("");
    const r = await fetch("/api/sales/ups-bot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: s.id }) });
    const d = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) return setErr(d.error || "Couldn't check UPS.");
    if (d.sale) setT(pick(d.sale));
  }
  useEffect(() => { if (found && !compact && /^1Z[0-9A-Z]{16}$/.test(found)) saveNo(found); }, [found]); // eslint-disable-line
  // ── Checked on UPS by hand → push the answer back into Modo ──
  const [pick2, setPick2] = useState(null); const [back, setBack] = useState(false); const [paste, setPaste] = useState(""); const [hint, setHint] = useState(""); const shot = useRef(null);
  async function setManual(status, stage) {
    setBusy(true); setErr("");
    const r = await fetch("/api/sales/ups-status", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: s.id, status, stage }) });
    const d = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) return setErr(d.error || "Couldn't save.");
    setT(pick(d.sale || {})); setPick2(null); setBack(false); setPaste(""); setHint(""); setSaved(`Saved: ${LABEL[status] || status} ✓`); setTimeout(() => setSaved(""), 4000);
  }
  const readText = (text) => { setPaste(text); const r = detectUps(text, num); if (r) { setPick2({ status: r.status, stage: r.stage }); setHint(`UPS says “${LABEL[r.status] || r.status}” — press Save.`); } else if (text.trim().length > 15) setHint("Couldn't find the status in that text — tap the step on the line above instead."); };
  async function pasteNow() { try { const t = await navigator.clipboard.readText(); if (t) return readText(t); } catch {} setHint("Long-press the box below and choose Paste."); }
  async function readShot(e) {
    const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
    setHint("Reading the screenshot…"); const fd = new FormData(); fd.set("image", file); fd.set("kind", "ups");
    const r = await fetch("/api/sales/order-status/read", { method: "POST", body: fd }); const d = await r.json().catch(() => ({}));
    if (!r.ok) return setHint(d.error || "Couldn't read the screenshot.");
    if (d.upsStatus) { setPick2({ status: d.upsStatus, stage: d.detail || "" }); setHint(`Screenshot says “${LABEL[d.upsStatus] || d.upsStatus}” — press Save.`); } else setHint("No status found in the screenshot — tap the step above instead.");
  }
  // "Track on UPS": the Modo app / Modo Fill add-on read UPS's page and save by themselves; otherwise when you
  // come back to Modo, the card asks what UPS said.
  function goUps(e) {
    const url = trackLink(num, service);
    const isUpsPkg = !/^(usps|fedex)/i.test(service || "");
    if (!isUpsPkg) return; // other carriers: plain link
    const code = encodeUps({ id: s.id, num }, location.origin); markCheck(s.id);
    if (/Android/i.test(navigator.userAgent)) { e.preventDefault(); location.href = `intent://check?d=${encodeURIComponent(code)}&u=${encodeURIComponent(url)}#Intent;scheme=modo;package=com.modo.crm;S.browser_fallback_url=${encodeURIComponent(url)};end`; }
    else if (document.documentElement.dataset.modoFill === "1") { e.preventDefault(); window.open(url + "#modo=" + encodeURIComponent(code), "_blank"); }
    try { sessionStorage.setItem("modo-ups-went", s.id); } catch {}
  }
  useEffect(() => {
    const on = () => { if (document.hidden) return; let w = ""; try { w = sessionStorage.getItem("modo-ups-went") || ""; } catch {} if (w === s.id) { try { sessionStorage.removeItem("modo-ups-went"); } catch {} setBack(true); setTimeout(() => document.getElementById("ups-" + s.id)?.scrollIntoView({ behavior: "smooth", block: "center" }), 200); } };
    const st = (e) => { if (e.key === "modo-order-status" && e.newValue) { try { const d = JSON.parse(e.newValue); if (d.id === s.id && d.upsStatus) { setT(pick(d)); setBack(false); } } catch {} } };
    document.addEventListener("visibilitychange", on); window.addEventListener("focus", on); window.addEventListener("storage", st);
    return () => { document.removeEventListener("visibilitychange", on); window.removeEventListener("focus", on); window.removeEventListener("storage", st); };
  }, [s.id]);
  // Never checked yet → let the bot look right away
  useEffect(() => { if (num && !s.upsAt && !compact && !edit) check(); }, [s.id, num]); // eslint-disable-line
  if (!num || edit) return (
    <div className="ups-t ups-empty">
      <div className="ups-top">
        <span className="ups-badge" aria-hidden>UPS</span>
        <div className="ups-num"><span className="sf-l">UPS tracking</span><span className="small muted">{num ? "Change the tracking number" : "No package yet — add the tracking number and the Modo bot follows it"}</span></div>
      </div>
      <form className="ups-add" onSubmit={(e) => { e.preventDefault(); if (val.trim()) saveNo(val); }}>
        <input value={val} onChange={(e) => setVal(e.target.value)} placeholder="1Z… tracking number" autoCapitalize="characters" spellCheck={false} aria-label="Tracking number" />
        <button type="submit" disabled={busy || !val.trim()}><Truck size={14} /> {busy ? "Saving…" : "Track"}</button>
        {edit && <button type="button" className="ghost" onClick={() => { setEdit(false); setVal(""); }}>Cancel</button>}
      </form>
      {edit && s.trackingNo && !s.returnTracking && <button className="ghost sm" style={{ justifySelf: "start" }} onClick={() => saveNo("")} disabled={busy}>Remove tracking number</button>}
      {err && <p className="small ups-err">{err}</p>}
    </div>
  );

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
        {!s.returnTracking && <button className="ghost sm icon-btn" title="Change tracking number" aria-label="Change tracking number" onClick={() => { setVal(num); setEdit(true); }}><Pencil size={13} /></button>}
        <button className="ghost sm icon-btn" title="Copy tracking number" aria-label="Copy tracking number" onClick={() => { navigator.clipboard?.writeText(num); setCopied(true); setTimeout(() => setCopied(false), 1300); }}>{copied ? <Check size={13} /> : <Copy size={13} />}</button>
        <a className="btn-link ups-go" href={trackLink(num, service)} target="_blank" rel="noreferrer" onClick={goUps}><Truck size={13} /> Track on {isUps ? "UPS" : "carrier"}</a>
      </div>

      <div className="ups-rail" role="group" aria-label={`Package status: ${LABEL[st] || st}. Tap a step to set it.`}>
        <div className="ups-line"><i style={{ width: pct + "%" }} /></div>
        {STEPS.map(([k, l, Icon], n) => (
          <button type="button" key={k} title={`Set to “${l}” (what UPS shows)`} onClick={() => setPick2({ status: k, stage: "" })}
            className={"ups-step" + (!bad && n < i ? " done" : "") + (!bad && n === i ? " now" : "") + (pick2?.status === k ? " pick" : "")} style={{ left: (n / (STEPS.length - 1)) * 100 + "%" }}>
            <span className="ups-dot"><Icon size={13} /></span><span className="ups-sl">{l}</span>
          </button>
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
      {pick2 && (
        <div className="ups-confirm">
          <span>Set to <b>{LABEL[pick2.status] || pick2.status}</b>{pick2.stage ? <span className="small muted"> — {pick2.stage}</span> : null}?</span>
          <span className="row" style={{ gap: 6 }}><button className="sm" disabled={busy} onClick={() => setManual(pick2.status, pick2.stage)}>{busy ? "Saving…" : "Save"}</button><button className="ghost sm" onClick={() => { setPick2(null); setHint(""); }}>Cancel</button></span>
        </div>
      )}
      {back && !pick2 && (
        <div className="ups-back">
          <div className="row" style={{ justifyContent: "space-between" }}><b className="small">What did UPS show? Update Modo</b><button className="ghost sm icon-btn" aria-label="Close" onClick={() => { setBack(false); setHint(""); }}><X size={13} /></button></div>
          <span className="small muted">Tap the step on the line above — or bring UPS's page back:</span>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            <button className="ghost sm" onClick={pasteNow}><ClipboardPaste size={13} /> Paste UPS page</button>
            <button className="ghost sm" onClick={() => shot.current?.click()}><Camera size={13} /> Read screenshot</button>
            <input ref={shot} type="file" accept="image/*" hidden onChange={readShot} />
          </div>
          <textarea rows={2} value={paste} onChange={(e) => readText(e.target.value)} placeholder="…or paste UPS's tracking text here" />
        </div>
      )}
      {hint && <p className="small ups-saved">{hint}</p>}
      {saved && <p className="small ups-saved">{saved}</p>}
      {(err || t.upsError) && <p className="small ups-err">{err || (/SHIPPO_TEST|not a valid test tracking carrier/i.test(t.upsError) ? "Your Shippo key is a test key, which can't track real UPS packages. Add your Shippo Live token in Connectors → Return labels (Shippo) → “Live token for tracking”. Meanwhile, tap the step UPS shows on the line above." : /NO_SOURCE/.test(t.upsError) ? "Connect UPS tracking in Connectors so the bot can follow this package — or tap the step UPS shows." : t.upsError)}</p>}
      {open && <ol className="ups-scans">{events.map((e, n) => <li key={n}><b>{e.msg}</b><span className="small muted">{[e.loc, when(e.at)].filter(Boolean).join(" · ")}</span></li>)}</ol>}
    </div>
  );
}
function pick(s) { return { upsStatus: s.upsStatus, upsStage: s.upsStage, upsEta: s.upsEta, upsEvents: s.upsEvents, upsAt: s.upsAt, upsSrc: s.upsSrc, upsError: s.upsError }; }
