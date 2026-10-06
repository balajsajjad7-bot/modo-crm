"use client";
import AiButton from "@/components/AiButton";
// One sale: compact summary first (no long scrolling), full details one click away.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import OrderCheck, { OrderStatusChip } from "@/components/OrderCheck";
import dynamic from "next/dynamic";
const SaleMap = dynamic(() => import("@/components/SaleMap"), { ssr: false, loading: () => <div className="sm-loading muted small">Loading map…</div> });
import { nearestLine, dropLine } from "@/lib/nearest";
import DeviceArt from "@/components/DeviceArt";
import UpsTrack from "@/components/UpsTrack";
import BrandLogo from "@/components/BrandLogo";
import { brandDomain } from "@/lib/brands";
import { User, Phone, Mail, MapPin, Receipt, Smartphone, Gift, Building2, Clock, Copy, AlertTriangle, StickyNote, Trash2, ChevronDown, Layers, PackagePlus, Send, Tag, RefreshCw, Pencil, Package, ExternalLink, Printer, CreditCard, Maximize2, Minimize2, X, Store } from "lucide-react";

export const pkTime = (d) => d ? new Date(d).toLocaleString("en-PK", { timeZone: "Asia/Karachi", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) + " PKT" : "—";
const $ = (n) => (n == null || n === "" || isNaN(Number(n)) ? "—" : "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const v = (x) => (x == null || x === "" ? "—" : x);
const fmtPhone = (p) => { const d = String(p || "").replace(/\D/g, "").slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p; };
// "123 Main St, Apt 4, Dallas, TX 75201" or "… Miami FL 33101" → "Dallas, TX" / "Miami, FL"
const cityOf = (addr) => {
  const t = String(addr || "").replace(/\s+/g, " ").trim();
  const m = t.match(/(?:,\s*|\s)([A-Za-z .'-]+?),?\s+([A-Z]{2})\.?\s*(\d{5}(-\d{4})?)?\s*(?:,?\s*(?:US|USA))?$/);
  if (!m) return "";
  const city = m[1].split(",").pop().trim().replace(/^(apt|unit|suite|ste|#)\b.*$/i, "");
  return city ? `${city}, ${m[2]}` : m[2];
};
const ORD = (n) => n + (["th", "st", "nd", "rd"][((n % 100) - 20) % 10] || ["th", "st", "nd", "rd"][n % 100] || "th");
const BRAND_COLORS = [[/verizon/i, "#cd040b"], [/at&t|\batt\b/i, "#009fdb"], [/t-?mobile|metro/i, "#e20074"], [/spectrum/i, "#0099d8"], [/xfinity|comcast/i, "#6138f5"], [/cricket/i, "#2a8c3c"], [/boost/i, "#f7931e"], [/mint/i, "#3fa34d"]];
const brandColor = (n) => (BRAND_COLORS.find(([re]) => re.test(n || "")) || [, "#7c3aed"])[1];
export const STATUS = [["NEW", "New"], ["VERIFIED", "Active"], ["REJECTED", "Not active"]];
const cls = { NEW: "new", VERIFIED: "active", REJECTED: "inactive" };

function F({ label, value, big, accent }) {
  return <div className={"sf" + (big ? " big" : "")}><span className="sf-l">{label}</span><span className={"sf-v" + (accent ? " accent" : "")}>{value}</span></div>;
}

export function StatusSwitch({ value, onChange }) {
  const i = Math.max(0, STATUS.findIndex(([k]) => k === value));
  return (
    <div className={"status-switch s" + i} role="radiogroup" aria-label="Sale status">
      <span className="thumb" aria-hidden="true" />
      {STATUS.map(([k, l]) => <button key={k} role="radio" aria-checked={value === k} className={value === k ? "on" : ""} onClick={() => value !== k && onChange(k)}>{l}</button>)}
    </div>
  );
}

const post = (url, body) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) }));
const priceAge = (d) => { if (!d) return ""; const days = Math.floor((Date.now() - new Date(d)) / 864e5); return days < 1 ? "today" : days === 1 ? "yesterday" : days + " days ago"; };

// Device value: what the device is worth today (looked up online). Re-check or set by hand.
function DeviceValue({ s, onPatch }) {
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function run(body) {
    setBusy(true); setErr("");
    const { ok, d } = await post("/api/sales/value", { id: s.id, ...body }); setBusy(false);
    if (!ok) return setErr(d.error || "Couldn't check the price.");
    if (d.sales?.[0]) onPatch(d.sales[0]); else if (d.errors?.[0]) setErr(d.errors[0].error);
  }
  const edit = () => { const v = prompt("Device value in $ (leave empty to clear):", s.deviceValue ?? ""); if (v !== null) run({ value: v.replace(/[$,\s]/g, "") }); };
  return (
    <section className="sale-sec"><h4><Tag size={13} /> Device value</h4>
      <div className="sf-grid">
        <F label="New price today" value={busy ? "Checking…" : $(s.deviceValue)} accent />
        <F label="Used / resale" value={$(s.deviceValueUsed)} />
        <F label="Source" value={s.deviceValueSrc ? `${s.deviceValueSrc}${s.deviceValueAt ? " · " + priceAge(s.deviceValueAt) : ""}` : "—"} />
      </div>
      <div className="row" style={{ gap: 6, marginTop: 8 }}>
        <button className="ghost sm" disabled={busy || !s.device} onClick={() => run({ refresh: true })}><RefreshCw size={13} /> Re-check price online</button>
        <button className="ghost sm" disabled={busy} onClick={edit}><Pencil size={13} /> Set by hand</button>
      </div>
      {err && <p className="err small" style={{ margin: "6px 0 0" }}>{err}</p>}
    </section>
  );
}

// Prepaid return label (customer → your warehouse) through Shippo, plus a Pirate Ship fallback.
function ReturnLabel({ s, labels, onPatch }) {
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(""); const [copied, setCopied] = useState(false);
  const [quote, setQuote] = useState(null); const [pick, setPick] = useState(null); const [again, setAgain] = useState(false);
  // Checkout step 1: get prices (nothing is charged)
  async function getQuote(remake = false) {
    setBusy(true); setMsg(""); setQuote(null); setAgain(remake);
    const { ok, d } = await post("/api/sales/return-label", { id: s.id, quote: true }); setBusy(false);
    if (!ok) { onPatch({ returnError: d.error }); return setMsg(d.error || "Couldn't get prices."); }
    setQuote(d); setPick(d.rates.find((r) => !r.overLimit)?.id || d.rates[0]?.id);
  }
  // Step 2: pay for the chosen label (Shippo charges the card saved in your Shippo account)
  async function pay() {
    const r = quote?.rates.find((x) => x.id === pick); if (!r) return;
    await make({ rateId: r.id, again }); setQuote(null);
  }
  async function make(body) {
    setBusy(true); setMsg("");
    const { ok, d } = await post("/api/sales/return-label", { id: s.id, ...body }); setBusy(false);
    if (d.sale) onPatch(d.sale);
    if (!ok) return setMsg(d.error || "Couldn't make the label.");
    setMsg(d.emailError || (d.emailed ? `Label ready and emailed to ${s.email}.` : body.email ? "" : "Label ready."));
    if (body.rateId && d.sale?.returnLabelUrl) window.open(d.sale.returnLabelUrl, "_blank", "noopener");
  }
  function pirate() {
    const to = labels?.to;
    const txt = [`SHIP FROM (customer):`, s.customer, s.address, s.zip, s.phone, "", `SHIP TO (return address):`,
      to ? [to.name, to.company, to.street1, to.street2, `${to.city}, ${to.state} ${to.zip}`, to.phone].filter(Boolean).join("\n") : "(your warehouse address)"].filter((x) => x != null).join("\n");
    navigator.clipboard?.writeText(txt).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); });
    window.open("https://ship.pirateship.com/", "_blank", "noopener");
  }
  return (
    <section className="sale-sec"><h4><Package size={13} /> Return label</h4>
      {s.returnLabelUrl ? (
        <div className="sf-grid">
          <F label="Label" value={<a href={s.returnLabelUrl} target="_blank" rel="noreferrer">Open / print <ExternalLink size={12} /></a>} accent />
          <F label="Service" value={v(s.returnService)} />
          <F label="Cost" value={$(s.returnCost)} />
          <F label="Tracking" value={s.returnTracking ? <a href={/^usps/i.test(s.returnService || "") ? `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(s.returnTracking)}` : /^fedex/i.test(s.returnService || "") ? `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(s.returnTracking)}` : `https://www.ups.com/track?tracknum=${encodeURIComponent(s.returnTracking)}`} target="_blank" rel="noreferrer">{s.returnTracking}</a> : "—"} />
          <F label="Made" value={pkTime(s.returnLabelAt)} />
        </div>
      ) : <p className="muted small" style={{ margin: 0 }}>{labels?.ready ? `No label yet.${labels.auto ? " One is made automatically when this sale is marked Active." : ""}` : "Set up Shippo in Connectors → Return labels to make labels automatically."}</p>}
      {s.returnError && !s.returnLabelUrl && <p className="err small" style={{ margin: "6px 0 0" }}><AlertTriangle size={12} /> {s.returnError}</p>}
      <div className="row" style={{ gap: 6, marginTop: 8 }}>
        {labels?.ready && !s.returnLabelUrl && !quote && <button className="sm" disabled={busy || !s.address} onClick={() => getQuote(false)}><Printer size={13} /> {busy ? "Getting prices…" : "Make return label"}</button>}
        {s.returnLabelUrl && s.email && <button className="ghost sm" disabled={busy} onClick={() => make({ email: true })}><Send size={13} /> Email to customer</button>}
        {s.returnLabelUrl && !quote && <button className="ghost sm" disabled={busy} onClick={() => getQuote(true)}><RefreshCw size={13} /> New label</button>}
        <button className="ghost sm" disabled={!s.address} onClick={pirate} title="Copies both addresses and opens Pirate Ship"><Copy size={13} /> {copied ? "Addresses copied" : "Pirate Ship (manual)"}</button>
      </div>
      {quote && (
        <div className="rl-checkout">
          <div className="rl-head"><b>Choose a label</b><span className="muted small">From {quote.from.city}, {quote.from.state} to your warehouse{quote.test ? " · TEST mode: free" : ""}</span></div>
          <div className="rl-rates">{quote.rates.map((r) => (
            <label key={r.id} className={"rl-rate" + (pick === r.id ? " on" : "") + (r.overLimit ? " over" : "")}>
              <input type="radio" name={"rate-" + s.id} checked={pick === r.id} onChange={() => setPick(r.id)} />
              <span className="rl-svc"><b>{r.provider} {r.service}</b><small>{r.days ? `${r.days} day${r.days > 1 ? "s" : ""}` : "transit time varies"}{r.overLimit ? ` · above your $${quote.maxPrice} limit` : ""}</small></span>
              <b className="num">${r.price.toFixed(2)}</b>
            </label>))}</div>
          <div className="row" style={{ gap: 6 }}>
            <button disabled={busy || !pick} onClick={pay}><CreditCard size={14} /> {busy ? "Paying…" : `Pay $${(quote.rates.find((r) => r.id === pick)?.price || 0).toFixed(2)} & create label`}</button>
            <button className="ghost sm" disabled={busy} onClick={() => setQuote(null)}>Cancel</button>
            <a className="ghost sm btn-link" href="https://apps.goshippo.com/settings/billing" target="_blank" rel="noreferrer"><CreditCard size={13} /> Payment card</a>
          </div>
          <p className="muted small" style={{ margin: 0 }}>{quote.test ? "Test key: no charge, the label is a sample." : "Shippo charges the card saved in your Shippo account. Add or change it with “Payment card”."}</p>
        </div>
      )}
      {msg && <p className="muted small" style={{ margin: "6px 0 0" }}>{msg}</p>}
    </section>
  );
}

