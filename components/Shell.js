"use client";
// Shared frame for every signed-in page: the dock, chat badge, incoming-call banner and the call panel.
// It lives in the layout, so a call keeps going while you move between pages.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import TopBar from "./TopBar";
import { useHuddle } from "./useHuddle";
import { LogOut, Phone, PhoneOff, Mic, MicOff, X, Users, AlarmClock, MapPin, Power, Clock, Search, CornerDownLeft, GraduationCap, MessageSquare, Plus, PhoneCall, Receipt, SearchCheck, Timer, Coffee, Settings as SettingsIcon, LayoutDashboard } from "lucide-react";
import { guideForRole } from "@/lib/guide";
import { startChunkSend } from "@/components/chunklisten";
import ErrorBoundary from "@/components/ErrorBoundary";
import Translator from "@/components/Translator";
import FloatDock from "@/components/FloatDock";
import Spectrum from "@/components/Spectrum";

const ShellCtx = createContext(null);
export const useShell = () => useContext(ShellCtx);
import { SoftphoneProvider } from "./Softphone";
import { WhatsNewBanner } from "./WhatsNew";
import Cheers from "./Cheers";

// Subscribe this device for web push so alerts reach a locked/closed phone.
const b64ToU8 = (b64) => { const pad = "=".repeat((4 - (b64.length % 4)) % 4); const s = (b64 + pad).replace(/-/g, "+").replace(/_/g, "/"); const raw = atob(s); return Uint8Array.from([...raw].map((c) => c.charCodeAt(0))); };
async function subscribePush() {
  try {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const { key } = await fetch("/api/push/subscribe").then((r) => r.json());
      if (!key) return;
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(key) });
    }
    await fetch("/api/push/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON(), ua: navigator.userAgent }) });
  } catch {}
}

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
  const [dialOpen, setDialOpen] = useState(false);
  const isDesktop = typeof window !== "undefined" && !!window.modo?.isDesktop;
  const [locked, setLocked] = useState(null); const [myStatus, setMyStatus] = useState("available");
  useEffect(() => { if (me?.status) setMyStatus(me.status); }, [me]);
  useEffect(() => { if (!locked) return; const t = setInterval(async () => { const st = await fetch("/api/status").then((x) => x.json()).catch(() => ({})); if (!st.lockdown) location.reload(); }, 15000); return () => clearInterval(t); }, [locked]);
  const setStatus = async (st) => { setMyStatus(st); await fetch("/api/me/status", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: st }) }); };
  const [lockOn, setLockOn] = useState(false); const [seWaiting, setSeWaiting] = useState(0);
  useEffect(() => { if (me?.role !== "ADMIN") return; const l = () => fetch("/api/shift-end").then((r) => r.json()).then((d) => setSeWaiting((d.requests || []).filter((x) => x.status === "pending").length)).catch(() => {}); l(); const i = setInterval(l, 20000); return () => clearInterval(i); }, [me]);
  // Modo bot: while management has Modo open, keep UPS package statuses fresh (the bot skips anything checked recently).
  useEffect(() => { if (me?.role !== "ADMIN" && me?.role !== "SUPERVISOR") return; const run = () => !document.hidden && fetch("/api/sales/ups-bot", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }).catch(() => {}); const f = setTimeout(run, 15000); const t = setInterval(run, 10 * 60000); return () => { clearTimeout(f); clearInterval(t); }; }, [me?.role]);
  useEffect(() => { if (me?.role === "ADMIN") fetch("/api/status").then((x) => x.json()).then((d) => setLockOn(!!d.lockdown)).catch(() => {}); }, [me]);
  const toggleLock = async () => {
    if (!lockOn) { const msg = prompt("EMERGENCY STOP\n\nAll agents will be locked out of Modo right away (calls end too). Only admins keep access.\n\nMessage for agents (optional):", "Modo is paused by admin."); if (msg === null) return;
      await fetch("/api/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ lockdown: true, lockdownMsg: msg }) }); setLockOn(true); }
    else if (confirm("Turn the CRM back on for everyone?")) { await fetch("/api/settings", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ lockdown: false }) }); setLockOn(false); }
  };
  const seenCalls = useRef(new Set()); const ringTimer = useRef(null); const seenDue = useRef(new Set()); const geo = useRef({ at: 0, v: null });
  const huddle = useHuddle(me?.uid);

  useEffect(() => { fetch("/api/me").then((r) => r.json()).then(setMe); }, []);
  const loadChat = useCallback(() => fetch("/api/chat/conversations", { cache: "no-store" }).then((r) => r.ok ? r.json() : null).then((d) => d && setChat(d)).catch(() => {}), []);
  useEffect(() => { loadChat(); const t = setInterval(() => { if (!document.hidden) loadChat(); }, 5000); const onVis = () => { if (!document.hidden) loadChat(); }; document.addEventListener("visibilitychange", onVis); return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); }; }, [loadChat]);

  // Heartbeat: keeps you "online", auto clock-in at the start of a shift, office detection (Wi-Fi or GPS).
  useEffect(() => {
    let stop = false;
    const beat = async () => {
      const body = { idle: !!window.__modoIdle };
      if (geo.current.v) Object.assign(body, geo.current.v);
      const r = await fetch("/api/heartbeat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
      if (r && r.status === 401) { const st = await fetch("/api/status").then((x) => x.json()).catch(() => ({})); if (st.lockdown) setLocked(st.message || "Modo is paused by admin."); return; }
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
      const hits = (d.tasks || []).filter((t) => t.dueAt && new Date(t.dueAt) <= now + 60000 && now - new Date(t.dueAt) < 30 * 60000 && !seenDue.current.has(t.id));
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
    // Register the push service worker; if already allowed, make sure this device is subscribed.
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").then(() => { if (window.Notification?.permission === "granted") subscribePush(); }).catch(() => {});
    return () => { window.removeEventListener("pointerdown", u); window.removeEventListener("keydown", u); };
  }, []);
  const askNotif = async () => { unlockAudio(); if ("Notification" in window) { const p = await Notification.requestPermission(); setNotif(p); if (p === "granted") subscribePush(); } };

  // Supervisor live mic listen (off-call): an admin can REQUEST to listen; nothing streams until the
  // agent taps Allow. While live, the agent sees a banner. Never silent, never without consent.
  const [micWatched, setMicWatched] = useState(false);
  const [listenAsk, setListenAsk] = useState(null); // { id } pending the agent's decision
  const micRef = useRef(null); const micSenders = useRef(new Map());
  const micDecision = useRef({ accepted: new Set(), declined: new Set() });
  const declineListen = async (id) => { micDecision.current.declined.add(id); setListenAsk(null); await fetch("/api/listen/stop", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id }) }).catch(() => {}); };
  const allowListen = (id) => { micDecision.current.accepted.add(id); setListenAsk(null); };
  useEffect(() => {
    if (me?.role !== "AGENT") return;
    let stop = false;
    const getMic = async () => { if (micRef.current) return micRef.current; if (!navigator.mediaDevices?.getUserMedia) throw new Error("no mic"); micRef.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); return micRef.current; };
    const releaseMic = () => { if (micRef.current) { micRef.current.getTracks().forEach((t) => t.stop()); micRef.current = null; } };
    const tick = async () => {
      if (stop) return;
      const d = await fetch("/api/listen", { cache: "no-store" }).then((r) => r.json()).catch(() => null);
      const reqs = (d?.requests || []).filter((r) => !r.callSessionId); // direct mic listens (call listens are handled on the Call-assist screen)
      const dec = micDecision.current;
      // Ask about the first request the agent hasn't answered yet
      const undecided = reqs.find((r) => !dec.accepted.has(r.id) && !dec.declined.has(r.id));
      setListenAsk((cur) => undecided ? (cur && cur.id === undecided.id ? cur : { id: undecided.id }) : (cur && reqs.find((r) => r.id === cur.id) ? cur : null));
      // Only stream for requests the agent explicitly allowed
      const allowed = reqs.filter((r) => dec.accepted.has(r.id));
      setMicWatched(allowed.length > 0);
      for (const r of allowed) if (!micSenders.current.has(r.id)) {
        micSenders.current.set(r.id, { close: () => {} });
        try { const mic = await getMic(); const sd = startChunkSend(r.id, mic, () => micSenders.current.delete(r.id)); micSenders.current.set(r.id, sd); }
        catch { micSenders.current.delete(r.id); }
      }
      for (const [id, sd] of micSenders.current) if (!reqs.find((r) => r.id === id)) { sd.close?.(); micSenders.current.delete(id); }
      if (!allowed.length) releaseMic();
      if (!stop) setTimeout(tick, 2500);
    };
    tick();
    return () => { stop = true; for (const [, sd] of micSenders.current) sd.close?.(); micSenders.current.clear(); releaseMic(); };
  }, [me]);

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

  // Quick-actions speed-dial (agents: their most-used actions; admins: overview/settings/chat). Lives in the movable dock.
  const speedDial = (
me?.role === "AGENT" ? (
        <div className={"agent-dial" + (dialOpen ? " open" : "")}>
          {dialOpen && <div className="ad-backdrop" onClick={() => setDialOpen(false)} />}
          <div className="ad-actions" role="menu">
            <button className="ad-item" onClick={() => { setDialOpen(false); router.push("/agent/dialer"); }}><span className="ad-ic"><PhoneCall size={18} /></span>Dialer</button>
            <button className="ad-item" onClick={() => { setDialOpen(false); router.push("/agent/sale"); }}><span className="ad-ic"><Receipt size={18} /></span>Submit sale</button>
            <button className="ad-item" onClick={() => { setDialOpen(false); router.push("/agent/lookups"); }}><span className="ad-ic"><SearchCheck size={18} /></span>Lookups</button>
            <button className="ad-item" onClick={() => { setDialOpen(false); router.push("/agent"); }}><span className="ad-ic"><Timer size={18} /></span>My shift</button>
            <button className="ad-item" onClick={() => { setDialOpen(false); router.push("/agent/chat"); }}><span className="ad-ic"><MessageSquare size={18} /></span>Chat{unread > 0 && <em className="ad-badge">{unread > 99 ? "99+" : unread}</em>}</button>
            <div className="ad-status">
              {[["available", "🟢", "Available"], ["away", "⚪", "Away"], ["busy", "🟠", "Busy"]].map(([k, e, l]) => (
                <button key={k} className={myStatus === k ? "on" : ""} title={l} onClick={() => { setStatus(k); setDialOpen(false); }}>{e}</button>
              ))}
            </div>
          </div>
          <button className="chat-fab ad-main" aria-label="Quick actions" aria-expanded={dialOpen} onClick={() => setDialOpen((o) => !o)}>
            {dialOpen ? <X size={24} /> : <Plus size={26} />}
            {!dialOpen && unread > 0 && <span className="chat-fab-badge">{unread > 99 ? "99+" : unread}</span>}
          </button>
        </div>
      ) : (
        <div className={"agent-dial" + (dialOpen ? " open" : "")}>
          {dialOpen && <div className="ad-backdrop" onClick={() => setDialOpen(false)} />}
          <div className="ad-actions" role="menu">
            <button className="ad-item" onClick={() => { setDialOpen(false); router.push("/admin"); }}><span className="ad-ic"><LayoutDashboard size={18} /></span>Overview</button>
            <button className="ad-item" onClick={() => { setDialOpen(false); router.push("/admin/settings"); }}><span className="ad-ic"><SettingsIcon size={18} /></span>Settings</button>
            <button className="ad-item" onClick={() => { setDialOpen(false); router.push("/admin/chat"); }}><span className="ad-ic"><MessageSquare size={18} /></span>Chat{unread > 0 && <em className="ad-badge">{unread > 99 ? "99+" : unread}</em>}</button>
          </div>
          <button className="chat-fab ad-main" aria-label="Quick actions" aria-expanded={dialOpen} onClick={() => setDialOpen((o) => !o)}>
            {dialOpen ? <X size={24} /> : <Plus size={26} />}
            {!dialOpen && unread > 0 && <span className="chat-fab-badge">{unread > 99 ? "99+" : unread}</span>}
          </button>
        </div>
      )
  );

  return (
    <ShellCtx.Provider value={{ me, chat, reloadChat: loadChat, huddle, openDM, presence, nav: withBadges, home }}>
      <SoftphoneProvider>
      <Translator />
      <TopBar nav={withBadges} home={home} action={navAction} search={<ErrorBoundary resetKey={path}><SearchPalette nav={nav} home={home} role={me?.role} /></ErrorBoundary>}
        user={{ name: me?.name || "", sub: userSub || (me?.role === "ADMIN" ? "Admin" : me?.agentId), status: status || (myStatus === "away" ? "off" : myStatus === "busy" ? "warn" : "") }}
        userMenu={[
          ...(me?.role === "AGENT" ? [["available", "Available", "🟢"], ["away", "Away", "⚪"], ["busy", "Busy", "🟠"]].map(([k, l, e]) => ({ label: `${e} ${l}${myStatus === k ? "  ✓" : ""}`, onClick: () => setStatus(k) })) : []),
          ...userMenu,
          ...(me?.role === "ADMIN" ? [{ label: lockOn ? "Turn CRM back on" : "Emergency stop (lock agents out)", icon: <Power size={16} />, danger: !lockOn, onClick: toggleLock }] : []),
          { label: signOutLabel, icon: <LogOut size={16} />, danger: true, onClick: () => onSignOut(huddle.leave) }]} />
      {micWatched && <div className="mic-banner" role="status"><Mic size={14} /> A supervisor is listening to your microphone.</div>}
      {listenAsk && (
        <div className="listen-ask-bg" role="alertdialog" aria-label="Listen request">
          <div className="panel stack listen-ask">
            <div className="row" style={{ gap: 10 }}><span className="la-ico"><Mic size={20} /></span><div><b>Your supervisor wants to listen in</b><div className="muted small">They're asking to hear your microphone live. Nothing is sent until you allow it.</div></div></div>
            <div className="row" style={{ gap: 8 }}>
              <button onClick={() => allowListen(listenAsk.id)}><Mic size={15} /> Allow</button>
              <button className="ghost" onClick={() => declineListen(listenAsk.id)}>Decline</button>
            </div>
          </div>
        </div>
      )}
      {lockOn && <div className="lock-banner" role="status"><Power size={14} /> Emergency stop is ON: agents are locked out. <button className="sm" onClick={toggleLock}>Turn back on</button></div>}
      {locked && <div className="lock-screen" role="alertdialog" aria-label="CRM paused"><div className="panel"><Power size={34} /><h1>Paused by admin</h1><p>{locked}</p><p className="muted small">This page will come back by itself when admin turns the CRM on again.</p></div></div>}
      <main className="shell">
        <WhatsNewBanner />
        <div className="bar">
          <div>{current && <><h1>{current.label}</h1>{current.hint && <div className="page-title">{current.hint}</div>}</>}</div>
          <div className="row small muted" style={{ gap: 8 }}>
            {header && <span>{header}</span>}
            {me?.role === "AGENT" && presence?.attendance && (
              <span className={"chip " + (loc === "office" ? "ok" : loc === "remote" ? "late" : "")}><MapPin size={12} /> {loc === "office" ? "In office" : loc === "remote" ? "Remote" : "Clocked in"}{presence.how ? ` · ${presence.how}` : ""}</span>
            )}
          </div>
        </div>
        <ErrorBoundary resetKey={path}>{children}</ErrorBoundary>
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
      <ErrorBoundary resetKey="cheers"><Cheers me={me} /></ErrorBoundary>
      {notif !== "granted" && <button className="notif-ask ghost" onClick={askNotif}><Phone size={14} /> Turn on phone alerts</button>}
      {huddle.error && <div className="call-banner warn" role="alert"><div>{huddle.error}</div><button className="ghost" onClick={huddle.clearError}><X size={16} /></button></div>}
      {huddle.call && <CallPanel huddle={huddle} me={me} conv={chat.conversations.find((c) => c.id === huddle.call.conversationId)} />}
      {/* Floating dock: Notepad · Tools · Chats + the quick-actions button. Drag the grip to put it anywhere. */}
      <ErrorBoundary resetKey="float"><FloatDock extra={speedDial} onMenu={setDialOpen} /></ErrorBoundary>
      <div ref={huddle.audioRef} hidden />
      </SoftphoneProvider>
    </ShellCtx.Provider>
  );
}

