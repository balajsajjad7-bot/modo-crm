"use client";
// "Fix dialer connection": one press wakes the relay, re-opens the dialer's firewall and re-checks everything.
import { useState } from "react";
import { Zap, CheckCircle2, AlertTriangle, XCircle, Loader2 } from "lucide-react";

export default function ViciFix({ onFixed, compact }) {
  const [st, setSt] = useState(null); const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true); setSt(null);
    const r = await fetch("/api/vicidial/fix", { method: "POST" }).then((x) => x.json()).catch(() => ({ ok: false, summary: "Couldn't reach Modo. Check the internet connection." }));
    setBusy(false); setSt(r); if (r.ok) onFixed?.();
  };
  return (
    <section className={"panel vf" + (compact ? " compact" : "")}>
      <div className="vf-head">
        <span className="vf-ic gt" style={{ "--g1": "#fde047", "--g2": "#f59e0b" }}><Zap size={20} /></span>
        <div><b>Dialer not showing everything?</b><span className="muted small">One press: wakes the relay, re-opens the dialer's firewall and re-checks calls, agents and recordings.</span></div>
        <button onClick={run} disabled={busy}>{busy ? <><Loader2 size={15} className="spin" /> Fixing… (up to a minute)</> : <><Zap size={15} /> Fix dialer connection</>}</button>
      </div>
      {st && (
        <div className="vf-res">
          <div className={"vf-sum " + (st.ok ? "ok" : "bad")}>{st.ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />} {st.summary}</div>
          {st.fix && !st.ok && <div className="vf-fix">👉 {st.fix}</div>}
          {(st.done || []).map((x, i) => <div key={"d" + i} className="vf-step ok"><CheckCircle2 size={13} /> {x}</div>)}
          {(st.steps || []).map((x, i) => (
            <div key={i} className={"vf-step " + (!x.ok ? "bad" : x.warn ? "warn" : "ok")}>
              {!x.ok ? <XCircle size={13} /> : x.warn ? <AlertTriangle size={13} /> : <CheckCircle2 size={13} />}
              <span><b>{x.name}</b>{x.detail ? " — " + x.detail : ""}{(x.warn || !x.ok) && x.fix ? <em> {x.fix}</em> : null}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