export default function SaleCard({ s: base, onStatus, onDelete, onEmail, preview, labels, defaultOpen = false, wide = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const [max, setMax] = useState(false); const [more, setMore] = useState(false);
  useEffect(() => {
    if (!max) return;
    const esc = (e) => e.key === "Escape" && setMax(false);
    document.addEventListener("keydown", esc); document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = ""; };
  }, [max]);
  // Order status saved by "Check order" (from this tab, or from the Modo Fill return tab) shows up at once.
  const [live, setLive] = useState(null);
  useEffect(() => {
    if (preview || !base.id) return;
    const on = (e) => { if (e.key !== "modo-order-status" || !e.newValue) return; try { const d = JSON.parse(e.newValue); if (d.id === base.id) setLive(d); } catch {} };
    window.addEventListener("storage", on); return () => window.removeEventListener("storage", on);
  }, [base.id, preview]);
  const [patch, setPatch] = useState({});
  const onPatch = (d) => setPatch((p) => ({ ...p, ...d }));
  const s0 = live && (!base.trackUpdatedAt || new Date(live.trackUpdatedAt) > new Date(base.trackUpdatedAt)) ? { ...base, ...live } : base;
  const s = { ...s0, ...Object.fromEntries(Object.entries(patch).filter(([k]) => k !== "id")) };
  const status = s.status || "NEW";
  const save = s.billBefore != null && s.billAfter != null && s.billBefore !== "" && s.billAfter !== "" ? s.billBefore - s.billAfter : null;
  const flags = (s.flags || "").split(",").map((x) => x.trim()).filter(Boolean);
  const deviceLine = [s.device, s.storage, s.deviceColor].filter(Boolean).join(" · ") || "—";
  const sibs = s.siblings || [];
  return (
    <Portal on={max}>
    {max && <div className="sale-max-bg" onClick={() => setMax(false)} />}
    <article className={"sale-card " + cls[status] + (max ? " max" : "") + (wide && !max ? " wide" : "")}>
      {!preview && (
        <div className="sale-winbtns">
          {(open || max) && <button className="ghost sm icon-btn" title="Minimise" aria-label="Minimise" onClick={() => { setMax(false); setOpen(false); }}><Minimize2 size={14} /></button>}
          <button className="ghost sm icon-btn" title={max ? "Exit full screen" : "Maximise"} aria-label={max ? "Exit full screen" : "Maximise"} onClick={() => { setOpen(true); setMax(!max); }}>{max ? <X size={14} /> : <Maximize2 size={14} />}</button>
        </div>
      )}
      <header className="sale-head">
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 6 }}>
            <span className="sf-l">Order</span>
            {s.seqTotal > 1 && <span className="seq-badge b3d"><Layers size={11} /> {ORD(s.seq)} sale of {s.seqTotal}</span>}
            {s.saleType === "addon" && <span className="seq-badge addon b3d"><PackagePlus size={11} /> Add-on device</span>}
            {s.campaignName && <span className="seq-badge camp b3d" style={{ "--bc": s.campaignColor || brandColor(s.campaignName) }}>{brandDomain(s.campaignName) && <span className="b3d-logo"><BrandLogo name={s.campaignName} size={14} round={4} /></span>}{s.campaignName}</span>}
          </div>
          <div className="order-no">#{v(s.orderNumber)}</div>
          <div className="row" style={{ gap: 6, marginTop: 2 }}>
            {!preview && <OrderStatusChip s={s} />}
            {!preview && <button className="ghost sm ups-jump" onClick={() => document.getElementById("ups-" + s.id)?.scrollIntoView({ behavior: "smooth", block: "center" })}>🚚 UPS{s.upsStatus ? " · " + ({ label: "label made", dropped_off: "dropped off", in_transit: "on the way", out_for_delivery: "out for delivery", delivered: "delivered", exception: "problem", returned: "returned" }[s.upsStatus] || "") : (s.returnTracking || s.trackingNo) ? "" : " · add tracking"}</button>}
          </div>
        </div>
        {onStatus ? <StatusSwitch value={status} onChange={(k) => onStatus(s.id, k)} /> : <span className={"sale-status " + cls[status]}>{STATUS.find(([k]) => k === status)[1]}</span>}
      </header>

      {/* Most important first: who, how to reach them, what they bought and what it's worth */}
      <div className="sale-key">
        <div className="sk-who">
          <span className="sf-l"><User size={11} /> Customer</span>
          <b className="sk-name">{v(s.customer)}</b>
          <div className="sk-line">
            {s.phone ? <a href={`tel:+1${String(s.phone).replace(/\D/g, "").slice(-10)}`} className="sk-phone"><Phone size={12} /> {fmtPhone(s.phone)}</a> : <span className="muted">no phone</span>}
            {(cityOf(s.address) || s.zip) && <span className="muted"><MapPin size={12} /> {[cityOf(s.address), s.zip].filter(Boolean).join(" ")}</span>}
          </div>
        </div>
        <div className="sk-dev">
          <DeviceArt device={s.device} color={s.deviceColor} size={wide ? 50 : 56} />
          <div className="sk-dev-t">
            <span className="sf-l"><Smartphone size={11} /> {v(s.device)}{s.storage ? " · " + s.storage : ""}</span>
            <b className="sk-val">{s.deviceValue != null ? $(s.deviceValue) : s.device && !preview ? <span className="muted" style={{ fontSize: 15 }}>Checking value…</span> : "—"}</b>
            <span className="small muted">{s.deviceValueUsed != null ? `used ${$(s.deviceValueUsed)}` : "device value"}{s.deviceColor ? " · " + s.deviceColor : ""}</span>
          </div>
        </div>
      </div>
      {!preview && <div id={"ups-" + s.id}><UpsTrack s={s} /></div>}
      <div className="sale-meta">
        <span><Receipt size={12} /> <b>{$(s.billAfter)}</b>/mo <span className="muted">was {$(s.billBefore)}{s.discountPct != null && s.discountPct !== "" ? ` · ${s.discountPct}% off` : ""}</span></span>
        <span><Building2 size={12} /> {v(s.closer)}</span>
        <span className="muted"><Clock size={12} /> {preview ? pkTime(new Date()) : pkTime(s.createdAt)}</span>
        {!preview && dropLine(s) ? <span className="sale-ups dropped"><Store size={12} /> Dropped at {dropLine(s)}</span> : !preview && nearestLine(s) ? <span className="sale-ups"><Store size={12} /> Nearest UPS: {nearestLine(s)}</span> : null}
      </div>

      {sibs.length > 0 && (
        <div className="sibs">
          <span className="sf-l">This customer's other sales</span>
          <div className="row" style={{ gap: 6 }}>
            {sibs.map((x) => <span key={x.id} className={"sib " + cls[x.status]}><i /><DeviceArt device={x.device} size={16} />#{x.orderNumber || "—"} · {x.device || "device"} · {STATUS.find(([k]) => k === x.status)?.[1]}</span>)}
          </div>
        </div>
      )}
      {flags.length > 0 && <div className="sale-flags">{flags.map((f) => <span key={f}><AlertTriangle size={12} /> {f}</span>)}</div>}

      {open && (
        <div className="sale-details">
          <div className="sd-a">
          {!preview && (
            <div className="sale-actions">
              {s.phone && <a className="btn-link" href={`tel:+1${String(s.phone).replace(/\D/g, "").slice(-10)}`}><Phone size={13} /> Call</a>}
              {onEmail && s.email && <button className="ghost sm" onClick={() => onEmail(s)}><Send size={13} /> Email</button>}
              {s.address && <button className="ghost sm" onClick={() => navigator.clipboard?.writeText([s.customer, s.address, s.zip].filter(Boolean).join("\n"))}><Copy size={13} /> Copy address</button>}
              {onStatus && s.id && s.orderNumber && <OrderCheck s={s} onSaved={(d) => d && setLive(d)} />}
              {onStatus && s.id && <AiButton task="check_sale" payload={{ id: s.id }} label="AI check" />}
            </div>
          )}
          {s.notes ? <section className="sale-sec sale-notes"><h4><StickyNote size={13} /> Notes</h4><div className="sf-v" style={{ fontWeight: 600, whiteSpace: "pre-wrap" }}>{s.notes}</div></section> : null}
          <section className="sale-sec"><h4><Smartphone size={13} /> Device</h4><div className="sf-grid">
            <F label="Device" value={v(s.device)} /><F label="Color" value={v(s.deviceColor)} /><F label="Storage" value={v(s.storage)} />
            <F label="Specifications" value={v(s.specs)} /><F label={<><Gift size={11} /> Gift</>} value={v(s.gift)} />
          </div></section>
          {!preview && s.id && <DeviceValue s={s} onPatch={onPatch} />}
          <section className="sale-sec"><h4><Receipt size={13} /> Bill</h4><div className="sf-grid">
            <F label="Paying now" value={$(s.billBefore)} /><F label="Discount" value={s.discountPct != null && s.discountPct !== "" ? s.discountPct + "%" : "—"} accent /><F label="After discount" value={$(s.billAfter)} accent />
            <F label="Saves / month" value={$(save)} /><F label="Next bill" value={s.nextBillDate ? new Date(s.nextBillDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—"} />
            <F label="Lines" value={v(s.lines)} /><F label="Overcharged" value={$(s.overcharged)} />
          </div></section>
          <button className="ghost sm sale-more" onClick={() => setMore(!more)} aria-expanded={more}><ChevronDown size={13} style={{ transform: more ? "rotate(180deg)" : "none", transition: "transform .2s" }} /> {more ? "Less" : "More details"} <span className="muted">· contact, team</span></button>
          {more && <>
          <section className="sale-sec"><h4><User size={13} /> Contact</h4><div className="sf-grid">
            <F label="Name" value={v(s.customer)} /><F label="Phone" value={v(s.phone)} /><F label={<><Mail size={11} /> Email</>} value={v(s.email)} />
            <F label={<><MapPin size={11} /> Address</>} value={v(s.address)} /><F label="Zip code" value={v(s.zip)} />
          </div></section>
          <section className="sale-sec"><h4><Building2 size={13} /> Team</h4><div className="sf-grid">
            <F label="Office" value={v(s.office)} /><F label="Location code" value={v(s.locationCode)} /><F label="Sent by" value={v(s.user?.name || s.sentBy)} /><F label="Closed by" value={v(s.closer)} />
          </div></section>
          </>}
          </div>
          <div className="sd-b">
          {!preview && s.id && <section className="sale-sec"><h4><MapPin size={13} /> Where the customer is · nearest UPS</h4><SaleMap sale={s} big={max} onDrop={(d) => onPatch({ dropStore: d ? JSON.stringify(d) : null })} /></section>}
          {!preview && s.id && <ReturnLabel s={s} labels={labels} onPatch={onPatch} />}
          </div>
        </div>
      )}

      <footer className="sale-foot">
        <button className="ghost sm more" onClick={() => setOpen(!open)} aria-expanded={open}><ChevronDown size={14} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }} /> {open ? "Minimise" : "Open sale · map"}{!open && s.notes ? " · has notes" : ""}</button>
        {!preview && <span className="muted small">{s.receipt}</span>}
        {!preview && s.returnLabelUrl && <a className="chip" href={s.returnLabelUrl} target="_blank" rel="noreferrer" title="Prepaid return label"><Package size={11} /> Return label</a>}
        {!preview && !s.returnLabelUrl && s.returnError && <span className="chip warn-chip" title={s.returnError}><AlertTriangle size={11} /> Label failed</span>}
        {!preview && (
          <div className="row" style={{ marginLeft: "auto", gap: 6 }}>
            {!open && onStatus && s.id && s.orderNumber && <OrderCheck s={s} onSaved={(d) => d && setLive(d)} />}
            <button className="ghost sm icon-btn" title="Copy sale" aria-label="Copy sale" onClick={() => navigator.clipboard?.writeText(s.raw || "")}><Copy size={14} /></button>
            {onDelete && <button className="ghost sm icon-btn del" title="Delete sale" aria-label="Delete sale" onClick={() => onDelete(s)}><Trash2 size={14} /></button>}
          </div>
        )}
      </footer>
    </article>
    </Portal>
  );
}
// Full screen: move the card to the page level (its list wrapper is animated, which traps fixed elements)
function Portal({ on, children }) { return on && typeof document !== "undefined" ? createPortal(children, document.body) : <>{children}</>; }
