"use client";
// Budget Ease agents: submit a utility-bill discount signup. Separate from telecom sales.
import { useEffect, useState } from "react";
import BeCard, { money } from "./BeCard";
import BrandLogo from "@/components/BrandLogo";
import { Sparkles, Send, Eye, EyeOff, Lock, CheckCircle2, Upload, ClipboardCheck, PiggyBank } from "lucide-react";

const EMPTY = { customer: "", phone: "", email: "", dob: "", ssn4: "", zip: "", serviceAddress: "", company: "", service: "electricity", accountNumber: "", billAmount: "", payAmount: "", notes: "" };
const COMPANIES = ["Duke Energy", "Florida Power & Light (FPL)", "Georgia Power", "Pacific Gas & Electric (PG&E)", "Southern California Edison (SCE)", "Con Edison", "ComEd", "Dominion Energy", "Xcel Energy", "Entergy", "AEP", "PSE&G", "National Grid", "Eversource", "Consumers Energy", "DTE Energy", "Ameren", "CenterPoint Energy", "Oncor", "TXU Energy", "Reliant", "SoCalGas", "Atmos Energy", "Spire", "Comcast Xfinity", "Spectrum", "AT&T", "Verizon", "Cox", "T-Mobile", "Frontier", "Optimum", "American Water"];
const post = (u, b) => fetch(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });

