"use client";
// Owner-only kill switch: wipes all operational data after the CEO enters the demolish key + types DEMOLISH.
import { useEffect, useState } from "react";
import { api } from "./api";
import { Bomb, ShieldAlert, KeyRound, X } from "lucide-react";

export default function Demolish() {
  const [me, setMe] = useState(null); const [keySet, setKeySet] = useState(false);
  const [open, setOpen] = useState(false); const [setup, setSetup] = useState(false);
  const [key, setKey] = useState(""); const [newKey, setNewKey] = useState(""); const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  useEffect(() => { fetch("/api/me").then((r) => r.json()).then(setMe).catch(() => {}); api("/api/demolish").then((r) => r.ok && setKeySet(!!r.data.keySet)); }, []);
  if (!me?.ceo) return null; // only the owner sees this

  async function saveKey() {
    setBusy(true); setMsg("");
    const r = await api("/api/demolish", "PATCH", { newKey });
    setBusy(false);
    if (!r.ok) return setMsg(r.data.error);
    setKeySet(true); setSetup(false); setNewKey(""); setMsg("Demolish key set.");
  }
  async function demolish() {
    setBusy(true); setMsg("");
    const r = await api("/api/demolish", "POST", { key, confirm });
    setBusy(false);
    if (!r.ok) return setMsg(r.data.error);
    setDone(true);
    setTimeout(() => { location.href = "/"; }, 3500);
  }

  return (
    <section className="panel stack demolish-panel">
      <div className="row" style={{ gap: 10 }}><span className="dz-ico"><Bomb size={20} /></span>
        <div><b>Demolish Modo</b><div className="muted small">Owner-only. Permanently erases all sales, customers, calls, chat, agents and data. Cannot be undone.</div></div>
      </div>
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button className="danger" onClick={() => { setOpen(true); setMsg(""); setKey(""); setConfirm(""); }}><ShieldAlert size={15} /> Demolish Modo</button>
        <button className="ghost sm" onClick={() => { setSetup(true); setMsg(""); setNewKey(""); }}><KeyRound size={13} /> {keySet ? "Change demolish key" : "Set demolish key"}</button>
        {!keySet && <span className="small" style={{ color: "var(--amber)" }}>Set a demolish key first.</span>}
      </div>
      {msg && !open && !setup && <div className="small" style={{ color: /set|key set/i.test(msg) ? "var(--green)" : "var(--amber)" }}>{msg}</div>}

      {setup && (
        <div className="sl-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && setSetup(false)}>
          <div className="sl-modal panel stack" style={{ maxWidth: 420 }}>
            <div className="row" style={{ justifyContent: "space-between" }}><h2><KeyRound size={17} /> {keySet ? "Change" : "Set"} demolish key</h2><button className="ghost sm icon-btn" onClick={() => setSetup(false)}><X size={14} /></button></div>
            <p className="muted small" style={{ margin: 0 }}>This key is required to demolish Modo. Keep it secret. Minimum 8 characters.</p>
            <input type="password" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="New demolish key" autoComplete="new-password" />
            {msg && <div className="err small">{msg}</div>}
            <div className="row"><button onClick={saveKey} disabled={busy || newKey.length < 8}>Save key</button><button className="ghost" onClick={() => setSetup(false)}>Cancel</button></div>
          </div>
        </div>
      )}

      {open && (
        <div className="sl-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && !busy && setOpen(false)}>
          <div className="sl-modal panel stack demolish-modal" style={{ maxWidth: 440 }}>
            {done ? (
              <div className="stack" style={{ alignItems: "center", textAlign: "center", padding: 10 }}>
                <span className="dz-ico big"><Bomb size={30} /></span>
                <h2>Modo demolished</h2>
                <p className="muted small" style={{ margin: 0 }}>All data has been erased. Signing you out…</p>
              </div>
            ) : (
              <>
                <div className="row" style={{ justifyContent: "space-between" }}><h2 style={{ color: "#ff6b74" }}><ShieldAlert size={18} /> Demolish Modo</h2><button className="ghost sm icon-btn" onClick={() => setOpen(false)}><X size={14} /></button></div>
                <div className="err" style={{ margin: 0 }}>This <b>permanently erases everything</b>: sales, customers, calls, chat, agents, connectors and all data. It cannot be undone.</div>
                <label>Demolish key<input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Enter your demolish key" autoComplete="off" /></label>
                <label>Type <b>DEMOLISH</b> to confirm<input value={confirm} onChange={(e) => setConfirm(e.target.value.toUpperCase())} placeholder="DEMOLISH" autoComplete="off" /></label>
                {msg && <div className="err small">{msg}</div>}
                <div className="row"><button className="danger" onClick={demolish} disabled={busy || !key || confirm !== "DEMOLISH"}>{busy ? "Demolishing…" : "Permanently demolish"}</button><button className="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</button></div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
