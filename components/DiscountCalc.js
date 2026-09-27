"use client";
// Utility-bill discount calculator. Admin sets the maximum discount per service; agents quote within it.
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Copy, ClipboardPaste, Save } from "lucide-react";

const money = (cur, n) => cur + Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function DiscountCalc({ role }) {
  const router = useRouter();
  const [cfg, setCfg] = useState(null);
  const [rows, setRows] = useState([{ service: "", bill: "", pct: 0 }]);
  const [months, setMonths] = useState(12); const [fee, setFee] = useState(0); const [customer, setCustomer] = useState("");
  const [copied, setCopied] = useState(false);
  const [editRates, setEditRates] = useState(null); const [msg, setMsg] = useState("");

  const load = () => fetch("/api/settings").then((r) => r.json()).then((d) => {
    const saved = typeof d.discountRates === "string" ? JSON.parse(d.discountRates || "{}") : d.discountRates || {};
    const rates = { Internet: 20, Wireless: 20, ...saved }; // Internet and Wireless are always offered (admin can change the %)
    setCfg({ currency: d.currency || "$", rates });
    setRows((rs) => rs.map((r) => r.service ? r : { ...r, service: Object.keys(rates)[0] || "", pct: Object.values(rates)[0] || 0 }));
  });
  useEffect(() => { load(); }, []);

  const cur = cfg?.currency || "$";
  const calc = useMemo(() => {
    const lines = rows.map((r) => {
      const wireless = /wireless|mobile|cell/i.test(r.service || "");
      const max = 100, def = cfg?.rates[r.service] ?? 0, pct = Math.min(Math.max(Number(r.pct) || 0, 0), 100);
      const bill = wireless && Number(r.perLine) > 0 ? Number(r.perLine) * Math.max(1, Number(r.lines) || 1) : Number(r.bill) || 0;
      const save = bill * pct / 100;
      return { ...r, max, def, pct, bill, save, after: bill - save };
    });
    const before = lines.reduce((t, l) => t + l.bill, 0), monthly = lines.reduce((t, l) => t + l.save, 0);
    const total = monthly * months - (Number(fee) || 0);
    return { lines, before, after: before - monthly, monthly, yearly: monthly * 12, total, pctAll: before ? (monthly / before) * 100 : 0 };
  }, [rows, months, fee, cfg]);

  const set = (i, k, v) => setRows((rs) => rs.map((r, j) => {
    if (j !== i) return r;
    const n = { ...r, [k]: v };
    if (k === "service") n.pct = cfg.rates[v] ?? 0;
    return n;
  }));
  const summary = () => [
    `Discount quote${customer ? " for " + customer : ""}`,
    ...calc.lines.filter((l) => l.bill).map((l) => `${l.service}${Number(l.perLine) > 0 ? ` (${Math.max(1, Number(l.lines) || 1)} lines × ${money(cur, l.perLine)})` : ""}: ${money(cur, l.bill)}/mo → ${money(cur, l.after)}/mo (${l.pct}% off, save ${money(cur, l.save)}/mo)`),
    `Total: ${money(cur, calc.before)}/mo → ${money(cur, calc.after)}/mo`,
    `Saves ${money(cur, calc.monthly)}/month, ${money(cur, calc.yearly)}/year`,
    `Contract: ${months} months${Number(fee) ? `, one-time fee ${money(cur, fee)}` : ""}. Net saving over contract: ${money(cur, calc.total)}`,
  ].join("\n");
  const copy = () => { navigator.clipboard?.writeText(summary()); setCopied(true); setTimeout(() => setCopied(false), 1500); };
  const useInSale = () => {
    try { sessionStorage.setItem("modo-sale-prefill", JSON.stringify({ customer: customer || undefined, billBefore: calc.before.toFixed(2), discountPct: +calc.pctAll.toFixed(1), billAfter: calc.after.toFixed(2), notes: summary() })); } catch {}
    router.push("/agent/sale");
  };

  async function saveRates() {
    setMsg("");
    const r = await fetch("/api/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ currency: editRates.currency, discountRates: Object.fromEntries(editRates.list.filter((x) => x.name.trim()).map((x) => [x.name.trim(), x.pct])) }) });
    const d = await r.json(); if (!r.ok) return setMsg(d.error);
    setEditRates(null); setMsg("Discount rates saved. Agents see them right away."); load();
  }

  if (!cfg) return <p className="muted">Loading calculator…</p>;
  return (
    <div className="stack">
      <div className="calc-grid">
        <section className="panel stack">
          <div className="row" style={{ justifyContent: "space-between" }}><h2>Customer's bills</h2>
            <label style={{ maxWidth: 220 }}>Customer (optional)<input value={customer} onChange={(e) => setCustomer(e.target.value)} placeholder="e.g. Robert Miller" /></label></div>
          {rows.map((r, i) => (
            <div key={i} className="calc-row">
              <label>Service<select value={r.service} onChange={(e) => set(i, "service", e.target.value)}>{Object.keys(cfg.rates).map((s) => <option key={s}>{s}</option>)}</select></label>
              {/wireless|mobile|cell/i.test(r.service || "") ? (
                <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
                  <label style={{ flex: "0 0 90px" }}>Lines<input type="number" min="1" max="20" value={r.lines ?? 1} onChange={(e) => set(i, "lines", e.target.value)} /></label>
                  <label style={{ flex: 1 }}>Per line / month ({cur})<input type="number" min="0" step="0.01" inputMode="decimal" value={r.perLine ?? ""} onChange={(e) => set(i, "perLine", e.target.value)} placeholder="or leave empty" /></label>
                  {!(Number(r.perLine) > 0) && <label style={{ flex: 1 }}>Total bill ({cur})<input type="number" min="0" step="0.01" value={r.bill} onChange={(e) => set(i, "bill", e.target.value)} placeholder="0.00" /></label>}
                </div>
              ) : <label>Current bill / month ({cur})<input type="number" min="0" step="0.01" inputMode="decimal" value={r.bill} onChange={(e) => set(i, "bill", e.target.value)} placeholder="0.00" /></label>}
              <label>Discount: <b style={{ color: "var(--foreground)" }}>{calc.lines[i].pct}%</b> <span className="muted">(default {calc.lines[i].def}%, up to 100%)</span>
                <input type="range" min="0" max="100" step="1" value={calc.lines[i].pct} onChange={(e) => set(i, "pct", e.target.value)} style={{ padding: 0 }} /></label>
              <div className="calc-line"><span className="muted small">New bill</span><b>{money(cur, calc.lines[i].after)}</b><span className="small" style={{ color: "var(--green)" }}>−{money(cur, calc.lines[i].save)}</span></div>
              {rows.length > 1 && <button className="ghost icon-btn" aria-label="Remove service" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}><Trash2 size={16} /></button>}
            </div>
          ))}
          <div className="row">
            <button className="ghost" onClick={() => setRows((rs) => [...rs, { service: Object.keys(cfg.rates)[0], bill: "", pct: Object.values(cfg.rates)[0] }])}><Plus size={15} /> Add another service</button>
            <span className="small muted">Quick:</span>
            {[["Internet"], ["Wireless"], ["Internet", "Wireless"]].map((set2) => (
              <button key={set2.join("+")} className="ghost sm" onClick={() => setRows((rs) => [...rs.filter((r) => r.bill || r.perLine), ...set2.map((sv) => ({ service: sv, bill: "", pct: cfg.rates[sv] ?? 20, lines: 1 }))])}>+ {set2.join(" & ")}</button>
            ))}
          </div>
          <div className="form">
            <label>Contract length (months)<input type="number" min="1" max="60" value={months} onChange={(e) => setMonths(Math.max(1, Number(e.target.value) || 1))} /></label>
            <label>One-time fee ({cur})<input type="number" min="0" step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} /></label>
          </div>
        </section>

        <section className="panel stack calc-result" aria-live="polite">
          <h2>Quote</h2>
          <div><div className="muted small">New monthly bill</div><div className="calc-big">{money(cur, calc.after)}</div><div className="muted small">was {money(cur, calc.before)} · {calc.pctAll.toFixed(1)}% less</div></div>
          <div className="facts">
            <div><b style={{ color: "var(--green)" }}>{money(cur, calc.monthly)}</b><span>saved / month</span></div>
            <div><b>{money(cur, calc.yearly)}</b><span>saved / year</span></div>
            <div><b>{money(cur, calc.total)}</b><span>net over {months} months</span></div>
          </div>
          <pre className="raw">{summary()}</pre>
          <div className="row">
            <button className="ghost" onClick={copy}><Copy size={15} /> {copied ? "Copied" : "Copy quote"}</button>
            {role !== "ADMIN" && <button onClick={useInSale} disabled={!calc.before}><ClipboardPaste size={15} /> Use in sale</button>}
          </div>
        </section>
      </div>

      {role === "ADMIN" && (
        <section className="panel stack">
          <div className="row" style={{ justifyContent: "space-between" }}><h2>Discount rules</h2>
            {!editRates && <button className="ghost" onClick={() => setEditRates({ currency: cur, list: Object.entries(cfg.rates).map(([name, pct]) => ({ name, pct })) })}>Edit</button>}</div>
          <p className="muted small" style={{ margin: 0 }}>The starting discount for each service. Agents can slide anywhere from 0% to 100%.</p>
          {editRates ? (
            <>
              <label style={{ maxWidth: 160 }}>Currency symbol<input value={editRates.currency} onChange={(e) => setEditRates({ ...editRates, currency: e.target.value })} /></label>
              {editRates.list.map((x, i) => (
                <div key={i} className="row" style={{ flexWrap: "nowrap" }}>
                  <input value={x.name} placeholder="Service name" onChange={(e) => setEditRates({ ...editRates, list: editRates.list.map((y, j) => j === i ? { ...y, name: e.target.value } : y) })} />
                  <input type="number" min="0" max="100" value={x.pct} style={{ maxWidth: 100 }} onChange={(e) => setEditRates({ ...editRates, list: editRates.list.map((y, j) => j === i ? { ...y, pct: e.target.value } : y) })} /><span>%</span>
                  <button className="ghost icon-btn" aria-label="Remove" onClick={() => setEditRates({ ...editRates, list: editRates.list.filter((_, j) => j !== i) })}><Trash2 size={16} /></button>
                </div>
              ))}
              <div className="row"><button className="ghost" onClick={() => setEditRates({ ...editRates, list: [...editRates.list, { name: "", pct: 10 }] })}><Plus size={15} /> Add service</button>
                <button onClick={saveRates}><Save size={15} /> Save rules</button><button className="ghost" onClick={() => setEditRates(null)}>Cancel</button></div>
            </>
          ) : (
            <div className="row">{Object.entries(cfg.rates).map(([k, v]) => <span key={k} className="chip">{k}: starts at {v}%</span>)}</div>
          )}
          {msg && <div className="receipt">{msg}</div>}
        </section>
      )}
    </div>
  );
}
