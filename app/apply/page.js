"use client";
// Public job application: candidate fills a short form and goes straight into the English fluency test.
import { useEffect, useState } from "react";
import { ArrowRight, Headphones, Megaphone, Loader2, ShieldCheck, Briefcase } from "lucide-react";
import ModoLogo from "@/components/ModoLogo";

export default function Apply() {
  const [info, setInfo] = useState(null); const [f, setF] = useState({ name: "", email: "", phone: "", track: "support", experience: "", website: "" });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  useEffect(() => {
    const h = document.documentElement; h.setAttribute("data-appearance", "dark"); h.setAttribute("data-theme", "dark");
    fetch("/api/apply").then((r) => r.json()).then(setInfo).catch(() => setInfo({ open: true, company: "Modo" }));
  }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const send = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    const r = await fetch("/api/apply", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) }).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    if (r?.ok && d.token) location.href = "/test/" + d.token; else { setBusy(false); setErr(d?.error || "Couldn't send. Try again."); }
  };
  return (
    <div className="et">
      <header className="et-head"><ModoLogo size={26} /><span><Briefcase size={14} /> Careers</span></header>
      <main className="et-main">
        <div className="et-card">
          <h1>Join {info?.company || "our"} call-center team</h1>
          <p>Apply in one minute, then take a short English test (about 30 minutes) right away. Shortlisted candidates book a Zoom interview straight after the test.</p>
          {info && !info.open ? <p className="et-err">Applications are closed right now. Please check back later.</p> : (
            <form className="et-form" onSubmit={send}>
              <div className="et-tracks">
                {[["support", "Customer service", "Help customers with bills, orders and problems", Headphones], ["outreach", "Outreaching / sales", "Call customers and offer savings plans", Megaphone]].map(([k, l, d, I]) => (
                  <button type="button" data-plain key={k} className={f.track === k ? "on" : ""} onClick={() => setF({ ...f, track: k })}><I size={20} /><b>{l}</b><small>{d}</small></button>
                ))}
              </div>
              <label>Full name<input className="et-input" required value={f.name} onChange={set("name")} autoComplete="name" /></label>
              <label>Email<input className="et-input" required type="email" value={f.email} onChange={set("email")} autoComplete="email" /></label>
              <label>Phone / WhatsApp<input className="et-input" required value={f.phone} onChange={set("phone")} inputMode="tel" autoComplete="tel" placeholder="03xx xxxxxxx" /></label>
              <label>Call-center experience (optional)<textarea className="et-input" rows={3} value={f.experience} onChange={set("experience")} placeholder="e.g. 1 year at … on a US telecom campaign" /></label>
              <input className="wl-hp" tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} aria-hidden="true" style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} />
              {err && <p className="et-err">{err}</p>}
              <button data-plain className="et-btn" disabled={busy}>{busy ? <Loader2 size={16} className="spin" /> : null} Apply and start the test <ArrowRight size={16} /></button>
              <small className="et-mute"><ShieldCheck size={12} /> You'll need a quiet place, a headset and Google Chrome.</small>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
