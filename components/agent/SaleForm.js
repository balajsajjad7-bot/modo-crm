"use client";
// Structured sale form. Sent straight to admin, then cleared. A live preview shows exactly how admin will see it.
import { useEffect, useState } from "react";
import SaleCard from "@/components/SaleCard";
import { useShell } from "@/components/Shell";
import { Send, Wand2, Eraser } from "lucide-react";

const EMPTY = { saleType: "new", campaignId: "", customer: "", phone: "", email: "", address: "", zip: "", orderNumber: "", billBefore: "", discountPct: "", billAfter: "", nextBillDate: "", lines: "", overcharged: "", device: "", deviceColor: "", storage: "", specs: "", gift: "", office: "Islamabad", locationCode: "", closerId: "", notes: "" };
const GIFT_OPTS = ["Cover", "Screen protector", "Charger", "Earbuds", "Smartwatch", "Gift card", "Free line", "Accessory bundle", "Tablet"];
const STORAGE_OPTS = ["128 GB", "256 GB", "512 GB", "1 TB"];
const OFFICES = ["Islamabad", "Karachi", "Lahore", "Rawalpindi", "Other"];

export default function SaleForm({ onDone }) {
  const { me } = useShell();
  const [f, setF] = useState(EMPTY); const [people, setPeople] = useState([]); const [auto, setAuto] = useState(true); const [camps, setCamps] = useState([]);
  useEffect(() => { fetch("/api/org").then((r) => r.json()).then((d) => setCamps((d.campaigns || []).filter((c) => c.active))).catch(() => {}); }, []);
  useEffect(() => { if (me?.campaignId) setF((o) => (o.campaignId ? o : { ...o, campaignId: me.campaignId })); }, [me]);
  const [paste, setPaste] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [receipt, setReceipt] = useState("");
  useEffect(() => {
    fetch("/api/chat/people").then((r) => r.json()).then((p) => setPeople(Array.isArray(p) ? p : []));
    try { const raw = sessionStorage.getItem("modo-sale-prefill") || localStorage.getItem("modo-sale-prefill"); if (raw) { sessionStorage.removeItem("modo-sale-prefill"); localStorage.removeItem("modo-sale-prefill"); const x = JSON.parse(raw); setF((o) => ({ ...o, ...Object.fromEntries(Object.entries(x).filter(([, v]) => v != null && v !== "")) })); } } catch {}
    try { const d = JSON.parse(localStorage.getItem("modo-sale-draft") || "null"); if (d) setF((o) => ({ ...o, ...d })); } catch {}
  }, []);
  useEffect(() => { try { localStorage.setItem("modo-sale-draft", JSON.stringify({ ...f, notes: f.notes })); } catch {} }, [f]);
  const set = (k) => (e) => {
    const val = e.target.value; const n = { ...f, [k]: val };
    if (auto && (k === "billBefore" || k === "discountPct") && n.billBefore !== "" && n.discountPct !== "") n.billAfter = (Number(n.billBefore) * (1 - Math.min(100, Number(n.discountPct)) / 100)).toFixed(2);
    if (k === "billAfter") setAuto(false);
    setF(n);
  };
  async function aiFill() {
    setErr(""); setBusy(true);
    const r = await fetch("/api/sales/parse", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: paste }) });
    const d = await r.json(); setBusy(false);
    if (!r.ok) return setErr(d.error);
    setF((o) => ({ ...o, ...Object.fromEntries(Object.entries(d).filter(([, v]) => v != null && v !== "").map(([k, v]) => [k, String(v)])) })); setPaste("");
  }
  async function submit(e) {
    e.preventDefault(); setErr(""); setReceipt(""); setBusy(true);
    const r = await fetch("/api/sales", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) });
    const d = await r.json(); setBusy(false);
    if (!r.ok) return setErr(d.error);
    setReceipt(d.receipt); setF({ ...EMPTY, office: f.office, locationCode: f.locationCode }); setAuto(true);
    try { localStorage.removeItem("modo-sale-draft"); } catch {}
    onDone?.();
  }
  const closerName = people.find((p) => p.id === f.closerId)?.name || me?.name;
  const I = (k, label, props = {}) => <label>{label}<input value={f[k]} onChange={set(k)} {...props} /></label>;
  // Quick-pick buttons that fill a field. multi = toggle several (comma-joined); single = pick one.
  const inList = (k, v) => (f[k] || "").split(",").map((s) => s.trim()).includes(v);
  const toggleWord = (k, v) => { const cur = (f[k] || "").split(",").map((s) => s.trim()).filter(Boolean); const i = cur.indexOf(v); i >= 0 ? cur.splice(i, 1) : cur.push(v); setF({ ...f, [k]: cur.join(", ") }); };
  const chips = (k, opts, multi) => <div className="chip-pick" role="group">{opts.map((o) => <button key={o} type="button" className={"chip-btn" + ((multi ? inList(k, o) : f[k] === o) ? " on" : "")} onClick={() => (multi ? toggleWord(k, o) : setF({ ...f, [k]: f[k] === o ? "" : o }))}>{o}</button>)}</div>;

  return (
    <div className="sale-form-wrap sales-page">
      <form className="panel stack sale-form" onSubmit={submit}>
        <details className="ai-fill">
          <summary><Wand2 size={14} /> Paste notes and auto-fill with AI</summary>
          <textarea style={{ minHeight: 80, marginTop: 8 }} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste anything: call notes, a chat, the order email…" />
          <div><button type="button" className="ghost sm" onClick={aiFill} disabled={busy || !paste.trim()}><Wand2 size={13} /> Fill the form</button></div>
        </details>

        <div className="type-pick" role="radiogroup" aria-label="Sale type">
          <button type="button" role="radio" aria-checked={f.saleType !== "addon"} className={f.saleType !== "addon" ? "on" : ""} onClick={() => setF({ ...f, saleType: "new" })}><b>New customer</b><span>First sale for this person</span></button>
          <button type="button" role="radio" aria-checked={f.saleType === "addon"} className={f.saleType === "addon" ? "on" : ""} onClick={() => setF({ ...f, saleType: "addon" })}><b>Another device</b><span>Existing customer wants one more</span></button>
        </div>
        {f.saleType === "addon" && <p className="muted small" style={{ margin: 0 }}>Use the same contact number as their first sale. Admin will see both sales linked together.</p>}

        <fieldset><legend>Customer</legend><div className="form">
          {I("customer", "Customer name *", { required: true })}{I("phone", "Contact number *", { required: true, inputMode: "tel" })}
          {I("email", "Email", { type: "email" })}{I("address", "Address")}{I("zip", "Zip code", { inputMode: "numeric" })}
        </div></fieldset>

        <fieldset><legend>Bill</legend><div className="form">
          {I("billBefore", "Paying now ($)", { type: "number", step: "0.01", min: 0 })}
          {I("discountPct", "Discount (%)", { type: "number", step: "0.1", min: 0, max: 100 })}
          {I("billAfter", "After discount ($)", { type: "number", step: "0.01", min: 0 })}
          {I("nextBillDate", "Next bill date", { type: "date" })}
          {I("lines", "Lines in use", { type: "number", min: 0 })}
          {I("overcharged", "Overcharged ($)", { type: "number", step: "0.01", min: 0 })}
        </div></fieldset>

        <fieldset><legend>Device</legend><div className="form">
          {I("device", "Device", { placeholder: "e.g. iPhone 16 Pro" })}{I("deviceColor", "Color", { placeholder: "e.g. Desert Titanium" })}
          <label>Storage{chips("storage", STORAGE_OPTS, false)}<input value={f.storage} onChange={set("storage")} placeholder="or type another size" /></label>
          {I("specs", "Specifications", { placeholder: "e.g. 5G, eSIM, 6.3\"" })}
          <label style={{ gridColumn: "1/-1" }}>Gift <span className="muted small">tap all that apply</span>{chips("gift", GIFT_OPTS, true)}<input value={f.gift} onChange={set("gift")} placeholder="or type a custom gift" /></label>
        </div></fieldset>

        <fieldset><legend>Order</legend><div className="form">
          {I("orderNumber", "Order number *", { required: true, className: "order-input" })}
          <label>Campaign<select value={f.campaignId} onChange={set("campaignId")}><option value="">—</option>{camps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label>Office<select value={f.office} onChange={set("office")}>{OFFICES.map((o) => <option key={o}>{o}</option>)}</select></label>
          {I("locationCode", "Location code", { placeholder: "e.g. ISB-02" })}
          <label>Closed by<select value={f.closerId} onChange={set("closerId")}><option value="">Me ({me?.name})</option>{people.filter((p) => p.role !== "ADMIN").map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        </div></fieldset>

        <fieldset><legend>Notes</legend>
          <label>Anything admin should know<textarea style={{ minHeight: 90 }} value={f.notes} onChange={set("notes")} placeholder="e.g. Customer wants delivery after 5 pm, asked about adding a 4th line next month…" /></label>
        </fieldset>
        {err && <div className="err">{err}</div>}
        {receipt && <div className="receipt">Sale sent to admin. Receipt {receipt}. The form has been cleared.</div>}
        <div className="row">
          <button disabled={busy}><Send size={15} /> {busy ? "Sending…" : "Send sale to admin"}</button>
          <button type="button" className="ghost" onClick={() => { if (confirm("Clear the form?")) { setF({ ...EMPTY, office: f.office }); setAuto(true); } }}><Eraser size={15} /> Clear</button>
        </div>
      </form>
      <div className="sale-preview">
        <span className="sf-l" style={{ marginBottom: 8, display: "block" }}>Live preview · this is what admin sees</span>
        <SaleCard preview defaultOpen s={{ ...f, campaignName: camps.find((c) => c.id === f.campaignId)?.name, status: "NEW", sentBy: me?.name, closer: closerName, lines: f.lines || null, discountPct: f.discountPct === "" ? null : f.discountPct,
          billBefore: f.billBefore === "" ? null : +f.billBefore, billAfter: f.billAfter === "" ? null : +f.billAfter, overcharged: f.overcharged === "" ? null : +f.overcharged, nextBillDate: f.nextBillDate || null }} />
      </div>
    </div>
  );
}
