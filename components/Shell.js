"use client";
// Shared frame for every signed-in page: the dock, chat badge, incoming-call banner and the call panel.
// It lives in the layout, so a call keeps going while you move between pages.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import PillNav from "./PillNav";
import { useHuddle } from "./useHuddle";
import { LogOut, Phone, PhoneOff, Mic, MicOff, X, Users, AlarmClock, MapPin, Power, Clock } from "lucide-react";

const ShellCtx = createContext(null);
export const useShell = () => useContext(ShellCtx);

// Ringtone played through the computer's current sound output (headphones if plugged in).
// Browsers only allow sound after the person has clicked on the page once, so we unlock audio on the first click.
let audioCtx = null;
function unlockAudio() {
  try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === "suspended") audioCtx.resume(); } catch {}
}
function ringOnce() {
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime;
  [[0, 659], [0.18, 880], [0.6, 659], [0.78, 880]].forEach(([t, f]) => {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = "sine"; o.frequency.value = f;
    g.gain.setValueAtTime(0, t0 + t); g.gain.linearRampToValueAtTime(0.18, t0 + t + 0.02); g.gain.linearRampToValueAtTime(0, t0 + t + 0.16);
    o.connect(g); g.connect(audioCtx.destination); o.start(t0 + t); o.stop(t0 + t + 0.18);
  });
}

