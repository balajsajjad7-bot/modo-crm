"use client";
import AiButton from "@/components/AiButton";
// One sale: compact summary first (no long scrolling), full details one click away.
import { useEffect, useState } from "react";
import OrderCheck, { OrderStatusChip } from "@/components/OrderCheck";
import { User, Phone, Mail, MapPin, Receipt, Smartphone, Gift, Building2, Clock, Copy, AlertTriangle, StickyNote, Trash2, ChevronDown, Layers, PackagePlus, Send } from "lucide-react";

export const pkTime = (d) => d ? new Date(d).toLocaleString("en-PK", { timeZone: "Asia/Karachi", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) + " PKT" : "—";
const $ = (n) => (n == null || n === "" || isNaN(Number(n)) ? "—" : "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const v = (x) => (x == null || x === "" ? "—" : x);
const ORD = (n) => n + (["th", "st", "nd", "rd"][((n % 100) - 20) % 10] || ["th", "st", "nd", "rd"][n % 100] || "th");
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

export default function SaleCard({ s: base, onStatus, onDelete, onEmail, preview, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  // Order status saved by "Check order" (from this tab, or from the Modo Fill return tab) shows up at once.
  const [live, setLive] = useState(null);
  useEffect(() => {
    if (preview || !base.id) return;
    const on = (e) => { if (e.key !== "modo-order-status" || !e.newValue) return; try { const d = JSON.parse(e.newValue); if (d.id === base.id) setLive(d); } catch {} };
    window.addEventListener("storage", on); return () => window.removeEventListener("storage", on);
  }, [base.id, preview]);
  const s = live && (!base.trackUpdatedAt || new Date(live.trackUpdatedAt) > new Date(base.trackUpdatedAt)) ? { ...base, ...live } : base;
  const status = s.status || "NEW";
  const save = s.billBefore != null && s.billAfter != null && s.billBefore !== "" && s.billAfter !== "" ? s.billBefore - s.billAfter : null;
  const flags = (s.flags || "").split(",").map((x) => x.trim()).filter(Boolean);
  const deviceLine = [s.device, s.storage, s.deviceColor].filter(Boolean).join(" · ") || "—";
  const sibs = s.siblings || [];
  return (
    <article className={"sale-card " + cls[status]}>
      <header className="sale-head">
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 6 }}>
            <span className="sf-l">Order</span>
            {s.seqTotal > 1 && <span className="seq-badge"><Layers size={11} /> {ORD(s.seq)} sale of {s.seqTotal}</span>}
            {s.saleType === "addon" && <span className="seq-badge addon"><PackagePlus size={11} /> Add-on device</span>}
            {s.campaignName && <span className="seq-badge camp" style={s.campaignColor ? { color: s.campaignColor, borderColor: s.campaignColor + "66" } : undefined}>{s.campaignName}</span>}
          </div>
          <div className="order-no">#{v(s.orderNumber)}</div>
          {!preview && <OrderStatusChip s={s} />}
        </div>
        {onStatus ? <StatusSwitch value={status} onChange={(k) => onStatus(s.id, k)} /> : <span className={"sale-status " + cls[status]}>{STATUS.find(([k]) => k === status)[1]}</span>}
      </header>

      <div className="sale-summary">
        <F label={<><User size={11} /> Customer</>} value={<>{v(s.customer)}<span className="sub-v"><Phone size={11} /> {v(s.phone)}</span></>} big />
        <F label={<><Smartphone size={11} /> Device</>} value={<>{v(s.device)}<span className="sub-v">{[s.storage, s.deviceColor].filter(Boolean).join(" · ") || "—"}</span></>} big />
        <F label={<><Receipt size={11} /> Bill</>} value={<>{$(s.billAfter)}<span className="sub-v">was {$(s.billBefore)}</span></>} big accent />
        <F label="Discount" value={s.discountPct !== "" && s.discountPct != null ? `${s.discountPct}%` : "—"} big accent />
        <F label={<><Building2 size={11} /> Closed by</>} value={<>{v(s.closer)}<span className="sub-v">sent by {v(s.user?.name || s.sentBy)}</span></>} />
        <F label={<><Clock size={11} /> Date & time</>} value={preview ? pkTime(new Date()) : pkTime(s.createdAt)} />
      </div>

      {sibs.length > 0 && (
        <div className="sibs">
          <span className="sf-l">This customer's other sales</span>
          <div className="row" style={{ gap: 6 }}>
            {sibs.map((x) => <span key={x.id} className={"sib " + cls[x.status]}><i />#{x.orderNumber || "—"} · {x.device || "device"} · {STATUS.find(([k]) => k === x.status)?.[1]}</span>)}
          </div>
        </div>
      )}
      {flags.length > 0 && <div className="sale-flags">{flags.map((f) => <span key={f}><AlertTriangle size={12} /> {f}</span>)}</div>}

      {open && (
        <div className="sale-details">
          <section className="sale-sec"><h4><User size={13} /> Customer</h4><div className="sf-grid">
            <F label="Name" value={v(s.customer)} /><F label="Contact" value={v(s.phone)} /><F label={<><Mail size={11} /> Email</>} value={v(s.email)} />
            <F label={<><MapPin size={11} /> Address</>} value={v(s.address)} /><F label="Zip code" value={v(s.zip)} />
          </div></section>
          <section className="sale-sec"><h4><Receipt size={13} /> Bill</h4><div className="sf-grid">
            <F label="Paying now" value={$(s.billBefore)} /><F label="Discount" value={s.discountPct != null && s.discountPct !== "" ? s.discountPct + "%" : "—"} accent /><F label="After discount" value={$(s.billAfter)} accent />
            <F label="Saves / month" value={$(save)} /><F label="Next bill" value={s.nextBillDate ? new Date(s.nextBillDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—"} />
            <F label="Lines" value={v(s.lines)} /><F label="Overcharged" value={$(s.overcharged)} />
          </div></section>
          <section className="sale-sec"><h4><Smartphone size={13} /> Device</h4><div className="sf-grid">
            <F label="Device" value={v(s.device)} /><F label="Color" value={v(s.deviceColor)} /><F label="Storage" value={v(s.storage)} />
            <F label="Specifications" value={v(s.specs)} /><F label={<><Gift size={11} /> Gift</>} value={v(s.gift)} />
          </div></section>
          <section className="sale-sec"><h4><Building2 size={13} /> Team</h4><div className="sf-grid">
            <F label="Office" value={v(s.office)} /><F label="Location code" value={v(s.locationCode)} /><F label="Sent by" value={v(s.user?.name || s.sentBy)} /><F label="Closed by" value={v(s.closer)} />
          </div></section>
          {s.notes ? <section className="sale-sec"><h4><StickyNote size={13} /> Notes</h4><div className="sf-v" style={{ fontWeight: 600, whiteSpace: "pre-wrap" }}>{s.notes}</div></section> : null}
        </div>
      )}

      <footer className="sale-foot">
        <button className="ghost sm more" onClick={() => setOpen(!open)} aria-expanded={open}><ChevronDown size={14} style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }} /> {open ? "Hide details" : "All details"}{!open && s.notes ? " · has notes" : ""}</button>
        {!preview && <span className="muted small">{s.receipt}</span>}
        {!preview && (
          <div className="row" style={{ marginLeft: "auto", gap: 6 }}>
            {onStatus && !preview && s.id && s.orderNumber && <OrderCheck s={s} onSaved={(d) => d && setLive(d)} />}
            {onStatus && !preview && s.id && <AiButton task="check_sale" payload={{ id: s.id }} label="AI check" />}
            {onEmail && s.email && <button className="ghost sm" onClick={() => onEmail(s)}><Send size={13} /> Email</button>}
            <button className="ghost sm icon-btn" title="Copy sale" aria-label="Copy sale" onClick={() => navigator.clipboard?.writeText(s.raw || "")}><Copy size={14} /></button>
            {onDelete && <button className="ghost sm icon-btn del" title="Delete sale" aria-label="Delete sale" onClick={() => onDelete(s)}><Trash2 size={14} /></button>}
          </div>
        )}
      </footer>
    </article>
  );
}
