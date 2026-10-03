"use client";
// Built-in free tools — no API keys, no connectors, nothing to install. Everything runs in the browser
// (ZIP lookup uses the free, keyless zippopotam.us service and fails gracefully if offline).
import { useEffect, useMemo, useRef, useState } from "react";
import { Phone, MapPin, Clock, Calculator, Timer, SpellCheck, CalendarDays, Type, KeyRound, Copy, Check, Play, Pause, RotateCcw } from "lucide-react";
import UsClocks, { US_ZONES } from "./UsClocks";
import { areaInfo, tzFor, STATE_NAMES } from "@/lib/usdata";

const TOOLS = [
  ["phone", "Number check", Phone], ["zip", "ZIP code", MapPin], ["time", "Time zones", Clock], ["calc", "Calculator", Calculator],
  ["timer", "Call timer", Timer], ["spell", "Phonetic", SpellCheck], ["date", "Age & dates", CalendarDays], ["text", "Text fix", Type], ["pin", "PIN / ref #", KeyRound],
];

function CopyBtn({ text }) {
  const [ok, setOk] = useState(false);
  return <button className="ghost sm" onClick={async () => { try { await navigator.clipboard.writeText(text); setOk(true); setTimeout(() => setOk(false), 1100); } catch {} }} title="Copy">{ok ? <Check size={13} /> : <Copy size={13} />}</button>;
}

export default function ToolsPanel() {
  const [tool, setTool] = useState("phone");
  useEffect(() => { try { const t = localStorage.getItem("modo-tool"); if (t) setTool(t); } catch {} }, []);
  const pick = (t) => { setTool(t); try { localStorage.setItem("modo-tool", t); } catch {} };
  return (
    <div className="ft">
      <nav className="ft-tabs" role="tablist">
        {TOOLS.map(([k, l, I]) => <button key={k} role="tab" aria-selected={tool === k} className={tool === k ? "on" : ""} onClick={() => pick(k)}><I size={14} /><span>{l}</span></button>)}
      </nav>
      <div className="ft-body">
        {tool === "phone" && <PhoneTool />}
        {tool === "zip" && <ZipTool />}
        {tool === "time" && <TimeTool />}
        {tool === "calc" && <CalcTool />}
        {tool === "timer" && <TimerTool />}
        {tool === "spell" && <SpellTool />}
        {tool === "date" && <DateTool />}
        {tool === "text" && <TextTool />}
        {tool === "pin" && <PinTool />}
      </div>
    </div>
  );
}

// 1) US phone number: format, area code → state, time zone, local time, OK to call
function PhoneTool() {
  const [v, setV] = useState("");
  const d = v.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  const ok = d.length === 10;
  const ac = d.slice(0, 3);
  const info = d.length >= 3 ? areaInfo(ac) : null;
  const tz = info?.state ? tzFor(info.state) : null;
  const fmt = ok ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : "";
  const badNxx = ok && (/^[01]/.test(d.slice(3)) || /^[01]/.test(d));
  return (
    <div className="stack">
      <label>Phone number<input value={v} onChange={(e) => setV(e.target.value)} placeholder="e.g. 212 555 0142 or +1 (305) 555-0199" inputMode="tel" autoFocus /></label>
      {d.length >= 3 && (
        <div className="ft-card">
          {info?.tollFree ? <p style={{ margin: 0 }}><b>Toll-free number</b> — no location.</p>
            : info ? <>
              <div className="ft-kv"><span>State</span><b>{info.stateName} ({info.state})</b></div>
              {tz && <><div className="ft-kv"><span>Time zone</span><b>{tz.zone}</b></div>
                <div className="ft-kv"><span>Their time</span><b>{tz.local}</b></div>
                <div className="ft-kv"><span>Calling</span><b className={tz.callable ? "ok-t" : "bad-t"}>{tz.callable ? "OK to call (8 AM–9 PM)" : "Quiet hours — don't call now"}</b></div>
                {tz.note && <p className="muted small" style={{ margin: 0 }}>Note: {tz.note}.</p>}</>}
            </> : <p className="muted small" style={{ margin: 0 }}>Area code {ac} isn't a known US area code.</p>}
          {ok && <div className="ft-kv"><span>Formatted</span><b>{fmt} <CopyBtn text={fmt} /></b></div>}
          {ok && <div className="ft-kv"><span>E.164</span><b>+1{d} <CopyBtn text={"+1" + d} /></b></div>}
          {badNxx && <p className="err small" style={{ margin: 0 }}>This doesn't look like a valid US number (area code and exchange can't start with 0 or 1).</p>}
          {!ok && d.length > 3 && <p className="muted small" style={{ margin: 0 }}>{10 - d.length > 0 ? `${10 - d.length} more digit${10 - d.length > 1 ? "s" : ""} needed.` : "Too many digits for a US number."}</p>}
        </div>
      )}
    </div>
  );
}

