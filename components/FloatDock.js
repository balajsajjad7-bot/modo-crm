"use client";
// Floating dock on every signed-in page: Chat, Notes and Tools open as small floating windows that
// you can drag anywhere, minimise, or pop out to the full page. Positions are remembered per window.
// Everything here is free and works without API keys or connectors.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { GripVertical, MessageSquare, NotebookPen, Wrench, X, Minus, Maximize2, Search, ArrowLeft, BellOff, Bell, Copy, Download, Trash2, Clock, Type, Check } from "lucide-react";
import { useShell } from "./Shell";
import { Avatar, ConvIcon, Conversation } from "./Chat";
import ToolsPanel from "./FreeTools";

const LS = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
const SAVE = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

// ---------- generic floating window ----------
let zTop = 90;
function FloatWin({ id, title, icon, onClose, onExpand, children, width = 380, height = 520, extra }) {
  const key = "modo-float-" + id;
  const [pos, setPos] = useState(null);
  const [min, setMin] = useState(false);
  const [z, setZ] = useState(() => ++zTop);
  const ref = useRef(null); const drag = useRef(null);
  const clamp = useCallback((p) => {
    const w = Math.min(width, window.innerWidth - 16), h = 48;
    return { x: Math.max(8, Math.min(p.x, window.innerWidth - w - 8)), y: Math.max(8, Math.min(p.y, window.innerHeight - h - 8)) };
  }, [width]);
  useEffect(() => {
    const saved = LS(key, null);
    const def = { x: window.innerWidth - Math.min(width, window.innerWidth - 16) - 24, y: Math.max(70, window.innerHeight - height - 96) };
    setPos(clamp(saved || def));
    const onR = () => setPos((p) => (p ? clamp(p) : p));
    window.addEventListener("resize", onR); return () => window.removeEventListener("resize", onR);
  }, []); // eslint-disable-line
  const focus = () => setZ(++zTop);
  const down = (e) => {
    if (e.target.closest("button,input,select,textarea,a")) return;
    focus(); drag.current = { sx: e.clientX, sy: e.clientY, x: pos.x, y: pos.y };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => { const d = drag.current; if (!d) return; setPos(clamp({ x: d.x + e.clientX - d.sx, y: d.y + e.clientY - d.sy })); };
  const up = () => { if (drag.current) { drag.current = null; setPos((p) => (SAVE(key, p), p)); } };
  if (!pos) return null;
  const phone = typeof window !== "undefined" && window.innerWidth < 560;
  const style = phone ? { zIndex: z } : { left: pos.x, top: pos.y, width, height: min ? "auto" : height, zIndex: z };
  return (
    <section ref={ref} className={"fl-win" + (min ? " min" : "") + (phone ? " phone" : "")} style={style} onPointerDown={focus} role="dialog" aria-label={title}>
      <header className="fl-head" onPointerDown={phone ? undefined : down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <span className="fl-ico">{icon}</span><b className="ellipsis">{title}</b>
        <span className="fl-acts">
          {extra}
          {!phone && <button className="fl-btn" title={min ? "Restore" : "Minimise"} aria-label={min ? "Restore" : "Minimise"} onClick={() => setMin((m) => !m)}><Minus size={15} /></button>}
          {onExpand && <button className="fl-btn" title="Open full page" aria-label="Open full page" onClick={onExpand}><Maximize2 size={14} /></button>}
          <button className="fl-btn" title="Close" aria-label="Close" onClick={onClose}><X size={15} /></button>
        </span>
      </header>
      {!min && <div className="fl-body">{children}</div>}
    </section>
  );
}

// ---------- floating chat ----------
function FloatChat({ onClose }) {
  const { me, chat, reloadChat, huddle } = useShell();
  const router = useRouter(); const path = usePathname();
  const [openId, setOpenId] = useState(null);
  const [q, setQ] = useState(""); const [onlyUnread, setOnlyUnread] = useState(false);
  const [muted, setMuted] = useState(false);
  useEffect(() => { setMuted(!!LS("modo-chat-muted", false)); setOpenId(LS("modo-float-chat-open", null)); }, []);
  useEffect(() => { SAVE("modo-float-chat-open", openId); }, [openId]);
  const convs = chat.conversations || [];
  const conv = convs.find((c) => c.id === openId);
  const full = (id) => { try { if (id) sessionStorage.setItem("modo-open-chat", id); } catch {} router.push(path.startsWith("/admin") ? "/admin/chat" : "/agent/chat"); onClose(); };
  const list = useMemo(() => convs
    .filter((c) => (!q || c.title.toLowerCase().includes(q.toLowerCase())) && (!onlyUnread || c.unread > 0))
    .sort((a, b) => (b.unread > 0) - (a.unread > 0) || (a.kind === "channel") - (b.kind === "channel") || a.title.localeCompare(b.title)), [convs, q, onlyUnread]);
  const toggleMute = () => { const v = !muted; setMuted(v); SAVE("modo-chat-muted", v); };
  return (
    <FloatWin id="chat" title={conv ? conv.title : "Chats"} icon={conv && conv.kind !== "dm" ? <ConvIcon c={conv} size={15} /> : <MessageSquare size={15} />}
      onClose={onClose} onExpand={() => full(openId)} width={400} height={560}
      extra={<button className="fl-btn" title={muted ? "Unmute chat sounds" : "Mute chat sounds"} aria-label="Mute" onClick={toggleMute}>{muted ? <BellOff size={14} /> : <Bell size={14} />}</button>}>
      {conv ? (
        <div className="fl-chat-conv slack has-open">
          <section className="sl-main">
            <Conversation key={conv.id} conv={conv} me={me} huddle={huddle} reloadChat={reloadChat} onBack={() => setOpenId(null)}
              onThread={() => full(conv.id)} thread={null} onMembers={() => full(conv.id)} />
          </section>
          <button className="fl-back ghost sm" onClick={() => setOpenId(null)}><ArrowLeft size={14} /> All chats</button>
        </div>
      ) : (
        <div className="fl-chat-list">
          <div className="fl-row">
            <label className="fl-search"><Search size={14} /><input placeholder="Search people & channels" value={q} onChange={(e) => setQ(e.target.value)} /></label>
            <button className={"ghost sm" + (onlyUnread ? " btn-active" : "")} onClick={() => setOnlyUnread((x) => !x)} title="Show only unread">Unread</button>
          </div>
          <div className="fl-scroll">
            {list.map((c) => (
              <button key={c.id} className={"fl-conv" + (c.unread ? " unread" : "")} onClick={() => { setOpenId(c.id); reloadChat(); }}>
                {c.kind === "dm" ? <Avatar name={c.title} size={30} online={c.online} square={false} /> : <span className="fl-conv-ic"><ConvIcon c={c} size={16} /></span>}
                <span className="fl-conv-t ellipsis">{c.kind === "channel" ? "#" : ""}{c.title}</span>
                {c.huddle && <span className="chip ok" style={{ fontSize: 10 }}>live</span>}
                {c.unread > 0 && <span className="sl-badge">{c.unread}</span>}
              </button>
            ))}
            {!list.length && <p className="muted small" style={{ padding: 12 }}>{q || onlyUnread ? "Nothing matches." : "No chats yet."}</p>}
          </div>
          <div className="fl-foot"><button className="ghost sm" onClick={() => full(null)}>Open full chat · new channel or message</button></div>
        </div>
      )}
    </FloatWin>
  );
}

// ---------- floating notepad (personal scratchpad, saved to your account) ----------
function FloatNotes({ onClose }) {
  const router = useRouter(); const path = usePathname();
  const [text, setText] = useState(null); const [state, setState] = useState(""); const [big, setBig] = useState(false); const [copied, setCopied] = useState(false);
  const loaded = useRef(false); const box = useRef(null);
  useEffect(() => {
    setBig(!!LS("modo-notes-big", false));
    fetch("/api/me/pad", { cache: "no-store" }).then((r) => r.json()).then((d) => { setText(d.text || ""); loaded.current = true; }).catch(() => { setText(LS("modo-notes-local", "")); loaded.current = true; });
  }, []);
  useEffect(() => {
    if (text === null || !loaded.current) return;
    if (!loaded.saveArmed) { loaded.saveArmed = true; return; } // don't re-save what we just loaded
    setState("Saving…"); SAVE("modo-notes-local", text);
    const t = setTimeout(async () => {
      const r = await fetch("/api/me/pad", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) }).catch(() => null);
      setState(r && r.ok ? "Saved" : "Saved on this device only");
    }, 700);
    return () => clearTimeout(t);
  }, [text]);
  const stamp = () => {
    const s = new Date().toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
    const el = box.current; const at = el ? el.selectionStart : (text || "").length;
    const v = text || ""; const ins = (at && v[at - 1] !== "\n" ? "\n" : "") + `— ${s} — `;
    setText(v.slice(0, at) + ins + v.slice(at)); setTimeout(() => { el?.focus(); el?.setSelectionRange(at + ins.length, at + ins.length); }, 0);
  };
  const copy = async () => { try { await navigator.clipboard.writeText(text || ""); setCopied(true); setTimeout(() => setCopied(false), 1200); } catch {} };
  const download = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text || ""], { type: "text/plain" })); a.download = `modo-notes-${new Date().toISOString().slice(0, 10)}.txt`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
  const clear = () => { if (text && confirm("Clear your whole scratchpad?")) setText(""); };
  const words = (text || "").trim() ? (text || "").trim().split(/\s+/).length : 0;
  return (
    <FloatWin id="notes" title="Notepad" icon={<NotebookPen size={15} />} onClose={onClose} width={380} height={440}
      onExpand={() => { router.push(path.startsWith("/admin") ? "/admin/notepad" : "/agent/notepad"); onClose(); }}>
      <div className="fl-notes">
        <div className="fl-row tight">
          <button className="ghost sm" onClick={stamp} title="Insert date & time"><Clock size={13} /> Time</button>
          <button className="ghost sm" onClick={copy} title="Copy all">{copied ? <Check size={13} /> : <Copy size={13} />} Copy</button>
          <button className="ghost sm" onClick={download} title="Download as .txt"><Download size={13} /></button>
          <button className="ghost sm" onClick={() => { const b = !big; setBig(b); SAVE("modo-notes-big", b); }} title="Bigger text"><Type size={13} /></button>
          <button className="ghost sm" onClick={clear} title="Clear"><Trash2 size={13} /></button>
        </div>
        {text === null ? <p className="muted small">Loading…</p> : (
          <textarea ref={box} className={"fl-pad" + (big ? " big" : "")} value={text} onChange={(e) => setText(e.target.value)} placeholder="Quick notes, numbers, reminders… saved to your account automatically. Only you can see this." />
        )}
        <div className="fl-foot muted small"><span>{words} words</span><span>{state}</span></div>
      </div>
    </FloatWin>
  );
}