export default function Shell({ nav, home, onSignOut, signOutLabel = "Sign out", userMenu = [], userSub, status, children, header, navAction }) {
  const router = useRouter(); const path = usePathname();
  const [me, setMe] = useState(null);
  const [chat, setChat] = useState({ conversations: [] });
  const [dismissed, setDismissed] = useState({});
  const [presence, setPresence] = useState(null);
  const [due, setDue] = useState([]);
  const [notif, setNotif] = useState("granted");
  const isDesktop = typeof window !== "undefined" && !!window.modo?.isDesktop;
  const [locked, setLocked] = useState(null); const [myStatus, setMyStatus] = useState("available");
  useEffect(() => { if (me?.status) setMyStatus(me.status); }, [me]);
  useEffect(() => { if (!locked) return; const t = setInterval(async () => { const st = await fetch("/api/status").then((x) => x.json()).catch(() => ({})); if (!st.lockdown) location.reload(); }, 15000); return () => clearInterval(t); }, [locked]);
  const setStatus = async (st) => { setMyStatus(st); await fetch("/api/me/status", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: st }) }); };
  const [lockOn, setLockOn] = useState(false); const [seWaiting, setSeWaiting] = useState(0);
  useEffect(() => { if (me?.role !== "ADMIN") return; const l = () => fetch("/api/shift-end").then((r) => r.json()).then((d) => setSeWaiting((d.requests || []).filter((x) => x.status === "pending").length)).catch(() => {}); l(); const i = setInterval(l, 20000); return () => clearInterval(i); }, [me]);
  useEffect(() => { if (me?.role === "ADMIN") fetch("/api/status").then((x) => x.json()).then((d) => setLockOn(!!d.lockdown)).catch(() => {}); }, [me]);
  const toggleLock = async () => {
    if (!lockOn) { const msg = prompt("EMERGENCY STOP\n\nAll agents will be locked out of CRM Modo right away (calls end too). Only admins keep access.\n\nMessage for agents (optional):", "CRM Modo is paused by admin."); if (msg === null) return;
      await fetch("/api/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ lockdown: true, lockdownMsg: msg }) }); setLockOn(true); }
    else if (confirm("Turn the CRM back on for everyone?")) { await fetch("/api/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ lockdown: false }) }); setLockOn(false); }
  };
  const seenCalls = useRef(new Set()); const ringTimer = useRef(null); const seenDue = useRef(new Set()); const geo = useRef({ at: 0, v: null });
  const huddle = useHuddle(me?.uid);

  useEffect(() => { fetch("/api/me").then((r) => r.json()).then(setMe); }, []);
  const loadChat = useCallback(() => fetch("/api/chat/conversations", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((d) => d && setChat(d)).catch(() => {}), []);
  useEffect(() => { loadChat(); const t = setInterval(loadChat, 5000); return () => clearInterval(t); }, [loadChat]);

  // Heartbeat: keeps you "online", auto clock-in at the start of a shift, office detection (Wi-Fi or GPS).
  useEffect(() => {
    let stop = false;
    const beat = async () => {
      const body = { idle: !!window.__modoIdle };
      if (geo.current.v) Object.assign(body, geo.current.v);
      const r = await fetch("/api/heartbeat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
      if (r && r.status === 401) { const st = await fetch("/api/status").then((x) => x.json()).catch(() => ({})); if (st.lockdown) setLocked(st.message || "CRM Modo is paused by admin."); return; }
      const d = r && r.ok ? await r.json() : null; if (stop || !d) return;
      setPresence(d);
      if (d.needGeo && navigator.geolocation && Date.now() - geo.current.at > 10 * 60000) {
        geo.current.at = Date.now();
        navigator.geolocation.getCurrentPosition((p) => { geo.current.v = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }; }, () => {}, { enableHighAccuracy: true, timeout: 15000, maximumAge: 300000 });
      }
    };
    beat(); const t = setInterval(beat, 30000);
    return () => { stop = true; clearInterval(t); };
  }, []);

  // Callback / task reminders
  useEffect(() => {
    const check = async () => {
      const r = await fetch("/api/crm/tasks?view=today", { cache: "no-store" }).catch(() => null); if (!r || !r.ok) return;
      const d = await r.json(); const now = Date.now();
      const hits = d.tasks.filter((t) => t.dueAt && new Date(t.dueAt) <= now + 60000 && now - new Date(t.dueAt) < 30 * 60000 && !seenDue.current.has(t.id));
      if (hits.length) {
        hits.forEach((t) => seenDue.current.add(t.id)); setDue((x) => [...x, ...hits]); ringOnce();
        try { if (Notification.permission === "granted") hits.forEach((t) => new Notification(`${t.type === "callback" ? "Callback" : "Task"} due: ${t.title}`, { body: t.contact ? `${t.contact.name}${t.contact.phone ? " · " + t.contact.phone : ""}` : "", tag: t.id })); } catch {}
      }
    };
    check(); const t = setInterval(check, 60000); return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const u = () => unlockAudio();
    window.addEventListener("pointerdown", u); window.addEventListener("keydown", u);
    if ("Notification" in window) setNotif(Notification.permission);
    return () => { window.removeEventListener("pointerdown", u); window.removeEventListener("keydown", u); };
  }, []);
  const askNotif = async () => { unlockAudio(); if ("Notification" in window) setNotif(await Notification.requestPermission()); };

  const openDM = useCallback(async (userId, { call = false } = {}) => {
    const r = await fetch("/api/chat/conversations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userIds: [userId] }) });
    const d = await r.json(); if (!r.ok) return alert(d.error);
    try { sessionStorage.setItem("modo-open-chat", d.id); } catch {}
    if (call) await huddle.start(d.id);
    await loadChat();
    router.push(path.startsWith("/admin") ? "/admin/chat" : "/agent/chat");
  }, [huddle, loadChat, router, path]);

  const unread = chat.conversations.reduce((n, c) => n + c.unread, 0);
  const invites = chat.conversations.filter((c) => c.huddle && !c.huddle.inIt && c.huddle.id !== huddle.call?.id && !dismissed[c.huddle.id] && c.huddle.startedById !== me?.uid);
  const ringingId = invites[0]?.huddle.id || null;
  useEffect(() => {
    clearInterval(ringTimer.current);
    if (!ringingId) { document.title = document.title.replace(/^📞 /, ""); return; }
    const c = invites[0];
    if (!seenCalls.current.has(ringingId)) {
      seenCalls.current.add(ringingId);
      try { if ("Notification" in window && Notification.permission === "granted") {
        const n = new Notification(`${c.huddle.startedBy || "Admin"} is calling`, { body: c.isGroup ? `Huddle in ${c.title}. Click to join.` : "Click to join the call.", tag: ringingId, requireInteraction: true });
        n.onclick = () => { window.focus(); huddle.join(ringingId).then(loadChat); n.close(); };
      } } catch {}
    }
    const started = Date.now();
    ringOnce(); if (!document.title.startsWith("📞 ")) document.title = "📞 " + document.title;
    ringTimer.current = setInterval(() => { if (Date.now() - started > 45000) { clearInterval(ringTimer.current); return; } ringOnce(); }, 2200);
    return () => clearInterval(ringTimer.current);
  }, [ringingId]); // eslint-disable-line

  // Put live counts on nav items (chat unread)
  const withBadges = nav.map((n) => n.chat ? { ...n, badge: unread || null } : n.children ? { ...n, children: n.children.map((c) => c.chat ? { ...c, badge: unread || null } : c) } : n);
  const flat = nav.flatMap((n) => n.children || [n]);
  const current = flat.find((n) => (n.exact ? path === n.href : path === n.href || path.startsWith(n.href + "/")));
  const loc = presence?.attendance?.location;

  return (
    <ShellCtx.Provider value={{ me, chat, reloadChat: loadChat, huddle, openDM, presence }}>
      <PillNav nav={withBadges} home={home} action={navAction}
        user={{ name: me?.name || "", sub: userSub || (me?.role === "ADMIN" ? "Admin" : me?.agentId), status: status || (myStatus === "away" ? "off" : myStatus === "busy" ? "warn" : "") }}
        userMenu={[
          ...(me?.role === "AGENT" ? [["available", "Available", "🟢"], ["away", "Away", "⚪"], ["busy", "Busy", "🟠"]].map(([k, l, e]) => ({ label: `${e} ${l}${myStatus === k ? "  ✓" : ""}`, onClick: () => setStatus(k) })) : []),
          ...userMenu,
          ...(me?.role === "ADMIN" ? [{ label: lockOn ? "Turn CRM back on" : "Emergency stop (lock agents out)", icon: <Power size={16} />, danger: !lockOn, onClick: toggleLock }] : []),
          { label: signOutLabel, icon: <LogOut size={16} />, danger: true, onClick: () => onSignOut(huddle.leave) }]} />
      {lockOn && <div className="lock-banner" role="status"><Power size={14} /> Emergency stop is ON: agents are locked out. <button className="sm" onClick={toggleLock}>Turn back on</button></div>}
      {locked && <div className="lock-screen" role="alertdialog" aria-label="CRM paused"><div className="panel"><Power size={34} /><h1>Paused by admin</h1><p>{locked}</p><p className="muted small">This page will come back by itself when admin turns the CRM on again.</p></div></div>}
      <main className="shell">
        <div className="bar">
          <div>{current && <><h1>{current.label}</h1>{current.hint && <div className="page-title">{current.hint}</div>}</>}</div>
          <div className="row small muted" style={{ gap: 8 }}>
            {header && <span>{header}</span>}
            {me?.role === "AGENT" && presence?.attendance && (
              <span className={"chip " + (loc === "office" ? "ok" : loc === "remote" ? "late" : "")}><MapPin size={12} /> {loc === "office" ? "In office" : loc === "remote" ? "Remote" : "Clocked in"}{presence.how ? ` · ${presence.how}` : ""}</span>
            )}
          </div>
        </div>
        {children}
      </main>

      {invites.slice(0, 1).map((c) => (
        <div key={c.huddle.id} className="call-banner" role="alert">
          <Phone size={18} />
          <div><b>{c.huddle.startedBy || "Admin"}</b> started a {c.isGroup ? "huddle" : "call"}{c.isGroup ? <> in <b>{c.title}</b></> : null}</div>
          <button onClick={() => huddle.join(c.huddle.id).then(loadChat)}><Phone size={15} /> Join</button>
          <button className="ghost" aria-label="Dismiss" onClick={() => setDismissed((d) => ({ ...d, [c.huddle.id]: true }))}><X size={16} /></button>
        </div>
      ))}
      {due.slice(0, 1).map((t) => (
        <div key={t.id} className="toast" role="alert">
          <AlarmClock size={20} style={{ color: "var(--amber)", flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}><b>{t.type === "callback" ? "Callback due" : "Task due"}</b><div className="small ellipsis">{t.title}{t.contact ? ` · ${t.contact.name}${t.contact.phone ? " " + t.contact.phone : ""}` : ""}</div></div>
          <button className="ghost sm" onClick={() => { setDue((x) => x.filter((y) => y.id !== t.id)); router.push(path.startsWith("/admin") ? "/admin/tasks" : "/agent/tasks"); }}>Open</button>
          <button className="ghost sm" aria-label="Dismiss" onClick={() => setDue((x) => x.filter((y) => y.id !== t.id))}><X size={14} /></button>
        </div>
      ))}
      {me?.role === "AGENT" && presence?.shiftEnded && <div className="toast" role="status"><AlarmClock size={20} style={{ color: "var(--amber)", flexShrink: 0 }} /><div><b>Your shift has ended</b><div className="small">You were clocked out automatically. Thanks for today!</div></div></div>}
      {seWaiting > 0 && typeof window !== "undefined" && !location.pathname.startsWith("/admin/attendance") && location.pathname !== "/admin" && <a className="toast se-toast" href="/admin/attendance"><Clock size={18} /><div><b>{seWaiting} agent{seWaiting > 1 ? "s want" : " wants"} to end their shift early</b><div className="small">Tap to approve or deny</div></div></a>}
      {notif === "default" && <button className="notif-ask ghost" onClick={askNotif}><Phone size={14} /> Turn on call alerts</button>}
      {huddle.error && <div className="call-banner warn" role="alert"><div>{huddle.error}</div><button className="ghost" onClick={huddle.clearError}><X size={16} /></button></div>}
      {huddle.call && <CallPanel huddle={huddle} me={me} conv={chat.conversations.find((c) => c.id === huddle.call.conversationId)} />}
      <div ref={huddle.audioRef} hidden />
    </ShellCtx.Provider>
  );
}

function CallPanel({ huddle, me, conv }) {
  const { call, muted, connected } = huddle;
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const secs = call.startedAt ? Math.floor((now - new Date(call.startedAt)) / 1000) : 0;
  const mm = String(Math.floor(secs / 60)).padStart(2, "0"), ss = String(secs % 60).padStart(2, "0");
  const people = call.participants || [];
  return (
    <aside className="call-panel panel" aria-label="Call">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="row" style={{ gap: 8 }}><span className="live-dot" /><b>{conv?.title || "Call"}</b></div>
        <span className="num muted">{mm}:{ss}</span>
      </div>
      <ul className="call-people">
        {people.length === 0 && <li className="muted small">Connecting…</li>}
        {people.map((p) => (
          <li key={p.id}>
            <span className="avatar">{(p.name || "?").slice(0, 1)}</span>
            <span>{p.name}{p.id === me?.uid ? " (you)" : ""}</span>
            <span className="muted small" style={{ marginLeft: "auto" }}>
              {p.muted ? <MicOff size={14} /> : p.id !== me?.uid && connected[p.id] !== "connected" ? "connecting…" : null}
            </span>
          </li>
        ))}
      </ul>
      {people.length === 1 && <p className="muted small" style={{ margin: 0 }}><Users size={13} /> Waiting for others to join…</p>}
      <div className="row">
        <button className={muted ? "" : "ghost"} onClick={huddle.toggleMute}>{muted ? <><MicOff size={16} /> Unmute</> : <><Mic size={16} /> Mute</>}</button>
        <button className="danger" onClick={huddle.leave}><PhoneOff size={16} /> Leave</button>
        {me?.role === "ADMIN" && people.length > 1 && <button className="ghost" onClick={huddle.endForAll}>End for all</button>}
      </div>
    </aside>
  );
}
