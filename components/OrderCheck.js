"use client";
// "Check order" on a sale: copies the order details for the Modo Fill bookmark, opens the carrier's
// order-status page (Verizon by default), and shows the last status saved back from it.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PackageSearch, ExternalLink, Copy, Check, X, Bookmark, RefreshCw, ClipboardPaste, Camera, Smartphone } from "lucide-react";
import { BOOKMARKLET, CARRIER_ORDER_PAGES, ORDER_STATUSES, encodeFill, detectStatus } from "@/lib/orderFill";

const CARRIERS = [["verizon", "Verizon"], ["att", "AT&T"], ["tmobile", "T-Mobile"]];
const guessCarrier = (s) => { const t = `${s.campaignName || ""} ${s.device || ""} ${s.notes || ""}`.toLowerCase(); return /at&t|\batt\b/.test(t) ? "att" : /t-?mobile/.test(t) ? "tmobile" : "verizon"; };

export function OrderStatusChip({ s }) {
  if (!s?.trackStage || !/^(Verizon|AT&T|T-Mobile):/.test(s.trackStage)) return null;
  return <span className={"ord-chip " + (s.trackStatus || "pending")} title={s.trackStage + (s.trackUpdatedAt ? " · " + new Date(s.trackUpdatedAt).toLocaleString() : "")}><PackageSearch size={11} /> {s.trackStage.replace(/^[^:]+:\s*/, "").split(" — ")[0]}</span>;
}