export default function BeForm() {
  const [f, setF] = useState(EMPTY); const [err, setErr] = useState(""); const [done, setDone] = useState(null); const [busy, setBusy] = useState(false);
  const [showSsn, setShowSsn] = useState(false); const [notes, setNotes] = useState(""); const [ai, setAi] = useState(""); const [zipInfo, setZipInfo] = useState(""); const [mine, setMine] = useState([]);
  const [scan, setScan] = useState(""); const [scanning, setScanning] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const loadMine = () => fetch("/api/budgetease").then((r) => r.json()).then((d) => Array.isArray(d) && setMine(d)).catch(() => {});
  useEffect(() => { loadMine(); try { const p = JSON.parse(sessionStorage.getItem("modo-be-prefill") || localStorage.getItem("modo-be-prefill") || "null"); if (p) { sessionStorage.removeItem("modo-be-prefill"); localStorage.removeItem("modo-be-prefill"); setF((f0) => { const n = { ...f0 }; for (const [k, v] of Object.entries(p)) if (v) n[k] = String(v).replace(/^\$/, ""); return n; }); } } catch {} }, []);
  useEffect(() => {
    const z = f.zip.replace(/\D/g, ""); if (z.length !== 5) { setZipInfo(""); return; }
    fetch("/api/lookup?type=zip&q=" + z).then((r) => r.json()).then((d) => setZipInfo(d.title ? d.title.replace(/ \d{5}$/, "") + (d.rows?.find((x) => x[0] === "Local time now") ? " · " + d.rows.find((x) => x[0] === "Local time now")[1] : "") : "ZIP not found")).catch(() => {});
  }, [f.zip]);
  const bill = Number(f.billAmount), pay = Number(f.payAmount);
  const pct = bill > 0 && pay > 0 ? Math.round(((bill - pay) / bill) * 1000) / 10 : null;
  async function autofill() {
    setAi("Reading your notes…");
    const r = await post("/api/budgetease/parse", { text: notes }); const d = await r.json().catch(() => ({}));
    if (!r.ok) return setAi(d.error || "AI couldn't read that.");
    const next = { ...f }; for (const k of Object.keys(EMPTY)) if (d[k] != null && d[k] !== "" && !["ssn4", "dob"].includes(k)) next[k] = String(d[k]);
    setF(next); setAi("Filled in what I found. Check everything, then add the SSN last 4 and date of birth yourself.");
  }
  async function scanBill(file) {
    if (!file) return;
    setAi(""); setScanning(true); setScan("Reading the bill…");
    try {
      let mime = file.type || "";
      if (!mime) { const n = file.name.toLowerCase(); mime = n.endsWith(".pdf") ? "application/pdf" : n.endsWith(".png") ? "image/png" : /\.jpe?g$/.test(n) ? "image/jpeg" : ""; }
      const dataUrl = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
      const base64 = String(dataUrl).split(",")[1] || "";
      const r = await post("/api/budgetease/scan", { name: file.name, mime, data: base64 });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setScan(d.error || "Couldn't read the bill."); return; }
      const next = { ...f };
      for (const k of Object.keys(EMPTY)) if (d[k] != null && d[k] !== "" && !["ssn4", "dob", "payAmount"].includes(k)) next[k] = String(d[k]).replace(/^\$/, "");
      setF(next);
      setScan("Filled in what the bill shows. Now add SSN last 4, date of birth, and what the customer wants to pay.");
    } catch { setScan("Couldn't read that file. Try a clearer scan or type the details."); }
    finally { setScanning(false); }
  }
  async function submit(e) {
    e.preventDefault(); setErr(""); setBusy(true);
    const r = await post("/api/budgetease", f); const d = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) return setErr(d.error || "Couldn't submit.");
    setDone(d); setF(EMPTY); setNotes(""); setAi(""); loadMine(); window.scrollTo({ top: 0, behavior: "smooth" });
  }
  return (
    <div className="stack">
      {done && (
        <section className="panel be-done">
          <CheckCircle2 size={28} />
          <div><h2><ClipboardCheck size={17} /> Submitted · {done.consumerId}</h2><p className="muted small" style={{ margin: 0 }}>Give the customer this Consumer ID. {done.discountPct}% off requested.{done.flags?.length ? " Admin will check: " + done.flags.join("; ") : ""}</p></div>
          <button className="ghost sm" onClick={() => setDone(null)}>New signup</button>
        </section>
      )}
      <div className="sale-layout">
        <form className="panel sale-form stack" onSubmit={submit}>
          <details className="ai-fill" open={!f.customer}>
            <summary><Sparkles size={14} /> Upload the bill or paste call notes — AI fills the form</summary>
            <label className="bill-drop" style={{ cursor: scanning ? "wait" : "pointer" }}>
              <Upload size={16} /> <b>{scanning ? "Reading the bill…" : "Upload the customer's bill (PDF or photo)"}</b>
              <span className="small muted">We read it and fill the form for you</span>
              <input type="file" accept="application/pdf,image/*" capture="environment" hidden disabled={scanning} onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; scanBill(file); }} />
            </label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="…or paste call notes: Maria Lopez 512 555 0142, Duke Energy electric, bill 186 wants 125, 4410 Ridgeview Dr Austin TX 78731…" style={{ minHeight: 70 }} />
            <div className="row"><button type="button" className="ghost sm" onClick={autofill} disabled={!notes.trim()}><Sparkles size={13} /> Fill from notes</button><span className="small muted">{scan || ai || "SSN and date of birth are never read or stored from a bill."}</span></div>
          </details>
          <fieldset><legend>Customer</legend><div className="form">
            <label>Full name *<input value={f.customer} onChange={set("customer")} required autoComplete="off" /></label>
            <label>Phone *<input value={f.phone} onChange={set("phone")} inputMode="tel" placeholder="(512) 555-0142" required /></label>
            <label>Email<input type="email" value={f.email} onChange={set("email")} /></label>
            <label>Date of birth *<input type="date" value={f.dob} onChange={set("dob")} required max={new Date().toISOString().slice(0, 10)} /></label>
            <label>SSN last 4 *<span className="ssn-wrap"><input type={showSsn ? "text" : "password"} value={f.ssn4} onChange={(e) => setF({ ...f, ssn4: e.target.value.replace(/\D/g, "").slice(0, 4) })} inputMode="numeric" autoComplete="off" maxLength={4} placeholder="••••" required />
              <button type="button" className="ghost sm icon-btn" onClick={() => setShowSsn(!showSsn)} aria-label={showSsn ? "Hide" : "Show"}>{showSsn ? <EyeOff size={13} /> : <Eye size={13} />}</button></span></label>
          </div><p className="small muted" style={{ margin: "6px 0 0" }}><Lock size={11} /> SSN last 4 and date of birth are encrypted. After you submit, only admin can see them.</p></fieldset>
          <fieldset><legend>Service</legend><div className="form">
            <label>Utility company * {f.company && <BrandLogo name={f.company} size={16} />}<input value={f.company} onChange={set("company")} list="be-companies" required /><datalist id="be-companies">{COMPANIES.map((c) => <option key={c} value={c} />)}</datalist></label>
            <label>Service<select value={f.service} onChange={set("service")}>{["electricity", "gas", "internet", "water", "phone", "cable/TV", "other"].map((x) => <option key={x}>{x}</option>)}</select></label>
            <label style={{ gridColumn: "1/-1" }}>Service address *<input value={f.serviceAddress} onChange={set("serviceAddress")} placeholder="Street, city, state" required /></label>
            <label>ZIP code *<input value={f.zip} onChange={(e) => setF({ ...f, zip: e.target.value.replace(/\D/g, "").slice(0, 5) })} inputMode="numeric" required />{zipInfo && <span className="small muted">{zipInfo}</span>}</label>
            <label>Account number<input value={f.accountNumber} onChange={set("accountNumber")} placeholder="Customer's utility account no." autoComplete="off" /></label>
          </div></fieldset>
          <fieldset><legend>Bill</legend><div className="form">
            <label>Current monthly bill ($) *<input type="number" min="1" step="0.01" value={f.billAmount} onChange={set("billAmount")} required /></label>
            <label>Customer wants to pay ($) *<input type="number" min="1" step="0.01" value={f.payAmount} onChange={set("payAmount")} required /></label>
          </div>
            {pct != null && <div className={"be-calc" + (pct > 35 || pct <= 0 ? " warn" : "")}><b>{pct}% off</b><span>saves {money(bill - pay)} a month · {money((bill - pay) * 12)} a year</span>{pct > 35 && <span>Over the 35% maximum: admin will review</span>}{pct <= 0 && <span>Must be lower than the current bill</span>}</div>}
          </fieldset>
          <fieldset><legend>Notes</legend><textarea value={f.notes} onChange={set("notes")} placeholder="Anything admin should know" /></fieldset>
          {err && <div className="err">{err}</div>}
          <button disabled={busy}><Send size={15} /> {busy ? "Submitting…" : "Submit Budget Ease signup"}</button>
        </form>
        <aside className="sale-preview"><span className="sf-l">Preview</span><BeCard preview r={{ ...f, billAmount: bill || null, payAmount: pay || null, discountPct: pct, flags: pct > 35 ? [`Asks for ${pct}% off (max is 35%)`] : [] }} /></aside>
      </div>
      {mine.length > 0 && (
        <section className="stack">
          <h2 className="sec-h"><PiggyBank size={17} /> My Budget Ease signups <span className="muted small">{mine.length}</span></h2>
          <div className="be-list">{mine.slice(0, 30).map((r) => <BeCard key={r.id} r={r} />)}</div>
        </section>
      )}
    </div>
  );
}
