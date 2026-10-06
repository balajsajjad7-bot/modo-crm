"use client";
// Renders the notepad coach's answer: overview, then per agent, per customer: what to say, how to engage, next step, flags.
import { MessageCircle, AlertTriangle } from "lucide-react";

export default function CoachResult({ res, hideAgentNames }) {
  if (!res) return null;
  return (
    <>
      {res.empty && <p className="muted small" style={{ margin: 0 }}>No notes to read yet.</p>}
      {res.overview && <p className="coach-overview">{res.overview}</p>}
      {(res.agents || []).map((a, i) => (
        <div key={a.agentUserId || i} className="coach-agent">
          {!hideAgentNames && <b>{a.agent}</b>}
          {a.summary && <p className="muted small" style={{ margin: "2px 0 6px" }}>{a.summary}</p>}
          {(a.customers || []).map((c, j) => (
            <div key={j} className="coach-cst">
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}><b>{c.customer || "Customer"}</b>{c.mood && <span className="chip">{c.mood}</span>}</div>
              {c.situation && <p className="small" style={{ margin: "2px 0" }}>{c.situation}</p>}
              {c.say && <blockquote className="tr-say"><MessageCircle size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />{c.say}</blockquote>}
              {c.engage && <p className="small coach-engage"><b>How to engage:</b> {c.engage}</p>}
              {c.next && <p className="small" style={{ margin: 0 }}><b>Next:</b> {c.next}</p>}
              {(c.flags || []).filter(Boolean).map((f, k) => <div key={k} className="tr-warn small"><AlertTriangle size={14} /><span>{f}</span></div>)}
            </div>
          ))}
          {(a.followups || []).filter(Boolean).length > 0 && <ul className="tr-ul small">{a.followups.filter(Boolean).map((f, k) => <li key={k}>{f}</li>)}</ul>}
        </div>
      ))}
    </>
  );
}