// 2) ZIP → city/state (free keyless API) + time zone
function ZipTool() {
  const [zip, setZip] = useState(""); const [r, setR] = useState(null); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!/^\d{5}$/.test(zip)) { setR(null); return; }
    let on = true; setBusy(true);
    fetch(`https://api.zippopotam.us/us/${zip}`).then((x) => (x.ok ? x.json() : null)).then((d) => {
      if (!on) return; setBusy(false);
      if (!d) return setR({ err: "No US place has that ZIP code." });
      const p = d.places?.[0] || {}; const st = p["state abbreviation"];
      setR({ city: p["place name"], state: st, stateName: p.state, lat: p.latitude, lng: p.longitude, tz: st ? tzFor(st) : null, more: (d.places || []).slice(1).map((x) => x["place name"]) });
    }).catch(() => { if (on) { setBusy(false); setR({ err: "Couldn't reach the free ZIP service. Check the internet connection." }); } });
    return () => { on = false; };
  }, [zip]);
  return (
    <div className="stack">
      <label>ZIP code<input value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))} placeholder="5 digits, e.g. 10001" inputMode="numeric" /></label>
      {busy && <p className="muted small">Looking up…</p>}
      {r?.err && <p className="err small">{r.err}</p>}
      {r && !r.err && (
        <div className="ft-card">
          <div className="ft-kv"><span>City</span><b>{r.city}</b></div>
          <div className="ft-kv"><span>State</span><b>{r.stateName} ({r.state})</b></div>
          {r.tz && <><div className="ft-kv"><span>Time zone</span><b>{r.tz.zone}</b></div><div className="ft-kv"><span>Their time</span><b>{r.tz.local}</b></div>
            <div className="ft-kv"><span>Calling</span><b className={r.tz.callable ? "ok-t" : "bad-t"}>{r.tz.callable ? "OK to call" : "Quiet hours"}</b></div></>}
          {r.more?.length > 0 && <p className="muted small" style={{ margin: 0 }}>Also: {r.more.join(", ")}</p>}
          <a className="small" href={`https://www.openstreetmap.org/?mlat=${r.lat}&mlon=${r.lng}#map=12/${r.lat}/${r.lng}`} target="_blank" rel="noreferrer">Open on map ↗</a>
        </div>
      )}
    </div>
  );
}

// 3) Time zones: live US clocks + converter from your time to US zones
function TimeTool() {
  const [t, setT] = useState("");
  useEffect(() => { const n = new Date(); setT(`${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`); }, []);
  const at = useMemo(() => { if (!t) return null; const [h, m] = t.split(":").map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return d; }, [t]);
  const mine = typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "";
  return (
    <div className="stack">
      <UsClocks compact />
      <label>If it's this time for me ({mine})<input type="time" value={t} onChange={(e) => setT(e.target.value)} /></label>
      {at && <div className="ft-card">{US_ZONES.map((z) => {
        const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: z.tz, hour: "numeric", hourCycle: "h23" }).format(at));
        return <div key={z.tz} className="ft-kv"><span>{z.label}</span><b className={h >= 8 && h < 21 ? "ok-t" : "bad-t"}>{at.toLocaleTimeString("en-US", { timeZone: z.tz, hour: "numeric", minute: "2-digit", weekday: "short" })}</b></div>;
      })}</div>}
    </div>
  );
}