// Global search: jump to any page or how-to. Open with the button or ⌘K / Ctrl+K.
function SearchPalette({ nav, home, role }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef(null);
  const guideBase = home === "/agent" ? "/agent/guide" : "/admin/guide";

  const index = useMemo(() => {
    try {
      const pages = (Array.isArray(nav) ? nav : []).flatMap((n) => (n && n.children) || [n]).filter((n) => n && n.href)
        .map((n) => ({ kind: "page", label: n.label || n.href, hint: n.hint || "", href: n.href }));
      const seen = new Set();
      const uniq = pages.filter((p) => (seen.has(p.href) ? false : (seen.add(p.href), true)));
      let topics = [];
      try { topics = guideForRole(role || "ADMIN").map((g) => ({ kind: "guide", label: g.title || "", hint: g.for || "", href: `${guideBase}?t=${g.id}` })); } catch { topics = []; }
      return [...uniq, ...topics];
    } catch { return []; }
  }, [nav, role, guideBase]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return index.filter((x) => x.kind === "page").slice(0, 8);
    const score = (x) => { const lbl = String(x.label || "").toLowerCase(); const hay = (lbl + " " + String(x.hint || "")).toLowerCase(); if (lbl.startsWith(s)) return 0; if (lbl.includes(s)) return 1; return hay.includes(s) ? 2 : 9; };
    return index.map((x) => ({ x, s: score(x) })).filter((r) => r.s < 9).sort((a, b) => a.s - b.s).slice(0, 12).map((r) => r.x);
  }, [q, index]);

  useEffect(() => { setSel(0); }, [q, open]);
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 30); else setQ(""); }, [open]);

  const go = (r) => { if (!r) return; setOpen(false); try { router.push(r.href); } catch {} };

  const overlay = open && (
        <div className="search-overlay" onClick={() => setOpen(false)}>
          <div className="search-box panel" onClick={(e) => e.stopPropagation()}>
            <div className="search-head">
              <Search size={16} />
              <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") { e.preventDefault(); setSel((i) => Math.min(i + 1, results.length - 1)); }
                  if (e.key === "ArrowUp") { e.preventDefault(); setSel((i) => Math.max(i - 1, 0)); }
                  if (e.key === "Enter") { e.preventDefault(); go(results[sel]); }
                }}
                placeholder="Search pages and how-to… (e.g. payroll, dock, listen)" />
              <button className="ghost icon-btn" aria-label="Close" onClick={() => setOpen(false)}><X size={16} /></button>
            </div>
            <div className="search-results">
              {!results.length && <p className="muted small" style={{ padding: "10px 12px", margin: 0 }}>Nothing matches “{q}”.</p>}
              {results.map((r, i) => (
                <button key={r.kind + r.href} className={"search-item" + (i === sel ? " on" : "")} onMouseEnter={() => setSel(i)} onClick={() => go(r)}>
                  <span className="search-ico">{r.kind === "guide" ? <GraduationCap size={15} /> : <CornerDownLeft size={15} />}</span>
                  <span className="search-txt"><b>{r.label}</b>{r.hint && <span className="muted small ellipsis"> — {r.hint}</span>}</span>
                  <span className="search-tag">{r.kind === "guide" ? "How-to" : "Go"}</span>
                </button>
              ))}
            </div>
            <div className="search-foot muted small">↑↓ to move · Enter to open · Esc to close</div>
          </div>
        </div>
      );

  return (
    <>
      <button className="ghost search-trigger" onClick={() => setOpen(true)} aria-label="Search Modo" title="Search (Ctrl+K)">
        <Search size={14} /> <span className="search-trigger-t">Search</span> <kbd>⌘K</kbd>
      </button>
      {typeof document !== "undefined" && overlay ? createPortal(overlay, document.body) : null}
    </>
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
      <Spectrum getStreams={huddle.getStreams} active label="Call audio" height={44} bars={36} />
      {people.length === 1 && <p className="muted small" style={{ margin: 0 }}><Users size={13} /> Waiting for others to join…</p>}
      <div className="row">
        <button className={muted ? "" : "ghost"} onClick={huddle.toggleMute}>{muted ? <><MicOff size={16} /> Unmute</> : <><Mic size={16} /> Mute</>}</button>
        <button className="danger" onClick={huddle.leave}><PhoneOff size={16} /> Leave</button>
        {me?.role === "ADMIN" && people.length > 1 && <button className="ghost" onClick={huddle.endForAll}>End for all</button>}
      </div>
    </aside>
  );
}
