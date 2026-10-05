"use client";
// Modo phone: a browser phone (WebRTC, JsSIP) signed in to your VICIdial as your phone login.
// The only permission it needs is the microphone. When you log into VICIdial, the dialer rings this
// phone and Modo answers by itself, so every call happens right here in Modo.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Phone, PhoneOff, PhoneIncoming, Mic, MicOff, Grid3x3, X, RefreshCw } from "lucide-react";

const Ctx = createContext(null);
export const useSoftphone = () => useContext(Ctx);
const clean = (n) => String(n || "").replace(/[^\d*#+]/g, "");
const fmt = (n) => { const d = String(n || "").replace(/\D/g, "").slice(-10); return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : n || ""; };
const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function SoftphoneProvider({ children }) {
  const [cfg, setCfg] = useState(null);           // settings from /api/softphone
  const [reg, setReg] = useState("off");           // off | connecting | registered | failed
  const [regError, setRegError] = useState("");
  const [call, setCall] = useState(null);          // { dir, number, state, at, muted }
  const [mic, setMic] = useState("unknown");       // unknown | granted | denied
  const ua = useRef(null); const sess = useRef(null); const audio = useRef(null); const cfgRef = useRef(null);

  const attachAudio = (session) => {
    const hook = (pc) => pc && pc.addEventListener("track", (e) => { if (audio.current && e.streams?.[0]) { audio.current.srcObject = e.streams[0]; audio.current.play().catch(() => {}); } });
    hook(session.connection);
    session.on("peerconnection", (e) => hook(e.peerconnection));
  };
  const opts = () => ({ mediaConstraints: { audio: true, video: false }, pcConfig: { iceServers: cfgRef.current?.iceServers || [] }, rtcOfferConstraints: { offerToReceiveAudio: true, offerToReceiveVideo: false } });

  const watch = useCallback((session, dir, number) => {
    sess.current = session;
    setCall({ dir, number, state: dir === "in" ? "ringing" : "calling", at: null, muted: false });
    attachAudio(session);
    session.on("progress", () => setCall((c) => c && { ...c, state: dir === "in" ? "ringing" : "ringing-out" }));
    session.on("accepted", () => setCall((c) => c && { ...c, state: "active", at: Date.now() }));
    session.on("confirmed", () => setCall((c) => c && { ...c, state: "active", at: c.at || Date.now() }));
    const done = (e) => { sess.current = null; setCall((c) => c && { ...c, state: "ended", cause: e?.cause }); setTimeout(() => setCall((c) => (c?.state === "ended" ? null : c)), 2500); };
    session.on("ended", done); session.on("failed", done);
  }, []);

  const start = useCallback(async () => {
    const r = await fetch("/api/softphone", { cache: "no-store" }).then((x) => x.json()).catch(() => null);
    if (!r || r.off || r.setup || r.error) { setCfg(r); setReg("off"); return; }
    setCfg(r); cfgRef.current = r;
    try { const p = await navigator.permissions?.query({ name: "microphone" }); if (p) { setMic(p.state); p.onchange = () => setMic(p.state); } } catch {}
    const JsSIP = (await import("jssip")).default;
    JsSIP.debug.disable("JsSIP:*");
    try { ua.current?.stop(); } catch {}
    setReg("connecting"); setRegError("");
    const socket = new JsSIP.WebSocketInterface(r.wss);
    const agent = new JsSIP.UA({ sockets: [socket], uri: `sip:${r.user}@${r.domain}`, password: r.pass, display_name: r.name, register: true, session_timers: false, register_expires: 300, connection_recovery_min_interval: 3, connection_recovery_max_interval: 30 });
    agent.on("registered", () => { setReg("registered"); setRegError(""); });
    agent.on("unregistered", () => setReg("off"));
    agent.on("registrationFailed", (e) => { setReg("failed"); setRegError(e.cause === "Authentication Error" ? "Wrong phone login or password (Dialer setup → Modo phone)." : `Couldn't sign in the phone: ${e.cause || "no answer"}`); });
    agent.on("disconnected", () => { setReg((x) => (x === "registered" ? "connecting" : x)); setRegError((m) => m || `Can't reach ${r.wss}. If it's a certificate problem, open https://${r.domain}:8089/httpstatus once and accept it.`); });
    agent.on("connected", () => setRegError(""));
    agent.on("newRTCSession", ({ session, originator, request }) => {
      if (originator !== "remote") return;
      if (sess.current) { session.terminate({ status_code: 486 }); return; } // already on a call
      const from = request?.from?.display_name || request?.from?.uri?.user || "";
      watch(session, "in", from);
      // VICIdial rings this phone when you log in / for each call: answer by itself
      if (cfgRef.current?.autoAnswer) setTimeout(() => { try { session.answer(opts()); } catch {} }, 300);
    });
    agent.start(); ua.current = agent;
  }, [watch]);

  useEffect(() => { start(); return () => { try { ua.current?.stop(); } catch {} }; }, [start]);

  const askMic = async () => { try { const st = await navigator.mediaDevices.getUserMedia({ audio: true }); st.getTracks().forEach((t) => t.stop()); setMic("granted"); return true; } catch { setMic("denied"); return false; } };
  const dial = async (number) => {
    const n = clean(number); if (!ua.current || reg !== "registered") throw new Error("Modo phone isn't connected yet.");
    if (sess.current) throw new Error("You're already on a call.");
    const d = n.replace(/\D/g, "");
    const target = (d.length === 10 ? (cfgRef.current.prefix || "") + "1" + d : (cfgRef.current.prefix || "") + n);
    const session = ua.current.call(`sip:${target}@${cfgRef.current.domain}`, opts());
    watch(session, "out", n);
    return session;
  };
  const answer = () => { try { sess.current?.answer(opts()); } catch {} };
  const hangup = () => { try { sess.current?.terminate(); } catch {} };
  const mute = () => { const s = sess.current; if (!s) return; const m = s.isMuted().audio; m ? s.unmute({ audio: true }) : s.mute({ audio: true }); setCall((c) => c && { ...c, muted: !m }); };
  const dtmf = (k) => { try { sess.current?.sendDTMF(k); } catch {} };

  return (
    <Ctx.Provider value={{ cfg, reg, regError, call, mic, askMic, dial, answer, hangup, mute, dtmf, restart: start }}>
      {children}
      <audio ref={audio} autoPlay playsInline hidden />
      <CallBar />
    </Ctx.Provider>
  );
}

// Small bar on every page while a call is ringing or live
function CallBar() {
  const p = useSoftphone(); const [now, setNow] = useState(Date.now()); const [keys, setKeys] = useState(false);
  useEffect(() => { if (!p?.call) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [p?.call]);
  if (!p?.call) return null;
  const c = p.call; const secs = c.at ? Math.floor((now - c.at) / 1000) : 0;
  const label = c.state === "active" ? clock(secs) : c.state === "ended" ? "Call ended" : c.dir === "in" ? "Incoming call…" : "Calling…";
  return (
    <div className={"sp-bar " + c.state} role="status">
      <span className="sp-ic">{c.dir === "in" ? <PhoneIncoming size={16} /> : <Phone size={16} />}</span>
      <div className="sp-who"><b>{fmt(c.number) || (c.dir === "in" ? "Dialer" : "")}</b><span className="num">{label}</span></div>
      {c.state === "ringing" && c.dir === "in" && <button className="sp-btn ok" onClick={p.answer} aria-label="Answer"><Phone size={16} /></button>}
      {c.state === "active" && <button className={"sp-btn" + (c.muted ? " on" : "")} onClick={p.mute} aria-label={c.muted ? "Unmute" : "Mute"}>{c.muted ? <MicOff size={16} /> : <Mic size={16} />}</button>}
      {c.state === "active" && <button className={"sp-btn" + (keys ? " on" : "")} onClick={() => setKeys(!keys)} aria-label="Keypad"><Grid3x3 size={16} /></button>}
      {c.state !== "ended" && <button className="sp-btn bad" onClick={p.hangup} aria-label="Hang up"><PhoneOff size={16} /></button>}
      {keys && c.state === "active" && <div className="sp-keys">{["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"].map((k) => <button key={k} onClick={() => p.dtmf(k)}>{k}</button>)}<button onClick={() => setKeys(false)} aria-label="Close keypad"><X size={14} /></button></div>}
    </div>
  );
}

// Status chip + fixes, used on the dialer pages
export function PhoneStatus() {
  const p = useSoftphone();
  if (!p) return null;
  if (!p.cfg || p.cfg.off) return null;
  if (p.cfg.setup) return <div className="sp-status warn"><Phone size={14} /> Modo phone: {p.cfg.setup}</div>;
  const st = { registered: ["ok", `Modo phone ready · ${p.cfg.user}`], connecting: ["warn", "Modo phone connecting…"], failed: ["bad", "Modo phone not connected"], off: ["warn", "Modo phone off"] }[p.reg] || ["warn", p.reg];
  return (
    <div className={"sp-status " + st[0]}>
      <span className="sp-dot" /> <b>{st[1]}</b>
      {p.mic !== "granted" && <button className="ghost sm" onClick={p.askMic}><Mic size={13} /> {p.mic === "denied" ? "Microphone blocked: allow it in the address bar" : "Allow microphone"}</button>}
      {p.reg !== "registered" && <button className="ghost sm" onClick={p.restart}><RefreshCw size={13} /> Retry</button>}
      {p.regError && <span className="small">{p.regError}</span>}
    </div>
  );
}
