"use client";
// Opened by scanning the office kiosk QR code with a phone.
import { useEffect, useState } from "react";

export default function CheckIn() {
  const [t, setT] = useState(""); const [state, setState] = useState("loading"); const [msg, setMsg] = useState(""); const [id, setId] = useState(""); const [pw, setPw] = useState("");
  const send = async (body) => {
    const r = await fetch("/api/checkin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const d = await r.json(); setMsg(r.ok ? `${d.name}: ${d.message}` : d.error); setState(r.ok ? "done" : r.status === 401 ? "form" : "error");
  };
  useEffect(() => {
    const token = new URLSearchParams(location.search).get("t") || ""; setT(token);
    fetch("/api/me").then((r) => r.ok ? r.json() : null).then((me) => { if (me?.role === "AGENT") send({ t: token }); else setState("form"); });
  }, []);
  return (
    <main className="login">
      <div className="panel">
        <div className="pn-logo" style={{ padding: 0 }}><span className="diamond" /><b>Modo</b></div>
        <h1 style={{ fontSize: 22 }}>Office check-in</h1>
        {state === "loading" && <p className="muted">Checking you in…</p>}
        {state === "done" && <div className="receipt" role="status">{msg}</div>}
        {state === "error" && <><div className="err">{msg}</div><p className="muted small">Scan the code on the office screen again.</p></>}
        {state === "form" && (
          <form className="stack" onSubmit={(e) => { e.preventDefault(); setState("loading"); send({ t, agentId: id, password: pw }); }}>
            {msg && <div className="err">{msg}</div>}
            <label>Agent ID<input value={id} onChange={(e) => setId(e.target.value.toUpperCase())} autoComplete="username" required /></label>
            <label>Password<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" required /></label>
            <button>Check in</button>
          </form>
        )}
        <a href="/" className="small">Open Modo</a>
      </div>
    </main>
  );
}