// 4) Calculator with % discount helper — safe parser, no eval
function calc(expr) {
  const s = expr.replace(/[×x]/g, "*").replace(/÷/g, "/").replace(/,/g, "").replace(/\s+/g, "");
  if (!s) return "";
  if (!/^[\d.+\-*/()%]+$/.test(s)) return NaN;
  let i = 0;
  const num = () => { let st = i; while (/[\d.]/.test(s[i] || "")) i++; const n = parseFloat(s.slice(st, i)); if (isNaN(n)) throw 0; if (s[i] === "%") { i++; return n / 100; } return n; };
  const fac = () => { if (s[i] === "-") { i++; return -fac(); } if (s[i] === "+") { i++; return fac(); } if (s[i] === "(") { i++; const v = add(); if (s[i] !== ")") throw 0; i++; return v; } return num(); };
  const mul = () => { let v = fac(); while (s[i] === "*" || s[i] === "/") { const o = s[i++]; const r = fac(); v = o === "*" ? v * r : v / r; } return v; };
  const add = () => { let v = mul(); while (s[i] === "+" || s[i] === "-") { const o = s[i++]; const r = mul(); v = o === "+" ? v + r : v - r; } return v; };
  try { const v = add(); if (i !== s.length) return NaN; return v; } catch { return NaN; }
}
function CalcTool() {
  const [e, setE] = useState(""); const [price, setPrice] = useState(""); const [pct, setPct] = useState("30");
  const v = calc(e); const shown = v === "" ? "" : Number.isFinite(v) ? Number(v.toFixed(6)).toLocaleString("en-US", { maximumFractionDigits: 6 }) : "—";
  const p = parseFloat(price) || 0, pc = parseFloat(pct) || 0, save = (p * pc) / 100;
  const keys = ["7", "8", "9", "/", "4", "5", "6", "*", "1", "2", "3", "-", "0", ".", "%", "+"];
  return (
    <div className="stack">
      <div className="ft-card">
        <input className="ft-calc-in" value={e} onChange={(x) => setE(x.target.value)} onKeyDown={(x) => x.key === "Enter" && Number.isFinite(v) && setE(String(Number(v.toFixed(6))))} placeholder="e.g. 129.99*12 or (80-20)/3" />
        <div className="ft-calc-out num">{shown}</div>
        <div className="ft-keys">{keys.map((k) => <button key={k} className="ghost sm" onClick={() => setE((x) => x + k)}>{k}</button>)}
          <button className="ghost sm" onClick={() => setE("")}>C</button><button className="ghost sm" onClick={() => setE((x) => x.slice(0, -1))}>⌫</button>
          <button className="ghost sm" onClick={() => setE((x) => x + "(")}>(</button><button className="ghost sm" onClick={() => setE((x) => x + ")")}>)</button></div>
      </div>
      <div className="ft-card">
        <b className="small">Discount</b>
        <div className="row" style={{ gap: 8 }}><label style={{ flex: 1 }}>Bill $<input value={price} onChange={(x) => setPrice(x.target.value)} inputMode="decimal" placeholder="120" /></label><label style={{ width: 90 }}>Off %<input value={pct} onChange={(x) => setPct(x.target.value)} inputMode="decimal" /></label></div>
        {p > 0 && <><div className="ft-kv"><span>They save</span><b>${save.toFixed(2)}/mo · ${(save * 12).toFixed(2)}/yr</b></div><div className="ft-kv"><span>New bill</span><b className="ok-t">${(p - save).toFixed(2)}/mo</b></div></>}
      </div>
    </div>
  );
}

// 5) Call timer with laps
function TimerTool() {
  const [run, setRun] = useState(false); const [ms, setMs] = useState(0); const [laps, setLaps] = useState([]);
  const start = useRef(0);
  useEffect(() => { if (!run) return; start.current = Date.now() - ms; const t = setInterval(() => setMs(Date.now() - start.current), 250); return () => clearInterval(t); }, [run]); // eslint-disable-line
  const f = (x) => { const s = Math.floor(x / 1000); return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; };
  return (
    <div className="stack" style={{ alignItems: "center" }}>
      <div className="ft-timer num">{f(ms)}</div>
      <div className="row" style={{ gap: 8 }}>
        <button onClick={() => setRun((r) => !r)}>{run ? <><Pause size={14} /> Pause</> : <><Play size={14} /> {ms ? "Resume" : "Start"}</>}</button>
        <button className="ghost" disabled={!ms} onClick={() => setLaps((l) => [f(ms), ...l].slice(0, 20))}>Lap</button>
        <button className="ghost" onClick={() => { setRun(false); setMs(0); setLaps([]); }}><RotateCcw size={14} /> Reset</button>
      </div>
      {laps.length > 0 && <div className="ft-card" style={{ width: "100%" }}>{laps.map((l, i) => <div key={i} className="ft-kv"><span>Lap {laps.length - i}</span><b className="num">{l}</b></div>)}</div>}
    </div>
  );
}

// 6) NATO phonetic speller — for spelling names, emails and confirmation numbers
const NATO = { A: "Alpha", B: "Bravo", C: "Charlie", D: "Delta", E: "Echo", F: "Foxtrot", G: "Golf", H: "Hotel", I: "India", J: "Juliett", K: "Kilo", L: "Lima", M: "Mike", N: "November", O: "Oscar", P: "Papa", Q: "Quebec", R: "Romeo", S: "Sierra", T: "Tango", U: "Uniform", V: "Victor", W: "Whiskey", X: "X-ray", Y: "Yankee", Z: "Zulu",
  0: "Zero", 1: "One", 2: "Two", 3: "Three", 4: "Four", 5: "Five", 6: "Six", 7: "Seven", 8: "Eight", 9: "Nine", "@": "at", ".": "dot", "-": "dash", _: "underscore", " ": "(space)" };
