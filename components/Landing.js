"use client";
// Public landing page: what Modo is, plans & prices (live from Admin → Subscriptions), and a "Get started"
// form that lands in Subscriptions as a pending request. No sign-in needed.
import { useEffect, useRef, useState } from "react";
import { PhoneCall, Headphones, Sparkles, MessageSquare, Fingerprint, Wallet, BarChart3, ShieldCheck, Bot, MonitorSmartphone, GraduationCap, CheckCircle2, ArrowRight, Gift, Rocket, Crown, Check, LogIn, Lock, Zap, Globe2, Sun, Moon, SunMoon, Square, UserPlus, Video, MessageSquareWarning, PenLine, NotebookPen } from "lucide-react";
import ModoLogo from "@/components/ModoLogo";
import { useAppearance } from "@/components/Appearance";
import LoginAura from "@/components/LoginAura";
import Bot3D from "@/components/Bot3D";

const FEATURES = [
  [PhoneCall, "Dialer + live listen", "Every call on one screen. Listen, whisper or barge into any agent's call live, and replay every recording.", ["#60a5fa", "#2563eb"]],
  [Sparkles, "AI live call assist", "Modo AI suggests what to say during the call and scores each one for tone, grammar and compliance.", ["#f0abfc", "#c026d3"]],
  [UserPlus, "Hiring & English test", "Candidates apply online and take the Modo English Assessment: speaking, listening, reading and writing, with a Fluency Score from 20–80 and CEFR level.", ["#a5b4fc", "#4f46e5"], true],
  [Video, "Zoom interviews", "Candidates who pass pick an interview time themselves. Zoom link, invite, calendar and reminders are done for you.", ["#93c5fd", "#2563eb"], true],
  [MessageSquareWarning, "Customer complaints", "Agents type or speak the customer's complaint during the call. You get it instantly, set the priority and reply.", ["#fda4af", "#e11d48"], true],
  [PenLine, "Contracts & e-signing", "Every new team member reads and signs their contract on screen, with reminders until it's signed.", ["#fcd34d", "#d97706"], true],
  [MonitorSmartphone, "Remote control", "See every agent's screen state live. Message, lock, open a page or sign them out from anywhere.", ["#7dd3fc", "#0284c7"], true],
  [GraduationCap, "Speeches & training", "Upload your campaign script once. Agents practise it out loud, get scored and learn it faster.", ["#a78bfa", "#7c3aed"]],
  [Bot, "17 automation bots", "Bots for wins, pace, callbacks, contracts, QA, clock-out and interview reminders. Your team runs itself.", ["#5eead4", "#0d9488"]],
  [MessageSquare, "Team chat + WhatsApp", "Channels, voice notes, huddles, plus your WhatsApp inbox with approve-before-send replies.", ["#4ade80", "#128c7e"]],
  [NotebookPen, "Smart scratchpad", "A notepad agents actually like: pages, checklists, customer templates and the campaign speech one tap away.", ["#fdba74", "#ea580c"]],
  [Fingerprint, "Attendance & breaks", "Automatic clock-in from sign-in, office kiosk, break limits and late tracking.", ["#fdba74", "#ea580c"]],
  [Wallet, "Payroll & targets", "Monthly pay, late deductions, bonuses and daily targets, worked out for you.", ["#fcd34d", "#d97706"]],
  [BarChart3, "Real-time reports", "Sales, verification, leaderboard and QA in live dashboards for every campaign.", ["#a5b4fc", "#4f46e5"]],
  [ShieldCheck, "Locked-down security", "Two-step sign-in, encrypted secrets, brute-force lockouts and a password on your WhatsApp inbox.", ["#fda4af", "#e11d48"]],
];
const BOTS = [
  { name: "Coach", tag: "AI.COACH", c1: "#f0abfc", c2: "#a21caf", eye: "#f5d0fe", d: "Listens to every call, suggests what to say next and scores tone, grammar and compliance." },
  { name: "Checker", tag: "SALE.CHECK", c1: "#6ee7b7", c2: "#047857", eye: "#a7f3d0", d: "Checks every sale for missing details, duplicates and card numbers before you even look." },
  { name: "Recruiter", tag: "HIRE.BOT", c1: "#a5b4fc", c2: "#4338ca", eye: "#67e8f9", d: "Runs the English test, books Zoom interviews and reminds you 15 minutes before each one." },
  { name: "Floor manager", tag: "FLOOR.OPS", c1: "#fcd34d", c2: "#c2410c", eye: "#fde68a", d: "Watches attendance, breaks, pace and targets, and celebrates every win in #wins." },
];
const NEW = [[UserPlus, "Hiring with English test"], [Video, "Self-booked Zoom interviews"], [MessageSquareWarning, "Customer complaints"], [PenLine, "Contract e-signing"], [MonitorSmartphone, "Remote control"]];
const ICON = { free: Gift, starter: Rocket, next: Sparkles, enterprise: Crown };
const TONE = { free: ["#cbd5e1", "#475569"], starter: ["#60a5fa", "#2563eb"], next: ["#a78bfa", "#7c3aed"], enterprise: ["#fcd34d", "#d97706"] };
const FAQ = [
  ["How do I pay?", "After you pick a plan, our team contacts you with an invoice (bank transfer, Payoneer or card). Your workspace goes live the moment it's paid."],
  ["Can I change or cancel my plan?", "Yes, at any time. Move up, move down or cancel, and the change applies from your next billing month."],
  ["Can it hire for us too?", "Yes. Share your apply page, candidates take the English test online, and the ones who pass book a Zoom interview by themselves. You see every score, recording and answer."],
  ["Does it work with VICIdial?", "Yes. Modo connects to your VICIdial for calls, recordings, live listen and agent status. Other dialers can connect too."],
  ["Is our data safe?", "Two-step sign-in, encrypted secrets, brute-force lockouts, attack protection and role-based access are on from day one."],
  ["Do agents need to install anything?", "No. Modo runs in the browser, as a Windows app or on a phone. Agents sign in and their shift starts."],
];

