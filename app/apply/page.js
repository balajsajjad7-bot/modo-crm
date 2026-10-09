"use client";
// Public careers page: pick a role, apply in a minute, then go straight into the Modo English Assessment.
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Headphones, Megaphone, Loader2, ShieldCheck, Briefcase, GraduationCap, Laptop, Rocket, Video, Mic, CheckCircle2, Clock3, Sparkles, FileText, UploadCloud, X } from "lucide-react";
import ModoLogo from "@/components/ModoLogo";
import Bot3D from "@/components/Bot3D";

const ROLES = [
  { k: "support", t: "Customer Support", I: Headphones, g: ["#93c5fd", "#2563eb"], d: "Help US customers with bills, orders and service — calm, clear and kind.", s: ["Listening & empathy", "Clear spoken English", "Problem solving"] },
  { k: "outreach", t: "Outreach & Sales", I: Megaphone, g: ["#f0abfc", "#a21caf"], d: "Call customers with offers that save them money, and turn conversations into results.", s: ["Confident speaking", "Handling objections", "Target-driven"] },
];
const STEPS = [[Briefcase, "Apply", "1 minute"], [GraduationCap, "English assessment", "≈ 30 minutes, online"], [Video, "Zoom interview", "Pick your own time"], [Rocket, "Join the team", "Training starts day one"]];