export default function OrderCheck({ s, onSaved }) {
  const [open, setOpen] = useState(false);
  const [carrier, setCarrier] = useState("verizon");
  const [copied, setCopied] = useState(""); const [manual, setManual] = useState({ status: "", note: "" }); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");
  const bm = useRef(null); const shot = useRef(null);
  const [phone, setPhone] = useState(false); const [pasted, setPasted] = useState(""); const [reading, setReading] = useState(false);
  // Phones can't use bookmarklets easily, so they get the copy → paste/screenshot flow instead.
  useEffect(() => { try { setPhone(window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 760); } catch {} }, []);
  useEffect(() => { if (open) setCarrier(guessCarrier(s)); }, [open]); // eslint-disable-line
  // React blocks javascript: hrefs, so the bookmark link's href is set directly on the element.
  useEffect(() => { if (open && bm.current) bm.current.setAttribute("href", BOOKMARKLET); }, [open]);
  const copy = async (text, k) => { try { await navigator.clipboard.writeText(text); setCopied(k); setTimeout(() => setCopied(""), 1400); return true; } catch { return false; } };

  async function go() {
    setMsg("");
    if (phone) {
      const ok = await copy(String(s.orderNumber || ""), "Order #");
      window.open(CARRIER_ORDER_PAGES[carrier], "_blank");
      setMsg((ok ? "Order number copied — paste it on the carrier page" : "Type the order number on the carrier page") + (s.zip ? ` and enter ZIP ${String(s.zip).slice(0, 5)}` : "") + ". Then copy the result (or take a screenshot) and come back here.");
      return;
    }
    const code = encodeFill(s, location.origin, carrier);
    const ok = await copy(code, "code");
    window.open(CARRIER_ORDER_PAGES[carrier], "_blank");
    setMsg(ok ? "Order details copied. On the carrier page, click your “Modo Fill” bookmark." : "Couldn't copy automatically — use the copy buttons below.");
  }
  const applyPasted = (text) => {
    setPasted(text);
    const r = detectStatus(text, s.orderNumber);
    if (r) { setManual({ status: r.status, note: r.note.slice(0, 200) }); setMsg(`Found “${r.status}” — check it and press Save.`); }
    else if (text.trim().length > 20) setMsg("No status found in that text. Pick it yourself below, or try a screenshot.");
  };
  async function pasteNow() {
    try { const t = await navigator.clipboard.readText(); if (t) return applyPasted(t); } catch {}
    setMsg("Long-press the box below and choose Paste.");
  }
  async function readShot(e) {
    const file = e.target.files?.[0]; e.target.value = ""; if (!file) return;
    setReading(true); setMsg("Reading the screenshot…");
    const fd = new FormData(); fd.set("image", file);
    const r = await fetch("/api/sales/order-status/read", { method: "POST", body: fd }); const d = await r.json().catch(() => ({})); setReading(false);
    if (!r.ok) return setMsg(d.error || "Couldn't read the screenshot.");
    if (d.orderNumber && s.orderNumber && !String(d.orderNumber).replace(/\W/g, "").toLowerCase().includes(String(s.orderNumber).replace(/\W/g, "").toLowerCase()))
      setMsg(`Careful: the screenshot shows order ${d.orderNumber}, not ${s.orderNumber}.`);
    else setMsg(`Read “${d.status}” from the screenshot — check it and press Save.`);
    setManual({ status: d.status, note: d.detail || "" });
  }
  async function saveManual() {
    if (!manual.status) return;
    setBusy(true);
    const r = await fetch("/api/sales/order-status", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: s.id, status: manual.status, note: manual.note, carrier }) });
    const d = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) return setMsg(d.error || "Couldn't save.");
    setMsg("Saved."); onSaved?.(d.sale);
  }
  const missing = !s.orderNumber;

  const modal = open && (
    <div className="oc-bg" onClick={() => setOpen(false)}>
      <div className="oc panel" role="dialog" aria-label="Check order" onClick={(e) => e.stopPropagation()}>
        <header className="row" style={{ justifyContent: "space-between" }}>
          <h2 className="row" style={{ gap: 8 }}><PackageSearch size={18} /> Check order #{s.orderNumber || "—"}</h2>
          <button className="ghost icon-btn" aria-label="Close" onClick={() => setOpen(false)}><X size={16} /></button>
        </header>
        {s.trackStage && <div className="receipt small">Last status: <b>{s.trackStage}</b>{s.trackUpdatedAt ? ` · ${new Date(s.trackUpdatedAt).toLocaleString()}` : ""}</div>}

        <div className="oc-row">
          <nav className="seg" role="tablist">{CARRIERS.map(([k, l]) => <button key={k} role="tab" aria-selected={carrier === k} onClick={() => setCarrier(k)}>{l}</button>)}</nav>
          <button onClick={go} disabled={missing}><ExternalLink size={15} /> Open {CARRIERS.find(([k]) => k === carrier)[1]} & copy {phone ? "order #" : "details"}</button>
        </div>
        {missing && <p className="err small" style={{ margin: 0 }}>This sale has no order number.</p>}
        {msg && <p className="small" style={{ margin: 0 }}>{msg}</p>}

        <div className="oc-fields">
          {[["Order #", s.orderNumber], ["ZIP", String(s.zip || "").slice(0, 5)], ["Email", s.email], ["Last name", String(s.customer || "").trim().split(/\s+/).slice(-1)[0]], ["Phone", s.phone]].filter(([, v]) => v).map(([l, v]) => (
            <button key={l} className="oc-f" onClick={() => copy(String(v), l)} title={"Copy " + l}><span>{l}</span><b>{v}</b>{copied === l ? <Check size={13} /> : <Copy size={13} />}</button>
          ))}
        </div>

        {phone ? (
          <div className="oc-phone small"><Smartphone size={15} /> <span>On a phone: <b>1</b> open the carrier page above, <b>2</b> paste the order number{ s.zip ? <> and ZIP <b>{String(s.zip).slice(0, 5)}</b></> : null} and search, <b>3</b> copy the result or take a screenshot, <b>4</b> come back and use “Bring the result back” below.</span></div>
        ) : (
        <details className="oc-help">
          <summary><Bookmark size={14} /> First time? Add the “Modo Fill” bookmark (one time, 10 seconds)</summary>
          <ol className="small">
            <li>Show your bookmarks bar: <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd>.</li>
            <li>Drag this button onto the bookmarks bar: <a ref={bm} className="oc-bm" onClick={(e) => { e.preventDefault(); setMsg("Drag it to the bookmarks bar — don't click it here."); }}>⚡ Modo Fill</a></li>
            <li>Press <b>Open … & copy details</b> above, then click <b>Modo Fill</b> on the carrier page. It fills the order number and ZIP, searches, reads the status and offers <b>Save to Modo</b>.</li>
            <li>The first time, Chrome asks to let the page read your clipboard — press <b>Allow</b>.</li>
          </ol>
          <p className="muted small" style={{ margin: 0 }}>If the carrier asks you to sign in or solve a check, do that first, then press <b>Fill again</b> in the Modo box. On a phone, use “Bring the result back” below instead.</p>
        </details>
        )}

        <div className="oc-back">
          <b className="small">Bring the result back</b>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button className="ghost sm" onClick={pasteNow}><ClipboardPaste size={14} /> Paste copied result</button>
            <button className="ghost sm" onClick={() => shot.current?.click()} disabled={reading}><Camera size={14} /> {reading ? "Reading…" : "Read a screenshot"}</button>
            <input ref={shot} type="file" accept="image/*" hidden onChange={readShot} />
          </div>
          <textarea rows={phone ? 3 : 2} value={pasted} onChange={(e) => applyPasted(e.target.value)} placeholder="…or paste the carrier's order page text here. Modo finds the status by itself." />
        </div>

        <div className="oc-manual">
          <b className="small">Status to save</b>
          <div className="row" style={{ gap: 8 }}>
            <select value={manual.status} onChange={(e) => setManual({ ...manual, status: e.target.value })} style={{ flex: "0 0 170px" }}>
              <option value="">Pick status…</option>{ORDER_STATUSES.map((x) => <option key={x}>{x}</option>)}
            </select>
            <input value={manual.note} onChange={(e) => setManual({ ...manual, note: e.target.value })} placeholder="Details (ship date, tracking #)" style={{ flex: 1 }} />
            <button className="ghost" disabled={!manual.status || busy} onClick={saveManual}>{busy ? <RefreshCw size={14} /> : "Save"}</button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button className="ghost sm" onClick={() => setOpen(true)} title="Check this order on Verizon / AT&T / T-Mobile"><PackageSearch size={13} /> Check order</button>
      {typeof document !== "undefined" && modal ? createPortal(modal, document.body) : null}
    </>
  );
}
