"use client";
// Admin report: automatic order tracking — which packages are delivered and which aren't.
import { useEffect, useMemo, useState } from "react";
import { usePoll, api } from "./api";
import { PackageSearch, RefreshCw, Search, Download, ExternalLink, Plug } from "lucide-react";
import Link from "next/link";

const STATUS_LABEL = {
  delivered: "Delivered", out_for_delivery: "Out for delivery", in_transit: "In transit",
  dropped_off: "Dropped off / received", picked_up: "Picked up", pending: "Label created",
  exception: "Problem — check", returned: "Returned", unknown: "Unknown",
};

const CARRIER_URL = {
  ups: (t) => `https://www.ups.com/track?tracknum=${t}`,
  fedex: (t) => `https://www.fedex.com/fedextrack/?trknbr=${t}`,
  usps: (t) => `https://tools.usps.com/go/TrackConfirmAction?tLabels=${t}`,
  dhl: (t) => `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${t}`,
};
const trackUrl = (r) => (CARRIER_URL[(r.carrier || "").toLowerCase()] || ((t) => `https://www.google.com/search?q=${encodeURIComponent(t + " tracking")}`))(encodeURIComponent(r.trackingNo || r.orderNumber || ""));
const badgeClass = (s) => s === "delivered" ? "ok" : s === "exception" || s === "returned" ? "red" : s === "out_for_delivery" ? "ok" : "late";
const fmt = (d) => d ? new Date(d).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

export default function OrderTracking() {
  const [{ data }, reload] = usePoll("/api/tracking", 60000);
  const [q, setQ] = useState(""); const [filter, setFilter] = useState("all"); const [busy, setBusy] = useState(false); const [msg, setMsg] = useState("");
  // On open, auto-refresh the ones that aren't delivered yet.
  useEffect(() => { refresh(true); }, []); // eslint-disable-line
  async function refresh(silent) {
    if (!silent) setBusy(true); setMsg("");
    const r = await api("/api/tracking", "POST", {});
    if (!silent) setBusy(false);
    if (r.ok) { setMsg(`Checked ${r.data.checked} · updated ${r.data.ok}${r.data.fail ? ` · ${r.data.fail} couldn't be read` : ""}`); reload(); }
    else setMsg(r.data.error || "Couldn't refresh.");
  }
  const rows = data?.rows || [];
  const list = useMemo(() => rows.filter((r) => {
    const s = q.trim().toLowerCase();
    const matchQ = !s || (`${r.customer} ${r.orderNumber} ${r.trackingNo} ${r.user?.name}`.toLowerCase().includes(s));
    const st = r.trackStatus || "pending";
    const matchF = filter === "all" || (filter === "notdelivered" ? st !== "delivered" : st === filter);
    return matchQ && matchF;
  }), [rows, q, filter]);
  const n = (s) => rows.filter((r) => (r.trackStatus || "pending") === s).length;
  const delivered = n("delivered"); const notDel = rows.length - delivered;

  function exportCsv() {
    const head = ["Customer", "Order #", "Carrier", "Tracking", "Status", "Latest update", "Delivered", "Agent"];
    const body = list.map((r) => [r.customer, r.orderNumber, r.carrier, r.trackingNo, STATUS_LABEL[r.trackStatus] || "—", r.trackStage, r.deliveredAt ? new Date(r.deliveredAt).toLocaleString() : "", r.user?.name]);
    const csv = [head, ...body].map((row) => row.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "order-tracking.csv"; a.click();
  }

  if (!data) return <p className="muted">Loading order tracking…</p>;
  if (!data.configured) return (
    <section className="panel stack">
      <h2><PackageSearch size={18} /> Order tracking</h2>
      <p className="muted" style={{ margin: 0 }}>Turn on automatic tracking by adding a free <b>AfterShip</b> API key. It tracks UPS, FedEx, USPS, DHL and more from the order's tracking number, so you can see what's delivered and what isn't.</p>
      <div className="row"><Link className="btn-link" href="/admin/connectors"><Plug size={14} /> Add AfterShip key in Connectors</Link></div>
      <p className="muted small" style={{ margin: 0 }}>Get a key free at aftership.com → Settings → API keys, then paste it in Connectors → Order tracking. Agents add a tracking number when they submit a sale.</p>
    </section>
  );

  const FILTERS = [["all", `All (${rows.length})`], ["delivered", `Delivered (${delivered})`], ["notdelivered", `Not delivered (${notDel})`], ["in_transit", `In transit (${n("in_transit")})`], ["dropped_off", `Dropped off (${n("dropped_off")})`], ["exception", `Problems (${n("exception")})`]];

  return (
    <div className="stack">
      <section className="panel stack">
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <h2><PackageSearch size={18} /> Order tracking</h2>
          <div className="row" style={{ gap: 8 }}>
            <button className="ghost sm" onClick={() => refresh(false)} disabled={busy}><RefreshCw size={13} /> {busy ? "Checking…" : "Refresh now"}</button>
            <button className="ghost sm" onClick={exportCsv}><Download size={13} /> CSV</button>
          </div>
        </div>
        <div className="floor-kpis">
          <div><b>{rows.length}</b><span>tracked orders</span></div>
          <div><b style={{ color: "var(--green)" }}>{delivered}</b><span>delivered</span></div>
          <div><b style={{ color: "var(--amber)" }}>{notDel}</b><span>not delivered yet</span></div>
          <div><b style={{ color: "var(--crimson,#ff4d5a)" }}>{n("exception")}</b><span>problems</span></div>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <label className="sl-search" style={{ margin: 0, maxWidth: 260, background: "rgba(255,255,255,.06)" }}><Search size={14} /><input placeholder="Search customer, order, tracking…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <div className="seg" style={{ flexWrap: "wrap" }}>{FILTERS.map(([k, l]) => <button key={k} className={filter === k ? "on" : ""} aria-selected={filter === k} onClick={() => setFilter(k)}>{l}</button>)}</div>
        </div>
        {msg && <p className="small muted" style={{ margin: 0 }}>{msg}</p>}
      </section>

      <section className="panel">
        {!list.length ? <p className="muted" style={{ margin: 0 }}>No orders match. Agents add a tracking number when submitting a sale.</p> : (
          <div className="tablewrap"><table>
            <thead><tr><th>Customer</th><th>Order #</th><th>Carrier</th><th>Status</th><th>Latest update</th><th>Delivered</th><th>Agent</th><th></th></tr></thead>
            <tbody>{list.map((r) => (
              <tr key={r.id}>
                <td>{r.customer || "—"}<div className="muted small num">{r.trackingNo || r.orderNumber}</div></td>
                <td className="num">{r.orderNumber || "—"}</td>
                <td className="small">{(r.carrier || "auto").toUpperCase()}</td>
                <td><span className={"chip " + badgeClass(r.trackStatus)}>{STATUS_LABEL[r.trackStatus] || "Not checked"}</span></td>
                <td className="small" style={{ maxWidth: 320 }}>{r.trackStage || "—"}<div className="muted small">{fmt(r.trackUpdatedAt)}</div></td>
                <td className="small">{r.deliveredAt ? fmt(r.deliveredAt) : "—"}</td>
                <td className="small muted">{r.user?.name || "—"}</td>
                <td><a className="ghost sm" href={trackUrl(r)} target="_blank" rel="noreferrer" title="Open carrier tracking"><ExternalLink size={13} /></a></td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
    </div>
  );
}