// ---------- the dock ----------
// Movable dock: drag the grip (mouse or finger) to put the buttons anywhere; double-click the grip to send it
// back to the bottom-right corner. Remembers its spot. Menus open towards the middle of the screen.
function useDockDrag() {
  const ref = useRef(null);
  const [pos, setPos] = useState(null); // null = default corner
  const [side, setSide] = useState({ down: false, left: false });
  const drag = useRef(null);
  const clamp = (p) => { const el = ref.current; const w = el?.offsetWidth || 240, h = el?.offsetHeight || 60;
    return { x: Math.max(6, Math.min(p.x, window.innerWidth - w - 6)), y: Math.max(6, Math.min(p.y, window.innerHeight - h - 6)) }; };
  const updateSide = useCallback(() => { const r = ref.current?.getBoundingClientRect(); if (!r) return; setSide({ down: r.top + r.height / 2 < window.innerHeight * 0.42, left: r.left + r.width / 2 < window.innerWidth / 2 }); }, []);
  useEffect(() => { const p = LS("modo-dock-pos", null); if (p) setPos(p); }, []);
  useEffect(() => { const t = setTimeout(updateSide, 0); const onR = () => { setPos((p) => (p ? clamp(p) : p)); updateSide(); }; window.addEventListener("resize", onR); return () => { clearTimeout(t); window.removeEventListener("resize", onR); }; }, [pos, updateSide]); // eslint-disable-line
  const onDown = (e) => { const r = ref.current.getBoundingClientRect(); drag.current = { sx: e.clientX, sy: e.clientY, x: r.left, y: r.top, moved: false }; e.currentTarget.setPointerCapture?.(e.pointerId); e.preventDefault(); };
  const onMove = (e) => { const d = drag.current; if (!d) return; const dx = e.clientX - d.sx, dy = e.clientY - d.sy; if (!d.moved && Math.hypot(dx, dy) < 4) return; d.moved = true; setPos(clamp({ x: d.x + dx, y: d.y + dy })); };
  const onUp = () => { const d = drag.current; drag.current = null; if (d?.moved) setPos((p) => { SAVE("modo-dock-pos", p); return p; }); };
  const reset = () => { setPos(null); try { localStorage.removeItem("modo-dock-pos"); } catch {} };
  return { ref, pos, side, grip: { onPointerDown: onDown, onPointerMove: onMove, onPointerUp: onUp, onPointerCancel: onUp, onDoubleClick: reset } };
}

