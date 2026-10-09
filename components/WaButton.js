"use client";
// "WhatsApp" button. For admins with a WhatsApp number linked in Modo (Setup → WhatsApp) it opens a small
// composer and sends FROM that number (the chat also shows in the WhatsApp inbox). Otherwise it opens your
// normal WhatsApp (app or WhatsApp Web) with the chat and text filled in. US numbers get +1, Pakistani 03xx get +92.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Send, X, Loader2, ExternalLink, CheckCircle2 } from "lucide-react";

export const waNumber = (phone) => {
  let d = String(phone || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 10 && /^[2-9]/.test(d)) d = "1" + d;                    // US (10 digits)
  else if (d.length === 11 && d.startsWith("03")) d = "92" + d.slice(1);  // Pakistan mobile 03xx…
  else if (d.length === 10 && d.startsWith("3")) d = "92" + d;            // Pakistan mobile without the 0
  return d;
};
export const waLink = (phone, text = "") => {
  const n = waNumber(phone);
  return `https://wa.me/${n}${text ? "?text=" + encodeURIComponent(text) : ""}`;
};
const Icon = ({ size = 13 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.6-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2c0 1.3.9 2.5 1 2.7.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" /></svg>
);

// One check per page load: is Modo's WhatsApp linked and is this person allowed to send from it?
let readyP = null;
const isReady = () => (readyP ||= fetch("/api/wa-send", { cache: "no-store" }).then((r) => r.json()).then((d) => !!d.ready).catch(() => false));

export function WaComposer({ phone, name, text, onClose }) {
  const [msg, setMsg] = useState(text || ""); const [st, setSt] = useState("idle"); const [err, setErr] = useState("");
  const send = async () => {
    setSt("busy"); setErr("");
    const r = await fetch("/api/wa-send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ to: phone, text: msg, name }) }).then(async (x) => ({ ok: x.ok, d: await x.json().catch(() => ({})) })).catch(() => ({ ok: false, d: { error: "Network problem." } }));
    if (r.ok) { setSt(r.d.queued ? "queued" : "sent"); setTimeout(onClose, 1600); } else { setSt("idle"); setErr(r.d.error || "Didn't send."); }
  };
  return createPortal(
    <div className="wac-back" onClick={onClose}>
      <div className="wac" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Send on WhatsApp">
        <div className="wac-head"><span className="wac-ic"><Icon size={18} /></span><span><b>WhatsApp {name ? "· " + name : ""}</b><small>+{waNumber(phone)} · sent from your Modo WhatsApp</small></span><button type="button" data-plain className="wac-x" onClick={onClose} aria-label="Close"><X size={16} /></button></div>
        {st === "sent" || st === "queued" ? (
          <div className="wac-done"><CheckCircle2 size={30} /><b>{st === "sent" ? "Sent on WhatsApp" : "Queued — it goes out the moment your WhatsApp relay wakes up"}</b></div>
        ) : (
          <>
            <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={7} autoFocus />
            {err && <div className="err small">{err}</div>}
            <div className="wac-acts">
              <a className="btn-link ghost sm" href={waLink(phone, msg)} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Open in my WhatsApp</a>
              <button type="button" className="wac-send" onClick={send} disabled={st === "busy" || !msg.trim()}>{st === "busy" ? <Loader2 size={14} className="spin" /> : <Send size={14} />} Send</button>
            </div>
          </>
        )}
      </div>
    </div>, document.body);
}

export default function WaButton({ phone, text, label = "WhatsApp", iconOnly, title, name }) {
  const [ready, setReady] = useState(false); const [open, setOpen] = useState(false);
  useEffect(() => { if (phone) isReady().then(setReady); }, [phone]);
  const href = phone ? waLink(phone, text) : `https://wa.me/?text=${encodeURIComponent(text || "")}`;
  if (phone && waNumber(phone).length < 8) return null;
  const tip = title || (phone ? (ready ? "Send from Modo's WhatsApp" : "Message on WhatsApp") : "Share on WhatsApp");
  return (
    <>
      <a className={"wa-btn" + (iconOnly ? " icon" : "")} href={href} target="_blank" rel="noreferrer" title={tip} aria-label={tip}
        onClick={(e) => { e.stopPropagation(); if (phone && ready) { e.preventDefault(); setOpen(true); } }}>
        <Icon />{!iconOnly && <span>{label}</span>}
      </a>
      {open && <WaComposer phone={phone} name={name} text={text} onClose={() => setOpen(false)} />}
    </>
  );
}