function SpellTool() {
  const [v, setV] = useState("");
  const out = [...v.toUpperCase()].map((c) => NATO[c] || c);
  return (
    <div className="stack">
      <label>Spell this out<input value={v} onChange={(e) => setV(e.target.value)} placeholder="Name, email or reference number" /></label>
      {v && <div className="ft-card"><div className="ft-spell">{out.map((w, i) => <span key={i}>{w}</span>)}</div><div className="row" style={{ justifyContent: "flex-end" }}><CopyBtn text={out.join(" ")} /></div></div>}
    </div>
  );
}

// 7) Age from date of birth + days between dates
function DateTool() {
  const [dob, setDob] = useState(""); const [a, setA] = useState(""); const [b, setB] = useState("");
  const age = useMemo(() => { if (!dob) return null; const d = new Date(dob + "T00:00"), n = new Date(); let y = n.getFullYear() - d.getFullYear(); const m = n.getMonth() - d.getMonth(); if (m < 0 || (m === 0 && n.getDate() < d.getDate())) y--; return y; }, [dob]);
  const days = a && b ? Math.round((new Date(b + "T00:00") - new Date(a + "T00:00")) / 86400000) : null;
  return (
    <div className="stack">
      <div className="ft-card"><label>Date of birth<input type="date" value={dob} onChange={(e) => setDob(e.target.value)} /></label>
        {age != null && <div className="ft-kv"><span>Age</span><b className={age >= 18 ? "ok-t" : "bad-t"}>{age} years {age >= 18 ? "· adult" : "· under 18"}</b></div>}</div>
      <div className="ft-card"><div className="row" style={{ gap: 8 }}><label style={{ flex: 1 }}>From<input type="date" value={a} onChange={(e) => setA(e.target.value)} /></label><label style={{ flex: 1 }}>To<input type="date" value={b} onChange={(e) => setB(e.target.value)} /></label></div>
        {days != null && <div className="ft-kv"><span>Difference</span><b>{days} days · {(days / 7).toFixed(1)} weeks</b></div>}</div>
    </div>
  );
}

// 8) Text fixer — cleanup and case
function TextTool() {
  const [v, setV] = useState("");
  const ops = [["Trim spaces", (s) => s.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim()], ["UPPER", (s) => s.toUpperCase()], ["lower", (s) => s.toLowerCase()],
    ["Title Case", (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())], ["Digits only", (s) => s.replace(/\D/g, "")], ["Remove lines", (s) => s.replace(/\s*\n\s*/g, " ")]];
  return (
    <div className="stack">
      <textarea rows={6} value={v} onChange={(e) => setV(e.target.value)} placeholder="Paste text, addresses, names…" />
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>{ops.map(([l, f]) => <button key={l} className="ghost sm" onClick={() => setV(f(v))}>{l}</button>)}<CopyBtn text={v} /></div>
      <p className="muted small" style={{ margin: 0 }}>{v.length} characters · {v.trim() ? v.trim().split(/\s+/).length : 0} words</p>
    </div>
  );
}

// 9) Random PIN / reference number (crypto-strong)
function PinTool() {
  const [len, setLen] = useState(6); const [kind, setKind] = useState("digits"); const [out, setOut] = useState("");
  const gen = () => {
    const sets = { digits: "0123456789", ref: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789", strong: "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*?" };
    const set = sets[kind]; const r = new Uint32Array(len); crypto.getRandomValues(r);
    setOut([...r].map((x) => set[x % set.length]).join(""));
  };
  return (
    <div className="stack">
      <div className="row" style={{ gap: 8 }}>
        <label style={{ flex: 1 }}>Type<select value={kind} onChange={(e) => setKind(e.target.value)}><option value="digits">PIN (digits)</option><option value="ref">Reference # (letters + digits)</option><option value="strong">Strong password</option></select></label>
        <label style={{ width: 90 }}>Length<input type="number" min={4} max={32} value={len} onChange={(e) => setLen(Math.max(4, Math.min(32, Number(e.target.value) || 6)))} /></label>
      </div>
      <button onClick={gen}><KeyRound size={14} /> Generate</button>
      {out && <div className="ft-card row" style={{ justifyContent: "space-between" }}><b className="num" style={{ fontSize: 20, letterSpacing: ".08em", wordBreak: "break-all" }}>{out}</b><CopyBtn text={out} /></div>}
    </div>
  );
}
