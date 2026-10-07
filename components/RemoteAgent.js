"use client";
// Agent side of Remote control: checks in every 8 seconds and runs the admin's commands
// (message pop-up, lock screen, sign out, reload, open a page, end break, set status).
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { Lock, MessageSquare } from "lucide-react";

export default function RemoteAgent({ onSignOut, setStatus }) {
  const path = usePathname(); const router = useRouter();
  const [msg, setMsg] = useState(null); const [locked, setLocked] = useState(null);
  const pathRef = useRef(path); pathRef.current = path;
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (stop) return;
      const r = await fetch("/api/remote/poll", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: pathRef.current, title: document.title, visible: !document.hidden, idle: !!window.__modoIdle }) }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
      if (!r || stop) return;
      setLocked(r.locked);
      for (const c of r.cmds || []) {
        if (c.type === "message") setMsg(c);
        else if (c.type === "logout") { onSignOut?.(); }
        else if (c.type === "reload") location.reload();
        else if (c.type === "open" && c.url) router.push(c.url);
        else if (c.type === "endBreak") fetch("/api/breaks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "end" }) }).catch(() => {});
        else if (c.type === "status" && c.status) setStatus?.(c.status);
      }
    };
    tick(); const t = setInterval(tick, 8000);
    return () => { stop = true; clearInterval(t); };
  }, []); // eslint-disable-line
  if (typeof document === "undefined") return null;
  return (
    <>
      {locked && createPortal(
        <div className="rm-lock" role="alertdialog" aria-label="Screen locked by admin"><div className="rm-lock-card"><span className="rm-lock-ic"><Lock size={30} /></span><h2>Locked by {locked.by}</h2><p>{locked.text}</p><small>This unlocks by itself when your admin unlocks it.</small></div></div>, document.body)}
      {msg && !locked && createPortal(
        <div className="ai-overlay" onMouseDown={(e) => e.target === e.currentTarget && setMsg(null)}>
          <div className="ai-modal rm-msg" role="alertdialog" aria-label="Message from admin">
            <header className="ai-modal-head"><b className="row" style={{ gap: 8 }}><span className="rm-msg-ic"><MessageSquare size={15} /></span> Message from {msg.by}</b></header>
            <div className="ai-modal-body"><p style={{ fontSize: 16, lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>{msg.text}</p></div>
            <footer className="ai-modal-foot"><button className="sm" onClick={() => setMsg(null)}>Got it</button></footer>
          </div>
        </div>, document.body)}
    </>
  );
}
