"use client";
// CEO-only Secure line. End-to-end encrypted in the browser with AES-256-GCM; the key is derived
// from a passphrase (PBKDF2, 310k rounds) that is never sent anywhere. The server stores ciphertext only.
import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { ShieldCheck, Lock, Send, Trash2, LogOut, KeyRound, AlertTriangle, Eye, EyeOff } from "lucide-react";

const SALT = new TextEncoder().encode("modo-ceo-secure-line-v1");
const te = new TextEncoder(), td = new TextDecoder();
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(pass) {
  const base = await crypto.subtle.importKey("raw", te.encode(pass), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt: SALT, iterations: 310000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function encryptMsg(key, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, te.encode(text));
  return b64(iv) + "." + b64(ct);
}
async function decryptMsg(key, body) {
  const [ivb, ctb] = body.split(".");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(ivb) }, key, unb64(ctb));
  return td.decode(pt);
}
const when = (d) => new Date(d).toLocaleString("en-US", { timeZone: "Asia/Karachi", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default function CeoVault() {
  const [raw, setRaw] = useState(null);        // ciphertext rows from server
  const [key, setKey] = useState(null);        // CryptoKey, in memory only
  const [msgs, setMsgs] = useState([]);        // decrypted {id, text, createdAt}
  const [pass, setPass] = useState(""); const [pass2, setPass2] = useState(""); const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const [draft, setDraft] = useState("");
  const supported = typeof crypto !== "undefined" && crypto.subtle;
  const end = useRef(null);

  const load = () => api("/api/vault").then((r) => r.ok && setRaw(r.data));
  useEffect(() => { load(); }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const firstTime = raw != null && raw.length === 0;

  async function unlock(e) {
    e?.preventDefault(); setErr("");
    if (!supported) return setErr("This browser can't do the encryption. Use a modern browser over HTTPS.");
    if (pass.length < 6) return setErr("Use a passphrase of at least 6 characters.");
    if (firstTime && pass !== pass2) return setErr("The two passphrases don't match.");
    setBusy(true);
    try {
      const k = await deriveKey(pass);
      if (raw.length) {
        // Validate by decrypting the newest message — a wrong passphrase fails GCM auth.
        try { await decryptMsg(k, raw[raw.length - 1].body); }
        catch { setBusy(false); return setErr("Wrong passphrase. Nothing here can be read without the exact passphrase."); }
      }
      const out = [];
      for (const m of raw) { try { out.push({ id: m.id, createdAt: m.createdAt, text: await decryptMsg(k, m.body) }); } catch { out.push({ id: m.id, createdAt: m.createdAt, text: null }); } }
      setMsgs(out); setKey(k); setPass(""); setPass2("");
    } catch { setErr("Couldn't unlock. Try again."); }
    setBusy(false);
  }

  function lock() { setKey(null); setMsgs([]); setDraft(""); setErr(""); }

  async function send(e) {
    e?.preventDefault(); const text = draft.trim(); if (!text || !key) return;
    setBusy(true); setErr(""); setDraft("");
    try {
      const body = await encryptMsg(key, text);
      const r = await api("/api/vault", "POST", { body });
      if (!r.ok) { setErr(r.data.error || "Couldn't save."); setDraft(text); }
      else setMsgs((m) => [...m, { id: r.data.id, createdAt: r.data.createdAt, text }]);
    } catch { setErr("Couldn't encrypt/save."); setDraft(text); }
    setBusy(false);
  }

  async function del(id) {
    if (!confirm("Delete this message permanently?")) return;
    setMsgs((m) => m.filter((x) => x.id !== id));
    await api("/api/vault?id=" + id, "DELETE");
  }

  // ── Locked screen ──
  if (!key) {
    return (
      <div className="stack">
        <section className="panel vault-lock">
          <div className="vault-badge"><ShieldCheck size={40} /></div>
          <h1>Secure line</h1>
          <p className="muted">CEO-only, end-to-end encrypted. Messages are locked with AES-256 using your passphrase. It's never sent to the server — if you forget it, nothing here can be recovered.</p>
          {raw == null ? <p className="muted small">Loading…</p> : (
            <form className="stack" onSubmit={unlock} style={{ maxWidth: 380, margin: "0 auto", width: "100%" }}>
              {firstTime && <div className="receipt" style={{ margin: 0 }}>First time — choose a passphrase. Write it down somewhere safe; it cannot be reset.</div>}
              <label className="vault-pass">
                <KeyRound size={15} />
                <input type={show ? "text" : "password"} value={pass} onChange={(e) => setPass(e.target.value)} placeholder={firstTime ? "Choose a passphrase" : "Enter your passphrase"} autoFocus autoComplete="off" />
                <button type="button" className="ghost sm icon-btn" onClick={() => setShow(!show)} aria-label={show ? "Hide" : "Show"}>{show ? <EyeOff size={14} /> : <Eye size={14} />}</button>
              </label>
              {firstTime && <label className="vault-pass"><KeyRound size={15} /><input type={show ? "text" : "password"} value={pass2} onChange={(e) => setPass2(e.target.value)} placeholder="Confirm passphrase" autoComplete="off" /></label>}
              {err && <div className="err" style={{ margin: 0 }}><AlertTriangle size={14} /> {err}</div>}
              <button disabled={busy}><Lock size={15} /> {busy ? "Unlocking…" : firstTime ? "Set passphrase & open" : "Unlock"}</button>
            </form>
          )}
        </section>
      </div>
    );
  }

  // ── Unlocked chat ──
  return (
    <div className="stack vault-open">
      <div className="vault-bar">
        <div className="row" style={{ gap: 8 }}><span className="vault-live"><ShieldCheck size={16} /></span><b>Secure line</b><span className="muted small">encrypted · CEO only</span></div>
        <div className="row" style={{ gap: 6 }}>
          {msgs.length > 0 && <button className="ghost sm" onClick={async () => { if (confirm("Delete ALL messages permanently?")) { setMsgs([]); await api("/api/vault?id=all", "DELETE"); } }}><Trash2 size={13} /> Clear all</button>}
          <button className="ghost sm" onClick={lock}><LogOut size={13} /> Lock</button>
        </div>
      </div>
      <div className="vault-thread">
        {msgs.length === 0 ? <p className="muted" style={{ textAlign: "center", margin: "auto" }}>No messages yet. Anything you type here is encrypted before it leaves this page.</p> :
          msgs.map((m) => (
            <div key={m.id} className="vault-msg">
              <div className="vault-bubble">{m.text == null ? <i className="muted">[can't decrypt — different passphrase]</i> : m.text}</div>
              <div className="vault-meta"><span>{when(m.createdAt)}</span><button className="ghost sm icon-btn" onClick={() => del(m.id)} aria-label="Delete"><Trash2 size={12} /></button></div>
            </div>
          ))}
        <div ref={end} />
      </div>
      {err && <div className="err" style={{ margin: 0 }}>{err}</div>}
      <form className="vault-composer" onSubmit={send}>
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(e); } }} placeholder="Write a secure message…" rows={1} />
        <button disabled={busy || !draft.trim()} aria-label="Send"><Send size={16} /></button>
      </form>
    </div>
  );
}