export default function Landing() {
  const [plans, setPlans] = useState([]); const [yearly, setYearly] = useState(false);
  const [f, setF] = useState({ company: "", contact: "", email: "", phone: "", plan: "next", seats: 10, notes: "", website: "" });
  const [state, setState] = useState(""); const [err, setErr] = useState("");
  // This page is always dark, whatever appearance the visitor picked inside Modo (restored when leaving).
  const [mode, setMode, eff, look, setLook] = useAppearance(); const [themeOpen, setThemeOpen] = useState(false);
  const root = useRef(null); const raf = useRef(0);
  // Bots turn toward the mouse: --mx / --my from -1 to 1.
  const track = (e) => {
    if (e.pointerType === "touch" || raf.current) return;
    const x = e.clientX, y = e.clientY;
    raf.current = requestAnimationFrame(() => { raf.current = 0; const el = root.current; if (!el) return; el.style.setProperty("--mx", ((x / innerWidth) * 2 - 1).toFixed(3)); el.style.setProperty("--my", ((y / innerHeight) * 2 - 1).toFixed(3)); });
  };
  useEffect(() => { fetch("/api/subs/public").then((r) => r.json()).then((d) => setPlans(d.plans || [])).catch(() => {}); }, []);
  const pick = (id) => { setF((x) => ({ ...x, plan: id })); document.getElementById("start")?.scrollIntoView({ behavior: "smooth" }); };
  const send = async (e) => {
    e.preventDefault(); setErr(""); setState("busy");
    const r = await fetch("/api/subs/public", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) }).catch(() => null);
    const d = await r?.json().catch(() => ({}));
    if (r?.ok) setState("done"); else { setState(""); setErr(d?.error || "Couldn't send. Try again."); }
  };
  const price = (p) => (yearly ? Math.round(p.price * 0.8) : p.price);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="lp" ref={root} onPointerMove={track}>
      <LoginAura />
      <header className="wl-nav">
        <a href="/" className="wl-brand"><ModoLogo size={30} /></a>
        <nav><a href="#features">Features</a><a href="#bots">Bots</a><a href="#pricing">Pricing</a><a href="#faq">FAQ</a><a href="/apply">Careers</a></nav>
        <span className="wl-themewrap">
          <button type="button" data-plain className="wl-theme" onClick={() => setThemeOpen(!themeOpen)} aria-haspopup="true" aria-expanded={themeOpen} aria-label="Theme" title="Theme">{eff === "dark" ? <Moon size={17} /> : <Sun size={17} />}</button>
          {themeOpen && (
            <span className="wl-thememenu" role="menu" onMouseLeave={() => setThemeOpen(false)}>
              <span className="wl-seg">{[["light", "Day", Sun], ["auto", "Auto", SunMoon], ["dark", "Night", Moon]].map(([k, l, I]) => <button type="button" data-plain key={k} className={mode === k ? "on" : ""} onClick={() => setMode(k)}><I size={14} />{l}</button>)}</span>
              <button type="button" data-plain className={"wl-minimal" + (look === "minimal" ? " on" : "")} onClick={() => setLook(look === "minimal" ? "royal" : "minimal")}>
                <Square size={14} /><span><b>Minimal look</b><small>Clean and flat, no effects</small></span><i className="wl-sw" />
              </button>
            </span>
          )}
        </span>
        <a href="/login" className="wl-btn ghost"><LogIn size={15} /> Sign in</a>
      </header>

      <section className="wl-hero">
        <div className="wl-floor" aria-hidden="true" />
        <Bot3D className="wl-hero-bot l" c1="#a78bfa" c2="#4f46e5" eye="#67e8f9" size={1.05} />
        <Bot3D className="wl-hero-bot r" c1="#67e8f9" c2="#2563eb" eye="#f0abfc" size={0.85} delay={-1.6} />
        <span className="wl-pill"><Zap size={13} /> The all-in-one team CRM for 2026</span>
        <h1>Run your whole sales team <em>from one beautiful screen.</em></h1>
        <p>Calls, live monitoring, AI coaching, hiring, attendance, payroll, chat and WhatsApp in one place, for remote and office teams. Built to be the best CRM of 2026.</p>
        <div className="wl-cta">
          <a href="#start" className="wl-btn">Start free <ArrowRight size={16} /></a>
          <a href="#pricing" className="wl-btn ghost">See pricing</a>
        </div>
        <div className="wl-trust"><span><CheckCircle2 size={14} /> Free plan forever</span><span><CheckCircle2 size={14} /> No install needed</span><span><CheckCircle2 size={14} /> Live in a day</span></div>

        <div className="wl-mock" aria-hidden="true">
          <div className="wl-mock-bar"><i /><i /><i /><span>modo · Overview</span></div>
          <div className="wl-mock-body">
            <div className="wl-kpi"><small>Sales today</small><b>128</b><em>▲ 18%</em></div>
            <div className="wl-kpi"><small>Agents live</small><b>46</b><em>on calls 31</em></div>
            <div className="wl-kpi"><small>QA score</small><b>92</b><em>▲ 4 pts</em></div>
            <div className="wl-chart">{[38, 52, 44, 66, 58, 74, 69, 88, 80, 96, 90, 100].map((h, i) => <span key={i} style={{ height: h + "%" }} />)}</div>
            <div className="wl-live">{["Sarah · on call 04:12", "Daniel · wrap-up", "Aisha · on call 01:48", "Omar · break 3m"].map((t, i) => <div key={i}><i className={i % 3 === 1 ? "y" : i === 3 ? "o" : ""} />{t}<Headphones size={12} /></div>)}</div>
          </div>
        </div>
      </section>

      <section className="wl-strip">
        <div><Lock size={18} /><b>Bank-grade security</b><small>2-step sign-in, encryption, lockouts</small></div>
        <div><Globe2 size={18} /><b>Remote + office</b><small>Browser, Windows app and phone</small></div>
        <div><ShieldCheck size={18} /><b>Your data stays yours</b><small>Export everything, anytime</small></div>
        <div><Bot size={18} /><b>AI on every call</b><small>Coaching, QA and summaries</small></div>
      </section>

      <section className="wl-newband">
        <span className="wl-newtag"><Sparkles size={13} /> New in Modo</span>
        {NEW.map(([I, t]) => <a key={t} href="#features"><I size={14} /> {t}</a>)}
      </section>

      <section id="features" className="wl-sec">
        <h2>Everything your team needs. Nothing it doesn't.</h2>
        <p className="wl-sub">Replace five tools with one. Your agents will actually enjoy using it.</p>
        <div className="wl-grid">
          {FEATURES.map(([I, t, d, [a, b], isNew]) => (
            <div key={t} className="wl-card">{isNew && <span className="wl-new">New</span>}<span className="gt" style={{ "--g1": a, "--g2": b, width: 46, height: 46, borderRadius: 14 }}><I size={22} /></span><b>{t}</b><p>{d}</p></div>
          ))}
        </div>
      </section>

      <section id="bots" className="wl-sec">
        <div className="wl-botlab">
          <h2>Meet your Modo bots</h2>
          <p className="wl-sub">17 bots work your floor 24/7, so your managers don't have to. Move around — they're watching you.</p>
          <div className="wl-botgrid">
            {BOTS.map((b, i) => (
              <div key={b.name} className="wl-botcard" style={{ "--eye": b.eye }}>
                <Bot3D c1={b.c1} c2={b.c2} eye={b.eye} size={0.82} delay={-i * 0.9} label={b.name + " bot"} />
                <span className="wl-chip">{b.tag}</span>
                <b>{b.name}</b>
                <p>{b.d}</p>
              </div>
            ))}
          </div>
          <div className="wl-botcount"><span><b>17</b>bots</span><span><b>24/7</b>on duty</span><span><b>0</b>coffee breaks</span></div>
        </div>
      </section>

      <section id="pricing" className="wl-sec">
        <h2>Simple pricing that grows with you</h2>
        <p className="wl-sub">Start free. Upgrade when your floor grows. Change or cancel anytime.</p>
        <div className="wl-toggle"><button type="button" data-plain className={!yearly ? "on" : ""} onClick={() => setYearly(false)}>Monthly</button><button type="button" data-plain className={yearly ? "on" : ""} onClick={() => setYearly(true)}>Yearly <em>save 20%</em></button></div>
        <div className="wl-prices">
          {plans.map((p) => {
            const I = ICON[p.id] || Sparkles; const [a, b] = TONE[p.id] || ["#5eead4", "#0d9488"];
            return (
              <div key={p.id} className={"wl-plan" + (p.popular ? " pop" : "")}>
                {p.popular && <span className="wl-badge">Most popular</span>}
                <span className="gt" style={{ "--g1": a, "--g2": b, width: 42, height: 42, borderRadius: 13 }}><I size={20} /></span>
                <h3>{p.name}</h3><p className="wl-tag">{p.tagline}</p>
                <div className="wl-amt"><b>${price(p)}</b><span>{p.price ? "/ " + p.period.replace(/^\s*\/?\s*/, "") : "forever"}</span></div>
                {yearly && p.price > 0 && <small className="wl-note">billed yearly</small>}
                <small className="wl-seats">{p.seats}</small>
                <ul>{(p.features || []).map((x) => <li key={x}><Check size={14} /> {x}</li>)}</ul>
                <button type="button" data-plain className={"wl-btn" + (p.popular ? "" : " ghost")} onClick={() => pick(p.id)}>{p.price ? "Choose " + p.name : "Start free"}</button>
              </div>
            );
          })}
          {!plans.length && <p className="wl-sub">Loading plans…</p>}
        </div>
      </section>

      <section id="faq" className="wl-sec">
        <h2>Questions</h2>
        <div className="wl-faq">{FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
      </section>

      <section id="start" className="wl-sec">
        <div className="wl-form-wrap">
          <div>
            <h2 style={{ textAlign: "left" }}>Get Modo for your team</h2>
            <p className="wl-sub" style={{ textAlign: "left" }}>Tell us about your floor. We'll set up your workspace and send your sign-in details, usually the same day.</p>
            <ul className="wl-steps"><li><b>1</b> Pick a plan and send this form</li><li><b>2</b> We confirm and set up your workspace</li><li><b>3</b> Your team signs in and gets to work</li></ul>
          </div>
          {state === "done" ? (
            <div className="wl-done"><span className="gt" style={{ "--g1": "#34d399", "--g2": "#059669", width: 56, height: 56, borderRadius: 18 }}><Check size={28} /></span><h3>Thanks! Request received.</h3><p>We'll contact you at {f.email} shortly to activate your {plans.find((p) => p.id === f.plan)?.name || ""} plan.</p></div>
          ) : (
            <form className="wl-form" onSubmit={send}>
              <label>Company<input required value={f.company} onChange={set("company")} placeholder="Your company" /></label>
              <label>Your name<input required value={f.contact} onChange={set("contact")} /></label>
              <label>Work email<input required type="email" value={f.email} onChange={set("email")} /></label>
              <label>Phone / WhatsApp<input value={f.phone} onChange={set("phone")} /></label>
              <label>Plan<select value={f.plan} onChange={set("plan")}>{plans.map((p) => <option key={p.id} value={p.id}>{p.name}{p.price ? ` — $${p.price}/${p.period.replace(/^\s*\/?\s*/, "")}` : " — free"}</option>)}</select></label>
              <label>Number of agents<input type="number" min="1" value={f.seats} onChange={set("seats")} /></label>
              <label className="wl-wide">Anything else?<textarea rows={3} value={f.notes} onChange={set("notes")} placeholder="Dialer you use, campaigns, when you want to start…" /></label>
              <input className="wl-hp" tabIndex={-1} autoComplete="off" value={f.website} onChange={set("website")} aria-hidden="true" />
              {err && <div className="err wl-wide">{err}</div>}
              <button data-plain className="wl-btn wl-wide" disabled={state === "busy"}>{state === "busy" ? "Sending…" : <>Request my plan <ArrowRight size={16} /></>}</button>
            </form>
          )}
        </div>
      </section>

      <footer className="wl-foot"><ModoLogo size={22} /><span>© {new Date().getFullYear()} Modo. Sell, support and grow from one screen.</span><a href="/apply" style={{ marginLeft: "auto" }}>Careers</a><a href="/login" style={{ marginLeft: 0 }}>Sign in</a></footer>
    </div>
  );
}
