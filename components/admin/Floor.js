"use client";
// Admin overview: live floor at a glance, live calls with subtitles + AI, dialer, recent calls, leaderboard.
import { useState, useRef } from "react";
import Link from "next/link";
import { usePoll, api } from "./api";
import { dur } from "@/lib/fmt";
import { Sparkles, PhoneCall, Radio, Coffee, Moon, Trophy, History, RefreshCw, HelpCircle, PhoneOff, Headphones, Ear, Mic, Square } from "lucide-react";
import ShiftEndRequests from "./ShiftEndRequests";
import { startListening } from "@/components/listen";

const lines = (t) => (t || "").split("\n").filter(Boolean).map((l) => (l.startsWith("C: ") ? { who: "C", text: l.slice(3) } : { who: "A", text: l.startsWith("A: ") ? l.slice(3) : l }));
const mins = (a, b) => Math.max(0, Math.round(((b ? new Date(b) : Date.now()) - new Date(a)) / 1000));
const WHO = { agent: "Agent confused", customer: "Customer confused", both: "Both confused" };
const ENDED = { customer: "Customer hung up", agent: "Agent ended", unknown: "Unknown" };

export default function Floor() {
  const [sess] = usePoll("/api/sessions", 3000);
  const [pres] = usePoll("/api/presence", 15000);
  const [vici, reloadVici] = usePoll("/api/vicidial", 10000);
  const [recs] = usePoll("/api/vicidial/recordings", 60000);
  const [board] = usePoll("/api/leaderboard", 20000);
  const [brief, setBrief] = useState(null); const [briefing, setBriefing] = useState(false);
  const [phoneMsg, setPhoneMsg] = useState(null);
  // Listening = VICIdial blind monitor: your desk phone rings and VICIdial bridges you into the agent's live call.
  const viciListen = async (body) => { setPhoneMsg({ busy: true, text: "Asking VICIdial to ring your phone…" }); const r = await api("/api/vicidial/monitor", "POST", body); setPhoneMsg(r.ok ? { text: r.data.message } : { err: r.data.error }); };
  const all = sess.data || []; const live = all.filter((s) => !s.endedAt); const done = all.filter((s) => s.endedAt);
  // Live mic listen (off-call, through Modo's own relay — not VICIdial)
  const [micOn, setMicOn] = useState(null); const [micMsg, setMicMsg] = useState(""); const micCtl = useRef(null); const micAudio = useRef(null);
  const stopMic = async () => { try { await micCtl.current?.close(); } catch {} micCtl.current = null; setMicOn(null); if (micAudio.current) micAudio.current.srcObject = null; };
  const listenMic = async (a) => {
    await stopMic(); setMicMsg(""); setMicOn({ id: a.id, name: a.name, connecting: true });
    try {
      micCtl.current = await startListening({ agentId: a.id }, (who, st) => { if (micAudio.current) { micAudio.current.srcObject = st; micAudio.current.play?.().catch(() => {}); } setMicOn((m) => m && { ...m, connecting: false }); }, () => setMicOn(null));
    } catch (e) { setMicMsg(e.message || "Couldn't start listening."); setMicOn(null); }
  };
  const viciConnected = vici.data && !vici.error && (vici.data.provider === "vicidial" || vici.data.agents);
  const viciCalls = (recs.data?.rows || []); // real finished calls from the dialer (recordings)
  const p = pres.data || []; const count = (st) => p.filter((x) => st.includes(x.status)).length;
  async function getBrief() { setBriefing(true); const r = await api("/api/floor-ai", "POST"); setBriefing(false); setBrief(r.ok ? r.data.text : r.data.error || "AI couldn't summarise right now."); }

  return (
    <div className="floor">
      <ShiftEndRequests compact />
      <div className="floor-kpis">
        <div><PhoneCall size={16} /><b>{live.length}</b><span>on calls now</span></div>
        <div><Radio size={16} /><b>{count(["working", "remote"])}</b><span>working</span></div>
        <div><Coffee size={16} /><b>{count(["on break"])}</b><span>on break</span></div>
        <div><Moon size={16} /><b>{count(["idle", "away", "busy"])}</b><span>idle / away</span></div>
        <div><PhoneOff size={16} /><b>{done.filter((s) => s.endedBy === "customer").length}</b><span>customer hang-ups (12h)</span></div>
      </div>

      <section className="panel stack floor-ai">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2><Sparkles size={17} /> Floor summary</h2>
          <button className="ghost sm" onClick={getBrief} disabled={briefing}><Sparkles size={13} /> {briefing ? "Thinking…" : brief ? "Refresh" : "Summarise the floor"}</button>
        </div>
        {brief ? <div className="brief">{brief.split("\n").filter(Boolean).map((l, i) => <p key={i}>{l.replace(/^[-*•]\s*/, "")}</p>)}</div>
          : <p className="muted small" style={{ margin: 0 }}>Modo AI reads the dialer, every live call and the last few hours of calls, and tells you who needs help.</p>}
      </section>

      {phoneMsg && <div className={phoneMsg.err ? "err" : "receipt"} style={{ margin: 0 }}><Ear size={14} /> {phoneMsg.err || phoneMsg.text}</div>}

      <section className="stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 className="sec-h"><PhoneCall size={17} /> Live calls <span className="muted small">{live.length ? "subtitles update every few seconds" : ""}</span></h2>
        </div>
        {!live.length ? <div className="panel muted">No one is on a call with live assist right now.</div> : (
          <div className="live-grid">
            {live.map((s) => {
              const L = lines(s.transcript).slice(-4);
              return (
                <article key={s.id} className="panel live-card">
                  <header className="row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
                    <div className="row" style={{ gap: 8, minWidth: 0 }}><span className="live-dot" /><b className="ellipsis">{s.user.name}</b><span className="muted small num">{dur(mins(s.startedAt))}</span></div>
                    <div className="row" style={{ gap: 4 }}>
                      {s.confused && s.confused !== "none" && <span className="chip late" title={s.confusedNote || ""}><HelpCircle size={11} /> {WHO[s.confused]}</span>}
                      {s.mood && s.mood !== "unknown" && <span className={"chip " + (s.mood === "interested" ? "ok" : s.mood === "annoyed" ? "red" : "")}>{s.mood}</span>}
                      <button className="ghost sm" onClick={() => viciListen({ userId: s.userId, stage: "MONITOR" })} title="VICIdial rings your phone and you hear both sides"><Headphones size={13} /> Listen</button>
                      <button className="ghost sm" onClick={() => viciListen({ userId: s.userId, stage: "WHISPER" })} title="Talk to the agent only; the customer can't hear you">Whisper</button>
                      <button className="ghost sm" onClick={() => viciListen({ userId: s.userId, stage: "BARGE" })} title="Join the call: both can hear you">Barge</button>
                    </div>
                  </header>
                  <div className="subs">{L.length ? L.map((l, i) => <p key={i} className={l.who === "C" ? "c" : "a"} style={{ opacity: 0.45 + (i + 1) / L.length * 0.55 }}><b>{l.who === "C" ? "Customer" : s.user.name.split(" ")[0]}</b>{l.text}</p>) : <p className="muted">Waiting for speech…</p>}</div>
                  {s.summary && <p className="live-sum"><Sparkles size={12} /> {s.summary}</p>}
                  {(s.agentNerv != null || s.custNerv != null) && (
                    <div className="mini-nerv">
                      <span>Agent <i><em style={{ width: (s.agentNerv || 0) + "%", background: s.agentNerv >= 60 ? "#ff4d5a" : s.agentNerv >= 35 ? "#ffb070" : "#7fd6a0" }} /></i> {s.agentState || ""}</span>
                      <span>Customer <i><em style={{ width: (s.custNerv || 0) + "%", background: s.custNerv >= 60 ? "#ff4d5a" : s.custNerv >= 35 ? "#ffb070" : "#7fd6a0" }} /></i> {s.customerState || ""}</span>
                    </div>
                  )}
                  {s.confusedNote && s.confused !== "none" && <p className="small" style={{ margin: 0, color: "#ffc79b" }}>{s.confusedNote}</p>}
                  <footer className="small muted">{s.customerSide ? "Both sides captioned" : "Agent's side only"}{s.lastTip ? ` · AI suggested: "${s.lastTip}"` : ""}</footer>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div className="two-col">
        <section className="panel stack">
          <div className="row" style={{ justifyContent: "space-between" }}><h2><Radio size={17} /> Dialer</h2><button className="ghost sm icon-btn" aria-label="Refresh" onClick={reloadVici}><RefreshCw size={13} /></button></div>
          {vici.data && (vici.data.monitorPhone
            ? <p className="small muted" style={{ margin: 0 }}><Ear size={12} /> Listening rings your phone <b>{vici.data.monitorPhone}</b> — keep that softphone/extension logged in to hear calls.</p>
            : <p className="small" style={{ margin: 0, color: "var(--amber)" }}><Ear size={12} /> No listen phone set. Add one in <Link href="/admin/connectors">Connectors → VICIdial → Monitor phone</Link> to listen to agents.</p>)}
          {vici.error ? <p className="muted small" style={{ margin: 0 }}>{vici.error} <Link href="/admin/connectors">Connect VICIdial</Link></p> : !vici.data ? <p className="muted">Checking…</p> : !vici.data.agents.length ? <p className="muted">No one is logged into the dialer.</p> : (
            <div className="dialer-list">{vici.data.agents.map((a, i) => (
              <div key={i}><span className={"dot " + String(a.status || "").toLowerCase()} /><b>{a.full_name || a.user || a.f0}</b><span className="chip">{a.status}</span><span className="muted small">{a.campaign_id || a.campaign || ""}</span><span className="muted small" style={{ marginLeft: "auto" }}>{a.calls_today ? a.calls_today + " calls" : ""}</span>
                {/INCALL|QUEUE|DIAL/i.test(a.status || "") && <span className="row" style={{ gap: 4 }}>
                  <button className="ghost sm" title="VICIdial rings your phone and you hear both sides" onClick={() => viciListen({ vicidialUser: a.user || a.f0, stage: "MONITOR" })}><Headphones size={12} /> Listen</button>
                  <button className="ghost sm" title="Talk to the agent only; the customer can't hear you" onClick={() => viciListen({ vicidialUser: a.user || a.f0, stage: "WHISPER" })}>Whisper</button>
                  <button className="ghost sm" title="Join the call: both can hear you" onClick={() => viciListen({ vicidialUser: a.user || a.f0, stage: "BARGE" })}>Barge</button></span>}</div>
            ))}</div>
          )}
        </section>
        <section className="panel stack">
          <h2><Trophy size={17} /> Today's leaderboard</h2>
          {!board.data?.rows.length ? <p className="muted">No active agents yet.</p> : (
            <div className="dialer-list">{board.data.rows.slice(0, 8).map((r, i) => (
              <div key={r.agentId}><b className="num" style={{ width: 22 }}>{i + 1}</b><b>{r.name}</b><span className={"chip " + (r.verified >= board.data.target ? "ok" : "")}>{r.verified}/{board.data.target}</span><span className="muted small" style={{ marginLeft: "auto" }}>{r.submitted} sent · idle {dur(r.idleSeconds || 0)}</span></div>
            ))}</div>
          )}
        </section>
      </div>

      <section className="panel stack">
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <h2><Mic size={17} /> Listen to an agent's mic <span className="muted small">live, through Modo — works even off-call</span></h2>
          {micOn && <button className="danger sm" onClick={stopMic}><Square size={13} /> Stop listening to {micOn.name.split(" ")[0]}</button>}
        </div>
        <p className="muted small" style={{ margin: 0 }}>Audio streams straight from the agent's browser to yours and is not recorded. The agent sees a “supervisor is listening” banner the whole time.</p>
        {micMsg && <div className="err small">{micMsg}</div>}
        {micOn && <div className="receipt"><Ear size={13} /> {micOn.connecting ? `Connecting to ${micOn.name}…` : `Listening to ${micOn.name}. Keep this tab open.`}</div>}
        {(() => { const online = p.filter((x) => !["not in", "clocked out"].includes(x.status)); return !online.length
          ? <p className="muted small" style={{ margin: 0 }}>No agents are signed in right now.</p>
          : <div className="dialer-list">{online.map((a) => (
              <div key={a.id}><span className={"dot " + String(a.status || "").toLowerCase().replace(/\s+/g, "")} /><b>{a.name}</b><span className="chip">{a.status}</span>
                <span className="row" style={{ gap: 4, marginLeft: "auto" }}>
                  {micOn?.id === a.id ? <button className="sm" onClick={stopMic}><Square size={12} /> Stop</button>
                    : <button className="ghost sm" onClick={() => listenMic(a)}><Headphones size={12} /> Listen</button>}
                </span></div>
            ))}</div>; })()}
        <audio ref={micAudio} autoPlay playsInline hidden />
      </section>

      <section className="panel stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2><History size={17} /> Recent calls</h2>
          {viciConnected && <Link className="ghost sm" href="/admin/recordings">All recordings</Link>}
        </div>
        {done.length ? (
          // Calls that ran through Modo's own dialer (with AI transcript/score)
          <div className="tablewrap"><table>
            <thead><tr><th>Agent</th><th>When</th><th>Length</th><th>What happened</th><th>Confused</th><th>Ended by</th><th className="r">Score</th></tr></thead>
            <tbody>{done.slice(0, 30).map((s) => (
              <tr key={s.id}>
                <td>{s.user.name}</td><td className="small muted">{new Date(s.startedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</td>
                <td className="small">{dur(mins(s.startedAt, s.endedAt))}</td>
                <td className="small" style={{ maxWidth: 420 }}>{s.summary || <span className="muted">—</span>}</td>
                <td>{s.confused && s.confused !== "none" ? <span className="chip late" title={s.confusedNote || ""}>{WHO[s.confused]}</span> : <span className="muted small">no</span>}</td>
                <td>{s.endedBy ? <span className={"chip " + (s.endedBy === "customer" ? "red" : "")}>{ENDED[s.endedBy]}</span> : "—"}{s.endedBySource === "ai" && <span className="muted small"> (AI guess)</span>}</td>
                <td className="r num">{s.score ?? "—"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : viciCalls.length ? (
          // No Modo-tracked calls, but the dialer has real recordings today — show those with playback
          <>
            <p className="muted small" style={{ margin: "0 0 6px" }}>Straight from the dialer — your agents dial in VICIdial, so these are their recorded calls.</p>
            <div className="tablewrap"><table>
              <thead><tr><th>Agent</th><th>When</th><th>Length</th><th>Number</th><th>Play</th></tr></thead>
              <tbody>{viciCalls.slice(0, 30).map((r, i) => (
                <tr key={r.id || r.url || i}>
                  <td>{r.agent || "—"}</td>
                  <td className="small muted">{r.start ? new Date(isNaN(+r.start) ? r.start : +r.start * 1000).toLocaleString([], { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" }) : "—"}</td>
                  <td className="small">{r.seconds ? dur(r.seconds) : "—"}</td>
                  <td className="small num">{r.phone || (r.leadId ? "lead " + r.leadId : "—")}</td>
                  <td><audio controls preload="none" src={r.url} style={{ height: 30, maxWidth: 220 }} /></td>
                </tr>
              ))}</tbody>
            </table></div>
          </>
        ) : viciConnected ? (
          <p className="muted small" style={{ margin: 0 }}>
            No recorded calls came back from the dialer for today. Your agents are dialing inside VICIdial (see the counts above),
            so calls only show here if <b>recording is on</b> for their campaign (VICIdial → Admin → Campaigns → <i>Recording = ALLCALLS</i>)
            and the API user has <i>View Reports</i> access. Live listening works regardless.
          </p>
        ) : <p className="muted">No finished calls in the last 12 hours.</p>}
      </section>
    </div>
  );
}
