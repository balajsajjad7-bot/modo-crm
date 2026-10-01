"use client";
// Extra info on the agent's "My shift" screen: US time zones, who they're on a call with,
// a notice from admin, and a daily money-motivation quote.
import { useEffect, useState } from "react";
import { Clock, PhoneCall, Megaphone, Sparkles } from "lucide-react";

const US_ZONES = [
  ["ET", "America/New_York"], ["CT", "America/Chicago"], ["MT", "America/Denver"], ["PT", "America/Los_Angeles"],
];
const QUOTES = [
  "Every call is a chance to change your month. Pick up the next one.",
  "The money is in the follow-up. Call them back.",
  "You don't get paid for the call you didn't make.",
  "Small sales daily beat big sales someday.",
  "Your next yes is hiding behind a few more nos.",
  "Discipline on the dial today, bonus in the bank this month.",
  "Confidence sells. Know your pitch, own the call.",
  "A closed sale starts with a warm hello.",
  "Treat every lead like it's your paycheck — because it is.",
  "Show up, dial in, cash out.",
  "Objections are just questions in disguise. Answer them and close.",
  "The best time to hit target was an hour ago. The next best time is now.",
  "Energy is contagious — sound like the deal is already done.",
  "One more call. That's how top earners are made.",
  "You're one great conversation away from a great day.",
];
const fmt = (tz) => { try { return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(new Date()); } catch { return "--"; } };
const okToCall = (tz) => { try { const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(new Date())); return h >= 8 && h < 21; } catch { return true; } };
const prettyPhone = (p) => { const d = String(p || "").replace(/\D/g, "").slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : p; };

export default function ShiftExtras() {
  const [, tick] = useState(0);
  const [dialer, setDialer] = useState(null);
  const [notice, setNotice] = useState("");
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const load = () => { if (document.hidden) return; fetch("/api/dialer", { cache: "no-store" }).then((r) => r.json()).then((d) => setDialer(d)).catch(() => {}); };
    load(); const t = setInterval(load, 5000); return () => clearInterval(t);
  }, []);
  useEffect(() => { fetch("/api/settings").then((r) => r.json()).then((d) => setNotice(d.onboardMsg || "")).catch(() => {}); }, []);

  const quote = QUOTES[Math.floor(Date.now() / 86400000) % QUOTES.length];
  const onCall = dialer && dialer.loggedIn && dialer.phone;

  return (
    <div className="shift-extras">
      {onCall && (
        <section className="panel stack oncall-card" style={{ gap: 6 }}>
          <div className="row" style={{ gap: 8 }}><span className="live-dot" /><b style={{ fontSize: 18 }}><PhoneCall size={16} /> On a call</b></div>
          <div className="num" style={{ fontSize: 26, fontWeight: 700 }}>{prettyPhone(dialer.phone)}</div>
          {dialer.lead?.name && <div className="muted">{dialer.lead.name}{dialer.lead.state ? ` · ${dialer.lead.state}` : ""}{dialer.lead.zip ? ` ${dialer.lead.zip}` : ""}</div>}
          {dialer.contact?.lastNote && <div className="small muted">Last note: {dialer.contact.lastNote.text}</div>}
        </section>
      )}

      <section className="panel stack" style={{ gap: 10 }}>
        <h2 style={{ fontSize: 15 }}><Clock size={15} /> US time right now</h2>
        <div className="usclock">
          {US_ZONES.map(([lbl, tz]) => (
            <div key={lbl} className={"usclock-z" + (okToCall(tz) ? " ok" : " no")}>
              <span className="z">{lbl}</span><b className="num">{fmt(tz)}</b><span className="small">{okToCall(tz) ? "OK to call" : "too early/late"}</span>
            </div>
          ))}
        </div>
      </section>

      {notice && (
        <section className="panel stack notice-card" style={{ gap: 6 }}>
          <b className="row" style={{ gap: 6 }}><Megaphone size={15} /> Notice from your admin</b>
          <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{notice}</p>
        </section>
      )}

      <section className="panel quote-card">
        <Sparkles size={16} />
        <p>{quote}</p>
      </section>
    </div>
  );
}
