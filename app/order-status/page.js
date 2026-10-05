"use client";
// Landing page for the Modo Fill bookmark: it opens this tab with the status it read on the carrier's site;
// we save it to the sale and close the tab again.
import { useEffect, useState } from "react";
import { PackageCheck, AlertTriangle } from "lucide-react";

export default function OrderStatusReturn() {
  const [st, setSt] = useState({ state: "saving" });
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const body = { id: q.get("i"), status: q.get("s"), note: q.get("n") || "", carrier: q.get("c") || "verizon" };
    fetch("/api/sales/order-status", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then(async (r) => ({ ok: r.ok, d: await r.json().catch(() => ({})) }))
      .then(({ ok, d }) => {
        if (!ok) return setSt({ state: "error", msg: d.error || "Couldn't save." });
        setSt({ state: "done", sale: d.sale });
        try { localStorage.setItem("modo-order-status", JSON.stringify({ ...d.sale, at: Date.now() })); } catch {}
        // Opened by the add-on/bookmark → close this tab. Opened by the Android app → go back to Sales.
        setTimeout(() => { try { window.close(); } catch {} setTimeout(() => location.replace(document.referrer && !/order-status/.test(document.referrer) ? document.referrer : "/admin/sales"), 300); }, 1800);
      }).catch(() => setSt({ state: "error", msg: "Can't reach Modo. Check the internet connection." }));
  }, []);
  return (
    <main className="login">
      <div className="panel stack" style={{ maxWidth: 420, textAlign: "center", alignItems: "center" }}>
        {st.state === "saving" && <p className="muted">Saving the order status to Modo…</p>}
        {st.state === "done" && <><PackageCheck size={36} style={{ color: "var(--green)" }} /><h2>Saved to order #{st.sale?.orderNumber}</h2><p className="muted small" style={{ margin: 0 }}>{st.sale?.trackStage}</p><p className="muted small" style={{ margin: 0 }}>Taking you back…</p></>}
        {st.state === "error" && <><AlertTriangle size={34} style={{ color: "var(--amber)" }} /><h2>Not saved</h2><p className="small" style={{ margin: 0 }}>{st.msg}</p>{/Sign in/.test(st.msg) && <a href="/">Sign in to Modo</a>}</>}
      </div>
    </main>
  );
}
