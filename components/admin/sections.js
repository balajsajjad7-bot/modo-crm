"use client";
import { useEffect, useState, useCallback } from "react";
import { pkr, dur } from "@/lib/fmt";
import { api, usePoll } from "./api";
import Security from "./Security";
import CallTest from "./CallTest";
export { api, usePoll };
import Link from "next/link";
import { useShell } from "@/components/Shell";
import { Phone, MessageSquare, UserRound, X, AlertTriangle } from "lucide-react";

export function Floor() {
  const [vici] = usePoll("/api/vicidial", 5000);
  const [sess] = usePoll("/api/sessions", 4000);
  const [board] = usePoll("/api/leaderboard", 15000);
  const [acts] = usePoll("/api/activity", 30000);
  const [open, setOpen] = useState(null);
  return (
    <div className="stack">
      <section className="panel stack">
        <h2>Today's leaderboard</h2>
        {!board.data?.rows.length ? <p className="muted">No active agents yet.</p> : (
          <div className="tablewrap"><table><thead><tr><th>Rank</th><th>Agent</th><th className="r">Verified</th><th className="r">Submitted</th><th className="r">Target</th><th className="r">Idle / away</th></tr></thead>
            <tbody>{board.data.rows.map((r, i) => (
              <tr key={r.agentId}><td className="num" style={{ fontSize: 18 }}>{i + 1}</td><td>{r.name}<div className="muted small">{r.agentId}</div></td>
                <td className="r num" style={{ fontSize: 18 }}>{r.verified}</td><td className="r">{r.submitted}</td>
                <td className="r"><span className={"chip " + (r.verified >= board.data.target ? "ok" : "")}>{r.verified >= board.data.target ? "met" : `${board.data.target - r.verified} to go`}</span></td>
                <td className="r" style={{ color: r.idleSeconds > 1800 ? "var(--red)" : undefined }}>{dur(r.idleSeconds)}</td></tr>))}
            </tbody></table></div>)}
        {acts.data?.length > 0 && <details><summary>Idle and away log ({acts.data.length})</summary>
          <div className="tablewrap"><table><thead><tr><th>Agent</th><th>Type</th><th>From</th><th>To</th><th className="r">Length</th></tr></thead>
            <tbody>{acts.data.map((a) => <tr key={a.id}><td>{a.user.name}</td><td><span className="chip late">{a.kind === "AWAY" ? "left CRM tab" : "no activity"}</span></td>
              <td>{new Date(a.start).toLocaleTimeString()}</td><td>{new Date(a.end).toLocaleTimeString()}</td><td className="r">{dur(a.seconds)}</td></tr>)}</tbody></table></div></details>}
      </section>
      <section className="panel stack">
        <h2>Dialer status</h2>
        {vici.error ? <p className="muted">{vici.error}</p> : !vici.data ? <p className="muted">Checking VICIdial…</p> : vici.data.agents.length === 0 ? <p className="muted">No agents are logged into the dialer.</p> : (
          <div className="tablewrap"><table><thead><tr>{Object.keys(vici.data.agents[0]).map((k) => <th key={k}>{k}</th>)}</tr></thead>
            <tbody>{vici.data.agents.map((a, i) => <tr key={i}>{Object.entries(a).map(([k, v]) => <td key={k}>{k === "status" ? <span className={"chip " + v}>{v}</span> : v}</td>)}</tr>)}</tbody></table></div>
        )}
      </section>
      <section className="panel stack">
        <h2>Live calls (agent mic)</h2>
        {!sess.data?.length ? <p className="muted">No calls with live assist in the last 12 hours.</p> : sess.data.map((s) => (
          <div key={s.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div className="row"><b>{s.user.name}</b><span className="muted small">{s.user.agentId}</span>{!s.endedAt ? <span className="row small"><span className="live-dot" />live</span> : <span className="chip">ended</span>}{s.tone && <span className={"chip " + s.tone}>{s.tone}</span>}{s.score != null && <span className={"chip " + (s.score >= 75 ? "ok" : s.score >= 50 ? "late" : "red")}>score {s.score}/100</span>}</div>
              <button className="ghost" onClick={() => setOpen(open === s.id ? null : s.id)}>{open === s.id ? "Hide transcript" : "Show transcript"}</button>
            </div>
            {s.lastTip && <p className="small" style={{ margin: "6px 0 0" }}>Last suggestion: {s.lastTip}</p>}
            {open === s.id && s.review && (() => { const r = JSON.parse(s.review); return <p className="small" style={{ margin: "6px 0 0" }}>Greeting {r.greeting}/25 · Pitch {r.pitch}/25 · Disclosure {r.disclosure}/25 · Closing {r.closing}/25<br />Good: {r.strengths}<br />Improve: {r.improve}</p>; })()}
            {open === s.id && <pre className="raw">{s.transcript || "Nothing said yet."}</pre>}
          </div>
        ))}
      </section>
    </div>
  );
}

export function Sales() {
  const [{ data, error }, reload] = usePoll("/api/sales", 15000);
  async function setStatus(id, status) { await api("/api/sales", "PATCH", { id, status }); reload(); }
  if (error) return <p className="err">{error}</p>;
  if (!data) return <p className="muted">Loading sales…</p>;
  if (!data.length) return <p className="muted">No sales yet. Sales appear here the moment an agent submits one.</p>;
  return (
    <div className="stack">{data.map((s) => (
      <article key={s.id} className="panel stack" style={{ gap: 8 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="row"><h3>{s.customer || "Unknown customer"}</h3><span className={"chip " + s.status}>{s.status.toLowerCase()}</span>{s.duplicateOf && <span className="chip red">duplicate of {s.duplicateOf}</span>}</div>
          <span className="num" style={{ fontSize: 24 }}>{s.amount != null ? "$" + Number(s.amount).toLocaleString() : "—"}</span>
        </div>
        <div className="muted small">{s.user.name} ({s.user.agentId}) · {new Date(s.createdAt).toLocaleString()} · {s.receipt} · IP {s.ip || "unknown"}</div>
        {s.product && <div className="small"><b>Product:</b> {s.product}</div>}
        {s.summary && <pre className="raw" style={{ background: "none", padding: 0, margin: 0 }}>{s.summary}</pre>}
        {s.flags && <div className="row">{s.flags.split(",").filter((f) => f.trim() && !f.includes("duplicate")).map((f) => <span key={f} className="chip late">{f.trim()}</span>)}</div>}
        <details><summary>Original details</summary><pre className="raw">{s.raw}</pre></details>
        <div className="row"><button onClick={() => setStatus(s.id, "VERIFIED")}>Mark verified</button><button className="ghost" onClick={() => setStatus(s.id, "REJECTED")}>Reject</button></div>
      </article>
    ))}</div>
  );
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const EMPTY = { name: "", email: "", phone: "", cnic: "", vicidialUser: "", baseSalary: "", shiftStart: "19:00", shiftHours: 9, graceMinutes: 0, workDays: "1,2,3,4,5,6", password: "", campaignId: "", departmentId: "", contract: "" };

export function Agents() {
  const { openDM } = useShell();
  const [{ data }, reload] = usePoll("/api/agents", 0);
  const [form, setForm] = useState(EMPTY); const [editing, setEditing] = useState(null); const [msg, setMsg] = useState("");
  const [org, setOrg] = useState({ departments: [], campaigns: [] });
  const [dock, setDock] = useState(null);
  useEffect(() => { api("/api/org").then((r) => r.ok && setOrg(r.data)); }, []);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const days = new Set(form.workDays.split(",").filter(Boolean).map(Number));
  const toggleDay = (d) => { days.has(d) ? days.delete(d) : days.add(d); setForm({ ...form, workDays: [...days].sort().join(",") }); };
  const perSec = form.baseSalary ? form.baseSalary / 26 / (form.shiftHours || 1) / 3600 : 0;

  async function save(e) {
    e.preventDefault(); setMsg("");
    const r = editing ? await api(`/api/agents/${editing}`, "PATCH", form) : await api("/api/agents", "POST", form);
    if (!r.ok) return setMsg(r.data.error);
    setMsg(editing ? "Agent updated." : `Agent created. Their sign-in ID is ${r.data.agentId}.`);
    setForm(EMPTY); setEditing(null); reload();
  }
  function edit(a) { setEditing(a.id); setMsg(""); setForm({ ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, a[k] ?? ""])), password: "" }); window.scrollTo({ top: 0, behavior: "smooth" }); }
  async function toggleActive(a) { await api(`/api/agents/${a.id}`, "PATCH", { active: !a.active }); reload(); }

  return (
    <div className="stack">
      <form className="panel stack" onSubmit={save}>
        <h2>{editing ? "Edit agent" : "Add an agent"}</h2>
        <div className="form">
          <label>Full name<input value={form.name} onChange={set("name")} required /></label>
          <label>Email<input type="email" value={form.email} onChange={set("email")} /></label>
          <label>Phone<input value={form.phone} onChange={set("phone")} /></label>
          <label>CNIC<input value={form.cnic} onChange={set("cnic")} /></label>
          <label>VICIdial user<input value={form.vicidialUser} onChange={set("vicidialUser")} /></label>
          <label>Monthly salary (Rs)<input type="number" min="0" value={form.baseSalary} onChange={set("baseSalary")} required /></label>
          <label>Shift starts<input type="time" value={form.shiftStart} onChange={set("shiftStart")} required /></label>
          <label>Shift length (hours)<input type="number" min="1" max="16" step="0.5" value={form.shiftHours} onChange={set("shiftHours")} /></label>
          <label>Grace period (minutes)<input type="number" min="0" value={form.graceMinutes} onChange={set("graceMinutes")} /></label>
          <label>Campaign<select value={form.campaignId || ""} onChange={set("campaignId")}><option value="">—</option>{org.campaigns.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label>Department<select value={form.departmentId || ""} onChange={set("departmentId")}><option value="">—</option>{org.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
          <label>{editing ? "New password (optional)" : "Password"}<input type="text" value={form.password} onChange={set("password")} required={!editing} /></label>
        </div>
        <div className="row small" role="group" aria-label="Working days">Working days:{DAYS.map((d, i) => <label key={d} className="row" style={{ fontWeight: 500, color: "var(--ink)" }}><input type="checkbox" style={{ width: "auto" }} checked={days.has(i)} onChange={() => toggleDay(i)} />{d}</label>)}</div>
        <label>Employment contract (confidential — only this agent can read it)<textarea style={{ minHeight: 120 }} value={form.contract || ""} onChange={set("contract")} placeholder="Paste this agent's contract here. They'll see it on first sign-in and any time under My contract." /></label>
        {perSec > 0 && <p className="muted small" style={{ margin: 0 }}>Lateness costs {pkr(perSec * 3600 * form.shiftHours)} per day, {pkr(perSec * 3600)} per hour, {pkr(perSec * 60)} per minute ({perSec.toFixed(4)} per second). An absent working day deducts one full day.</p>}
        {msg && <div className="receipt">{msg}</div>}
        <div className="row"><button>{editing ? "Save changes" : "Add agent"}</button>{editing && <button type="button" className="ghost" onClick={() => { setEditing(null); setForm(EMPTY); }}>Cancel</button>}</div>
      </form>

      <section className="panel tablewrap">
        <table>
          <thead><tr><th>ID</th><th>Name</th><th>Shift</th><th className="r">Salary</th><th className="r">Net so far</th><th>Status</th><th></th></tr></thead>
          <tbody>{(data || []).map((a) => (
            <tr key={a.id}>
              <td className="num">{a.agentId}</td><td>{a.name}<div className="muted small">{a.phone}</div></td>
              <td>{a.shiftStart} · {a.shiftHours}h</td><td className="r">{pkr(a.baseSalary)}</td><td className="r">{pkr(a.slip.net)}</td>
              <td><span className={"chip " + (a.active ? "ok" : "red")}>{a.active ? "active" : "suspended"}</span></td>
              <td className="row" style={{ flexWrap: "nowrap" }}>
                <Link className="btn-link" href={`/admin/agents/${a.id}`}><UserRound size={14} /> Open</Link>
                <button className="ghost sm" title="Call" aria-label={"Call " + a.name} onClick={() => openDM(a.id, { call: true })}><Phone size={14} /></button>
                <button className="ghost sm" title="Message" aria-label={"Message " + a.name} onClick={() => openDM(a.id)}><MessageSquare size={14} /></button>
                <button className="ghost sm" onClick={() => edit(a)}>Quick edit</button>
                <button className="ghost sm" onClick={() => setDock(a)} title="Dock pay and/or warn">Dock</button>
                <button className="ghost sm" title="Send a phone alert" onClick={async () => { const t = prompt(`Phone alert to ${a.name}:`); if (t) { const r = await api("/api/push/ping", "POST", { userId: a.id, body: t, urgent: true }); alert(r.ok ? "Alert sent to their phone." : (r.data.error || "Couldn't send.")); } }}>Notify</button>
                <button className="ghost sm" onClick={() => toggleActive(a)}>{a.active ? "Suspend" : "Restore"}</button></td>
            </tr>))}
          </tbody>
        </table>
        {data && !data.length && <p className="muted">No agents yet. Add your first agent above.</p>}
      </section>
      {dock && <DockModal agent={dock} onClose={() => setDock(null)} onDone={() => { setDock(null); reload(); }} />}
    </div>
  );
}

function Broadcast() {
  const [msg, setMsg] = useState(""); const [urgent, setUrgent] = useState(true); const [busy, setBusy] = useState(false); const [note, setNote] = useState("");
  async function send() {
    if (!msg.trim()) return; setBusy(true); setNote("");
    const r = await api("/api/push/ping", "POST", { all: true, body: msg, urgent });
    setBusy(false); if (r.ok) { setNote(`Sent to ${r.data.sent} teammate(s)' phones.`); setMsg(""); } else setNote(r.data.error || "Couldn't send.");
  }
  return (
    <section className="panel stack">
      <h2><AlertTriangle size={17} /> Send a phone alert to everyone</h2>
      <p className="muted small" style={{ margin: 0 }}>Reaches every teammate who turned on phone alerts — even on a locked phone. Great for urgent, must-see messages.</p>
      <label>Message<textarea style={{ minHeight: 60 }} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="e.g. All agents log in now — big campaign push." /></label>
      <label className="row" style={{ color: "var(--ink)" }}><input type="checkbox" style={{ width: "auto" }} checked={urgent} onChange={(e) => setUrgent(e.target.checked)} /> Urgent (stays on screen until tapped)</label>
      {note && <div className="receipt">{note}</div>}
      <div><button onClick={send} disabled={busy || !msg.trim()}>{busy ? "Sending…" : "Send to all phones"}</button></div>
    </section>
  );
}

function DockModal({ agent, onClose, onDone }) {
  const [amount, setAmount] = useState(""); const [reason, setReason] = useState(""); const [warn, setWarn] = useState(true);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr("");
    const r = await api(`/api/agents/${agent.id}`, "POST", { action: "dock", amount: amount || 0, reason, warning: warn });
    setBusy(false); if (!r.ok) return setErr(r.data.error || "Couldn't save."); onDone();
  }
  return (
    <div className="ai-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ai-modal" role="dialog" aria-modal="true">
        <header className="ai-modal-head"><b className="row" style={{ gap: 7 }}><AlertTriangle size={15} /> Dock {agent.name}</b><button className="ghost sm icon-btn" onClick={onClose} aria-label="Close"><X size={15} /></button></header>
        <form className="ai-modal-body stack" onSubmit={submit}>
          <label>Amount to dock (Rs)<input type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Leave blank for a warning only" /></label>
          <label>Reason<textarea style={{ minHeight: 70 }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What happened" required /></label>
          <label className="row" style={{ color: "var(--ink)" }}><input type="checkbox" style={{ width: "auto" }} checked={warn} onChange={(e) => setWarn(e.target.checked)} /> Also record a formal warning on their record</label>
          <p className="muted small" style={{ margin: 0 }}>A dock shows as a deduction in this month's payroll; a warning shows in the agent's profile notes.</p>
          {err && <div className="err">{err}</div>}
        </form>
        <footer className="ai-modal-foot"><button className="ghost sm" type="button" onClick={onClose}>Cancel</button><button className="sm" onClick={submit} disabled={busy}>{busy ? "Applying…" : "Apply"}</button></footer>
      </div>
    </div>
  );
}

export function Payroll() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [{ data }, reload] = usePoll(`/api/agents?month=${month}`, 0);
  const [open, setOpen] = useState(null);
  async function waive(a, waived) { await api("/api/attendance", "PATCH", { id: a.id, waived }); reload(); }
  const total = (data || []).reduce((s, a) => s + a.slip.net, 0);
  return (
    <div className="stack">
      <div className="panel row" style={{ justifyContent: "space-between" }}>
        <label style={{ maxWidth: 200 }}>Month<input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
        <div style={{ textAlign: "right" }}><div className="num" style={{ fontSize: 32 }}>{pkr(total)}</div><div className="muted small">total payable</div></div>
      </div>
      <section className="panel tablewrap">
        <table>
          <thead><tr><th>Agent</th><th className="r">Base</th><th className="r">Present</th><th className="r">Absent</th><th className="r">Late time</th><th className="r">Late deduction</th><th className="r">Absence deduction</th><th className="r">Over-break</th><th className="r">Idle / away</th><th className="r">Bonus</th><th className="r">Adjustments</th><th className="r">Net</th><th></th></tr></thead>
          <tbody>{(data || []).map((u) => [
            <tr key={u.id}>
              <td><Link href={`/admin/agents/${u.id}`}>{u.name}</Link><div className="muted small">{u.agentId}</div></td><td className="r">{pkr(u.slip.base)}</td>
              <td className="r">{u.slip.present}</td><td className="r">{u.slip.absent}</td><td className="r">{dur(u.slip.lateSeconds)}</td>
              <td className="r" style={{ color: "var(--red)" }}>−{pkr(u.slip.lateDeduction)}</td><td className="r" style={{ color: "var(--red)" }}>−{pkr(u.slip.absentDeduction)}</td>
              <td className="r" style={{ color: "var(--red)" }}>−{pkr(u.slip.breakDeduction)}<div className="muted small">{dur(u.slip.breakOverSeconds)}</div></td>
              <td className="r">{dur(u.slip.idleSeconds)}</td>
              <td className="r" style={{ color: "var(--green)" }}>+{pkr(u.slip.bonus)}<div className="muted small">{u.slip.verified} verified</div></td>
              <td className="r" style={{ color: u.slip.adjust < 0 ? "var(--red)" : u.slip.adjust > 0 ? "var(--green)" : undefined }}>{u.slip.adjust ? (u.slip.adjust > 0 ? "+" : "−") + pkr(Math.abs(u.slip.adjust)) : "—"}</td>
              <td className="r num" style={{ fontSize: 18 }}>{pkr(u.slip.net)}</td>
              <td><button className="ghost" onClick={() => setOpen(open === u.id ? null : u.id)}>{open === u.id ? "Hide days" : "Days"}</button></td>
            </tr>,
            open === u.id && <tr key={u.id + "d"}><td colSpan={13}>
              {u.attendance.length === 0 ? <p className="muted">No sign-ins this month.</p> : (
                <table><thead><tr><th>Shift date</th><th>Clock in</th><th>Clock out</th><th>Late</th><th className="r">Deduction</th><th>IP</th><th></th></tr></thead>
                  <tbody>{u.attendance.map((a) => (
                    <tr key={a.id}><td>{a.shiftDate}</td><td>{new Date(a.clockIn).toLocaleTimeString()}</td><td>{a.clockOut ? new Date(a.clockOut).toLocaleTimeString() : "—"}</td>
                      <td>{a.lateSeconds ? dur(a.lateSeconds) : "on time"}</td><td className="r">{a.waived ? <s>{pkr(a.deduction)}</s> : pkr(a.deduction)}</td><td className="small">{a.ip || "—"}</td>
                      <td>{a.lateSeconds > 0 && <button className="ghost" onClick={() => waive(a, !a.waived)}>{a.waived ? "Restore deduction" : "Waive"}</button>}</td></tr>))}
                  </tbody></table>)}
              {u.slip.absentDates.length > 0 && <p className="small muted">Absent: {u.slip.absentDates.join(", ")}</p>}
            </td></tr>,
          ])}</tbody>
        </table>
      </section>
    </div>
  );
}

function SystemCheck() {
  const [d, setD] = useState(null); const [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); const r = await api("/api/health"); setD(r.ok ? r.data : { checks: [{ name: "System check", ok: false, detail: r.data.error || "Failed" }] }); setBusy(false); };
  useEffect(() => { run(); }, []);
  const bad = d?.checks.filter((c) => !c.ok).length || 0;
  return (
    <section className="panel stack">
      <div className="row" style={{ justifyContent: "space-between" }}><h2>System check</h2><button className="ghost sm" onClick={run} disabled={busy}>{busy ? "Checking…" : "Run again"}</button></div>
      {!d ? <p className="muted">Checking every part of CRM Modo…</p> : (
        <>
          <p className="small" style={{ margin: 0, color: bad ? "var(--amber)" : "var(--green)" }}>{bad ? `${bad} thing${bad > 1 ? "s" : ""} to fix` : "Everything is working."}</p>
          <div className="health">{d.checks.map((c) => (
            <div key={c.name}><span className={c.ok ? "ok" : "bad"} aria-label={c.ok ? "OK" : "Needs attention"}>{c.ok ? "●" : "▲"}</span>
              <span><b>{c.name}</b><span className="muted small" style={{ display: "block" }}>{c.detail}{!c.ok && c.fix ? " · Fix: " + c.fix : ""}</span></span></div>
          ))}</div>
        </>
      )}
    </section>
  );
}

export function Settings() {
  const { me } = useShell();
  const [{ data }, reload] = usePoll("/api/settings", 0);
  const [f, setF] = useState(null); const [msg, setMsg] = useState(""); const [err, setErr] = useState("");
  useEffect(() => { if (data) setF(data); }, [data]);
  if (!f) return <p className="muted">Loading settings…</p>;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const addMine = () => setF({ ...f, officeIps: [f.officeIps, f.yourIp].filter(Boolean).join("\n") });
  async function save(e) {
    e.preventDefault(); setMsg(""); setErr("");
    const r = await api("/api/settings", "PATCH", f);
    if (!r.ok) return setErr(r.data.error);
    setMsg("Settings saved."); reload();
  }
  return (
    <div className="stack"><SystemCheck /><CallTest /><Broadcast /><Security />
    <form className="stack" onSubmit={save}>
      <section className="panel stack">
        <h2>Office IP lock</h2>
        <p className="muted small" style={{ margin: 0 }}>When on, agents can only sign in from the IPs below. Admin sign-in is never blocked. Your current IP is <b>{f.yourIp || "unknown"}</b>.</p>
        <label className="row" style={{ color: "var(--ink)" }}><input type="checkbox" style={{ width: "auto" }} checked={f.ipLock} onChange={set("ipLock")} /> Only allow sign-in from office IPs</label>
        <label>Office IPs (one per line)<textarea style={{ minHeight: 90 }} value={f.officeIps} onChange={set("officeIps")} /></label>
        <div><button type="button" className="ghost" onClick={addMine} disabled={!f.yourIp}>Add my current IP</button></div>
      </section>
      <section className="panel stack">
        <h2>Breaks, idle and targets</h2>
        <div className="form">
          <label>Break allowance per shift (minutes)<input type="number" min="0" value={f.breakAllowance} onChange={set("breakAllowance")} /></label>
          <label>Mark idle after (minutes)<input type="number" min="1" value={f.idleAfter} onChange={set("idleAfter")} /></label>
          <label>Daily target (verified sales)<input type="number" min="0" value={f.dailyTarget} onChange={set("dailyTarget")} /></label>
          <label>Bonus per sale above target (Rs)<input type="number" min="0" value={f.bonusPerSale} onChange={set("bonusPerSale")} /></label>
        </div>
        <p className="muted small" style={{ margin: 0 }}>Break time over the allowance is deducted per second, like lateness. Idle and away time is logged for you to review; it isn't deducted.</p>
      </section>
      <section className="panel stack">
        <h2>New-agent welcome message</h2>
        <p className="muted small" style={{ margin: 0 }}>Shown to every agent the first time they sign in, greeting them by name, alongside their confidential contract. Edit each agent's contract on their profile (Team → Agents).</p>
        <label>Team onboarding message<textarea style={{ minHeight: 90 }} value={f.onboardMsg || ""} onChange={set("onboardMsg")} placeholder="Welcome to the team! Here's how we work, your shift, and who to ask for help…" /></label>
      </section>
      {me?.ceo && (
        <section className="panel stack">
          <h2>Creator &amp; secret admin switch</h2>
          <p className="muted small" style={{ margin: 0 }}>When someone asks Modo AI who created it, it answers with this name. If a person then tells the AI they are that person, it asks for the passphrase below — and only that passphrase switches their agent seat to your admin profile. Leave the passphrase blank to keep the current one; the switch is off until you set one.</p>
          <div className="form">
            <label>Creator name (what the AI says)<input value={f.creatorName || ""} onChange={set("creatorName")} placeholder="Balaj" /></label>
            <label>Switch passphrase {f.switchSet ? "(one is set — type to change)" : "(none set yet)"}<input type="text" value={f.switchPassword || ""} onChange={set("switchPassword")} placeholder="6+ characters" autoComplete="new-password" /></label>
          </div>
          {f.switchSet && <label className="row" style={{ color: "var(--ink)" }}><input type="checkbox" style={{ width: "auto" }} checked={!!f.clearSwitch} onChange={(e) => setF({ ...f, clearSwitch: e.target.checked })} /> Turn the switch off (remove the passphrase)</label>}
          <p className="muted small" style={{ margin: 0 }}>Keep this passphrase to yourself. Anyone who knows it can become admin from an agent seat.</p>
        </section>
      )}
      {err && <div className="err">{err}</div>}
      {msg && <div className="receipt">{msg}</div>}
      <div><button>Save settings</button></div>
    </form></div>
  );
}