export default function Apply() {
  const [info, setInfo] = useState(null); const [f, setF] = useState({ name: "", email: "", phone: "", track: "support", experience: "", website: "" });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [cv, setCv] = useState(null); const [drag, setDrag] = useState(false); const fileRef = useRef(null);
  const pickCv = (file) => { setErr(""); if (!file) return; if (file.size > 6 * 1024 * 1024) return setErr("Your resume is over 6 MB. Please upload a smaller file."); if (!/\.(pdf|docx|txt|jpe?g|png)$/i.test(file.name)) return setErr("Please upload a PDF, Word (.docx), text file or a photo of your resume."); setCv(file); };
  useEffect(() => {
    const h = document.documentElement; h.setAttribute("data-appearance", "dark"); h.setAttribute("data-theme", "dark");
    fetch("/api/apply").then((r) => r.json()).then(setInfo).catch(() => setInfo({ open: true, company: "Modo" }));
  }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const send = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    let r;
    if (cv) { const fd = new FormData(); Object.entries(f).forEach(([k, v]) => fd.set(k, v)); fd.set("cv", cv); r = await fetch("/api/apply", { method: "POST", body: fd }).catch(() => null); }
    else r = await fetch("/api/apply", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) }).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    if (r?.ok && d.token) location.href = "/test/" + d.token; else { setBusy(false); setErr(d?.error || "Couldn't send. Check your connection and try again."); }
  };
  const company = info?.company || "Modo";
  return (
    <div className="et cr">
      <div className="et-glow" aria-hidden="true" />
      <header className="et-head"><a href="/"><ModoLogo size={26} /></a><span className="et-head-t"><Briefcase size={14} /> Careers</span></header>
      <main className="cr-main">
        <section className="cr-hero">
          <div>
            <span className="et-badge"><Sparkles size={12} /> We're hiring · {company}</span>
            <h1>Your voice can <em>build a career.</em></h1>
            <p>Join a team that works on US customer campaigns with modern tools, real training and room to grow. Apply in one minute — your English assessment starts right after, and you can book your interview today.</p>
            <div className="cr-perks">
              <span><GraduationCap size={15} /> Training from day one</span>
              <span><Laptop size={15} /> Remote & office roles</span>
              <span><Rocket size={15} /> Clear growth path</span>
            </div>
            <a href="#apply" className="et-btn">Apply now <ArrowRight size={16} /></a>
          </div>
          <div className="cr-bot" aria-hidden="true">
            <Bot3D c1="#a5b4fc" c2="#4338ca" eye="#67e8f9" size={1.25} />
            <span className="cr-float a"><Clock3 size={13} /> Apply in 1 min</span>
            <span className="cr-float b"><Mic size={13} /> Speak, listen, write</span>
            <span className="cr-float c"><Video size={13} /> Zoom interview</span>
          </div>
        </section>

        <section className="cr-steps">
          {STEPS.map(([I, t, d], i) => <div key={t}><span className="cr-n">{i + 1}</span><I size={18} /><b>{t}</b><small>{d}</small></div>)}
        </section>

        <section id="apply" className="cr-apply">
          <div className="cr-roles">
            <h2>Choose your role</h2>
            {ROLES.map((r) => (
              <button type="button" data-plain key={r.k} className={"cr-role" + (f.track === r.k ? " on" : "")} onClick={() => setF({ ...f, track: r.k })}>
                <span className="et-hero-ic sm" style={{ "--g1": r.g[0], "--g2": r.g[1] }}><r.I size={20} /></span>
                <span><b>{r.t}</b><small>{r.d}</small><span className="cr-skills">{r.s.map((s) => <em key={s}>{s}</em>)}</span></span>
                <span className="cr-check">{f.track === r.k && <CheckCircle2 size={20} />}</span>
              </button>
            ))}
            <div className="cr-need"><ShieldCheck size={15} /><span>You'll need <b>Google Chrome</b>, a <b>headset</b> and a <b>quiet room</b> for about 30 minutes.</span></div>
          </div>
          <div className="et-card cr-form-card">
            {info && !info.open ? <p className="et-err">Applications are closed right now. Please check back soon.</p> : (
              <form className="et-form" onSubmit={send}>
                <h3>Your details</h3>
                <label>Full name<input className="et-input" required value={f.name} onChange={set("name")} autoComplete="name" placeholder="e.g. Ayesha Khan" /></label>
                <div className="cr-two">
                  <label>Email<input className="et-input" required type="email" value={f.email} onChange={set("email")} autoComplete="email" placeholder="you@email.com" /></label>
                  <label>Phone / WhatsApp<input className="et-input" required value={f.phone} onChange={set("phone")} inputMode="tel" autoComplete="tel" placeholder="03xx xxxxxxx" /></label>
                </div>
                <div className={"cr-drop" + (drag ? " drag" : "") + (cv ? " has" : "")} onClick={() => !cv && fileRef.current?.click()} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); pickCv(e.dataTransfer.files?.[0]); }} role="button" tabIndex={0}>
                  <input ref={fileRef} type="file" hidden accept=".pdf,.docx,.txt,.jpg,.jpeg,.png,application/pdf" onChange={(e) => pickCv(e.target.files?.[0])} />
                  {cv ? (<><span className="cr-file"><FileText size={20} /></span><span><b>{cv.name}</b><small>{cv.size < 1048576 ? Math.max(1, Math.round(cv.size / 1024)) + " KB" : (cv.size / 1048576).toFixed(1) + " MB"} · Modo AI will read it for the recruiter</small></span><button type="button" data-plain className="cr-x" onClick={(e) => { e.stopPropagation(); setCv(null); }} aria-label="Remove"><X size={16} /></button></>)
                    : (<><span className="cr-file"><UploadCloud size={20} /></span><span><b>Upload your resume <small className="et-mute">(optional)</small></b><small>PDF, Word or a photo · up to 6 MB · drag it here or tap</small></span></>)}
                </div>
                <label>Experience <small>(optional)</small><textarea className="et-input" rows={3} value={f.experience} onChange={set("experience")} placeholder="e.g. 1 year in customer support on a US campaign" /></label>
                <input tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} aria-hidden="true" style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} />
                {err && <p className="et-err">{err}</p>}
                <button data-plain className="et-btn et-go" disabled={busy}>{busy ? <Loader2 size={16} className="spin" /> : null} {busy && cv ? "Uploading your resume…" : "Apply & start my assessment"} <ArrowRight size={16} /></button>
                <small className="et-mute">Applying as <b>{ROLES.find((r) => r.k === f.track)?.t}</b>. Your details are only used for this application.</small>
              </form>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