export default function FloatDock({ extra }) {
  const dock = useDockDrag();
  const path = usePathname() || "";
  const { chat } = useShell();
  const [open, setOpen] = useState({ chat: false, notes: false, tools: false });
  useEffect(() => { setOpen(LS("modo-float-open", { chat: false, notes: false, tools: false })); }, []);
  const set = (k, v) => setOpen((o) => { const n = { ...o, [k]: v }; SAVE("modo-float-open", n); return n; });
  const onChatPage = /\/(admin|agent)\/chat/.test(path);
  const unread = (chat?.conversations || []).reduce((n, c) => n + (c.unread || 0), 0);
  // Alt+N notes · Alt+T tools · Alt+C chat
  useEffect(() => {
    const k = (e) => { if (!e.altKey || e.ctrlKey || e.metaKey) return; const m = { n: "notes", t: "tools", c: "chat" }[e.key.toLowerCase()]; if (m) { e.preventDefault(); setOpen((o) => { const n = { ...o, [m]: !o[m] }; SAVE("modo-float-open", n); return n; }); } };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, []);
  return (
    <>
      <div ref={dock.ref} className={"fl-dock" + (dock.pos ? " placed" : "") + (dock.side.down ? " down" : "") + (dock.side.left ? " left" : "")}
        style={dock.pos ? { left: dock.pos.x, top: dock.pos.y, right: "auto", bottom: "auto" } : undefined} role="toolbar" aria-label="Floating tools">
        <button className="fl-grip" aria-label="Move these buttons (drag). Double-click to reset." title="Drag to move · double-click to reset" {...dock.grip}><GripVertical size={16} /></button>
        <button className={"fl-fab" + (open.notes ? " on" : "")} onClick={() => set("notes", !open.notes)} title="Notepad (Alt+N)" aria-label="Notepad"><NotebookPen size={18} /></button>
        <button className={"fl-fab" + (open.tools ? " on" : "")} onClick={() => set("tools", !open.tools)} title="Tools (Alt+T)" aria-label="Tools"><Wrench size={18} /></button>
        {!onChatPage && <button className={"fl-fab" + (open.chat ? " on" : "")} onClick={() => set("chat", !open.chat)} title="Chats (Alt+C)" aria-label="Chats"><MessageSquare size={18} />{unread > 0 && <em className="fl-badge">{unread > 99 ? "99+" : unread}</em>}</button>}
        {extra}
      </div>
      {open.notes && <FloatNotes onClose={() => set("notes", false)} />}
      {open.tools && <FloatWin id="tools" title="Tools" icon={<Wrench size={15} />} onClose={() => set("tools", false)} width={420} height={560}><ToolsPanel /></FloatWin>}
      {open.chat && !onChatPage && <FloatChat onClose={() => set("chat", false)} />}
    </>
  );
}
