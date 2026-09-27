"use client";
import AiButton from "@/components/AiButton";
// Compose and send an email to a customer (uses the SMTP connector). Templates fill in sale/customer details.
import { useEffect, useState } from "react";
import { TEMPLATES, fill } from "@/lib/emailTemplates";
import { Send, X } from "lucide-react";

export default function EmailComposer({ to = "", data = {}, contactId, saleId, sender, onClose, onSent }) {
  const [tpl, setTpl] = useState(data.orderNumber ? "order" : "blank");
  const pick = (id) => { const t = TEMPLATES.find((x) => x.id === id); const d = { ...data, sender }; return { subject: fill(t.subject, d), body: fill(t.body, d) }; };
  const [m, setM] = useState(() => ({ to, ...pick(data.orderNumber ? "order" : "blank") }));
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [ready, setReady] = useState(true); const [depts, setDepts] = useState([]); const [dept, setDept] = useState("");
  useEffect(() => { fetch("/api/org").then((r) => r.json()).then((d) => { setDepts(d.departments || []); const hap = (d.departments || []).find((x) => /happi/i.test(x.name)); if (hap) setDept(hap.id); }).catch(() => {}); }, []);
  useEffect(() => { fetch("/api/email").then((r) => r.json()).then((d) => setReady(!!d.ready)).catch(() => {}); }, []);
  useEffect(() => { const k = (e) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  async function send() {
    setErr(""); setBusy(true);
    const r = await fetch("/api/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...m, contactId, saleId, departmentId: dept || undefined }) });
    const d = await r.json().catch(() => ({})); setBusy(false);
    if (!r.ok) return setErr(d.error || "Couldn't send."); onSent?.(); onClose();
  }
  return (
    <div className="sl-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sl-modal panel wide" role="dialog" aria-label="Email customer">
        <div className="row" style={{ justifyContent: "space-between" }}><h2>Email customer</h2><button className="ghost icon-btn" aria-label="Close" onClick={onClose}><X size={16} /></button></div>
        {!ready && <div className="err small">Email isn't set up yet. Admin → Tools → Connectors → Email (SMTP).</div>}
        <div className="form">
          <label>To<input type="email" value={m.to} onChange={(e) => setM({ ...m, to: e.target.value })} placeholder="customer@email.com" /></label>
          <label>From department<select value={dept} onChange={(e) => setDept(e.target.value)}><option value="">Default sender</option>{depts.map((d) => <option key={d.id} value={d.id}>{d.name}{d.email ? ` (${d.email})` : ""}</option>)}</select></label>
          <label>Template<select value={tpl} onChange={(e) => { setTpl(e.target.value); setM({ ...m, ...pick(e.target.value) }); }}>{TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        </div>
        <div className="row ai-email"><input placeholder="Tell AI what to write, e.g. thank them and confirm install on Friday" value={m.aiPrompt || ""} onChange={(e) => setM({ ...m, aiPrompt: e.target.value })} style={{ flex: 1, minWidth: 200 }} />
          <AiButton task="email_draft" payload={() => ({ prompt: m.aiPrompt || "Improve this email", current: m.aiPrompt ? "" : m.body, customer: data.customer, sender })} label={m.aiPrompt ? "Write with AI" : "Improve with AI"} onResult={(d) => setM((x) => ({ ...x, subject: d.subject || x.subject, body: d.body || x.body }))} /></div>
        <label>Subject<input value={m.subject} onChange={(e) => setM({ ...m, subject: e.target.value })} /></label>
        <label>Message<textarea style={{ minHeight: 240 }} value={m.body} onChange={(e) => setM({ ...m, body: e.target.value })} /></label>
        {err && <div className="err">{err}</div>}
        <div className="row" style={{ justifyContent: "flex-end" }}><button className="ghost" onClick={onClose}>Cancel</button><button onClick={send} disabled={busy || !ready}><Send size={15} /> {busy ? "Sending…" : "Send email"}</button></div>
      </div>
    </div>
  );
}
