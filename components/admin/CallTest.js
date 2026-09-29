"use client";
// Real WebRTC connectivity test: gathers ICE candidates with the configured servers and reports
// whether a TURN *relay* candidate is obtained — the thing that makes call audio work across networks.
import { useState } from "react";
import { PhoneCall, CheckCircle2, XCircle, Loader2 } from "lucide-react";

export default function CallTest() {
  const [s, setS] = useState(null); // {running, host, srflx, relay, relayCount, done, err}
  async function run() {
    setS({ running: true, host: false, srflx: false, relay: false, relayCount: 0 });
    if (typeof RTCPeerConnection === "undefined") return setS({ err: "This browser doesn't support calls. Use Chrome, Edge or Safari (not an in-app browser)." });
    let ice;
    try { ice = await fetch("/api/huddle/ice").then((r) => r.json()); } catch { return setS({ err: "Couldn't load call settings." }); }
    let pc;
    try { pc = new RTCPeerConnection({ iceServers: ice.iceServers || [] }); }
    catch {
      // The configured TURN/STUN address is invalid — the constructor rejected it. Prove the browser itself is fine.
      try { const t = new RTCPeerConnection(); t.close(); return setS({ err: "Your call server address is invalid — check Tools → Connectors → TURN. Each URL must start with turn: or turns: (e.g. turn:relay.metered.ca:80)." }); }
      catch { return setS({ err: "This browser can't make calls (WebRTC blocked). Try Chrome/Edge/Safari, not an in-app browser." }); }
    }
    const found = { host: false, srflx: false, relay: false, relayCount: 0 };
    let done = false;
    const finish = () => { if (done) return; done = true; try { pc.close(); } catch {} setS({ ...found, done: true, running: false }); };
    pc.onicecandidate = (e) => {
      if (!e.candidate) return finish();
      const type = e.candidate.type || (String(e.candidate.candidate).match(/typ (\w+)/)?.[1]);
      if (type === "host") found.host = true; else if (type === "srflx") found.srflx = true; else if (type === "relay") { found.relay = true; found.relayCount++; }
      setS((x) => ({ ...x, ...found }));
    };
    try { pc.createDataChannel("t"); const o = await pc.createOffer(); await pc.setLocalDescription(o); }
    catch { return setS({ err: "Couldn't start the test." }); }
    setTimeout(finish, 9000);
  }
  const Row = ({ ok, label, sub }) => (
    <div className="row" style={{ gap: 8 }}>{ok ? <CheckCircle2 size={16} style={{ color: "var(--green,#34d399)" }} /> : <XCircle size={16} style={{ color: "var(--amber,#ffb070)" }} />}<span><b>{label}</b>{sub && <span className="muted small" style={{ display: "block" }}>{sub}</span>}</span></div>
  );
  return (
    <section className="panel stack">
      <div className="row" style={{ justifyContent: "space-between" }}><h2><PhoneCall size={17} /> Test call connection</h2>
        <button className="ghost sm" onClick={run} disabled={s?.running}>{s?.running ? <><Loader2 size={13} className="spin" /> Testing…</> : "Run test"}</button></div>
      <p className="muted small" style={{ margin: 0 }}>Checks whether Modo's voice calls (huddles &amp; listen-in) can actually carry audio across networks. If there's "no voice", this tells you why.</p>
      {s?.err && <div className="err">{s.err}</div>}
      {s && !s.err && (s.running || s.done) && (
        <div className="stack" style={{ gap: 8 }}>
          <Row ok={s.host} label="Your device" sub="microphone/network reachable" />
          <Row ok={s.srflx} label="STUN (find your address)" sub="works on the same network" />
          <Row ok={s.relay} label={`TURN relay${s.relayCount ? ` (${s.relayCount})` : ""}`} sub="required for audio across different networks / mobile data" />
          {s.done && (
            s.relay
              ? <div className="receipt">✓ Your relay works — calls should have two-way audio on any network.</div>
              : <div className="err" style={{ margin: 0 }}>No TURN relay candidate. This is why calls are silent across networks. Add a TURN server in <b>Tools → Connectors → TURN</b> (your Metered free-tier URL, username and password). Paste <b>all</b> the URLs it gives you, comma-separated (the :80, :443 and TCP/TLS ones), so strict networks still connect.</div>
          )}
        </div>
      )}
    </section>
  );
}
