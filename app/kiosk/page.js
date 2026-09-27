"use client";
// Office entrance screen: rotating QR code for phone check-in, plus an ID/password pad. Keep it open on a tablet or TV.
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import Link from "next/link";
import AppearanceToggle from "@/components/Appearance";

export default function Kiosk() {
  const [d, setD] = useState(null); const [svg, setSvg] = useState(""); const [now, setNow] = useState(new Date());
  const [id, setId] = useState(""); const [pw, setPw] = useState(""); const [res, setRes] = useState(null); const [busy, setBusy] = useState(false);
  useEffect(() => {
    let stop = false, timer;
    const load = async () => {
      const r = await fetch("/api/kiosk", { cache: "no-store" }); if (!r.ok || stop) return;
      const x = await r.json(); setD(x);
      setSvg(await QRCode.toString(x.url, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#07080a", light: "#ffffff" } }));
      timer = setTimeout(load, Math.max(2000, x.expiresIn + 300));
    };
    load(); const c = setInterval(() => setNow(new Date()), 1000);
    return () => { stop = true; clearTimeout(timer); clearInterval(c); };
  }, []);
  async function checkIn(e) {
    e.preventDefault(); setBusy(true);
    const r = await fetch("/api/checkin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kiosk: true, agentId: id, password: pw }) });
    const x = await r.json(); setBusy(false);
    setRes(r.ok ? { ok: true, text: `Welcome, ${x.name.split(" ")[0]}! ${x.message}` } : { ok: false, text: x.error });
    setId(""); setPw(""); setTimeout(() => setRes(null), 5000);
  }
  const inNow = (d?.rows || []).filter((r) => r.in);
  return (
    <main className="kiosk">
      <div className="corner-toggle"><AppearanceToggle /></div>
      <div className="stack" style={{ gap: 22 }}>
        <div className="row" style={{ gap: 10 }}><span className="pn-logo" style={{ padding: 0 }}><span className="diamond" /><b>MODO</b></span><span className="muted">Office check-in</span></div>
        <div><div className="clock">{now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}<span style={{ fontSize: "40%", opacity: .6 }}>:{String(now.getSeconds()).padStart(2, "0")}</span></div>
          <div className="muted" style={{ fontSize: 20 }}>{now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</div></div>
        <div className="row" style={{ gap: 24, alignItems: "flex-start" }}>
          <div className="stack" style={{ gap: 10, justifyItems: "center" }}>
            <div className="qr" dangerouslySetInnerHTML={{ __html: svg }} aria-label="Check-in QR code" />
            <span className="muted small">Scan with your phone camera · code changes every 20 s</span>
          </div>
          <form className="panel stack" style={{ minWidth: 260 }} onSubmit={checkIn}>
            <h2>No phone? Check in here</h2>
            <label>Agent ID<input value={id} onChange={(e) => setId(e.target.value.toUpperCase())} autoComplete="off" required /></label>
            <label>Password<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="off" required /></label>
            <button disabled={busy}>{busy ? "Checking in…" : "Check in"}</button>
            {res && <div className={res.ok ? "receipt" : "err"} role="status">{res.text}</div>}
          </form>
        </div>
      </div>
      <section className="panel stack" style={{ maxHeight: "80vh", overflow: "auto" }}>
        <div className="row" style={{ justifyContent: "space-between" }}><h2>In today · {inNow.length}/{d?.rows.length || 0}</h2><Link href="/admin/attendance" className="btn-link">Exit kiosk</Link></div>
        {(d?.rows || []).map((r) => (
          <div key={r.agentId} className="row-card" style={{ padding: "10px 0" }}>
            <span className="sl-avatar" style={{ width: 36, height: 36, borderRadius: 10, background: r.in ? "var(--grad)" : "rgba(255,255,255,.08)", fontSize: 13 }}>{r.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>
            <div style={{ flex: 1 }}><b>{r.name}</b><div className="small muted">{r.at ? `arrived ${new Date(r.at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}${r.location === "office" ? " · office" : r.location === "remote" ? " · remote" : ""}` : "not in yet"}</div></div>
            {r.at && (r.late ? <span className="chip red">late</span> : <span className="chip ok">on time</span>)}
          </div>
        ))}
      </section>
    </main>
  );
}
