"use client";
import WaButton from "@/components/WaButton";
import AiButton from "@/components/AiButton";
// Everything about one agent in one place: edit details, pay, attendance, sales, notes, and quick actions.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { pkr, dur } from "@/lib/fmt";
import { useShell } from "@/components/Shell";
import { api } from "./api";
import { ArrowLeft, Phone, MessageSquare, KeyRound, Ban, RotateCcw, LogOut, Coffee, Plus, Trash2, Save, BadgeDollarSign, CalendarClock, NotebookPen, UserPen, Wallet } from "lucide-react";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function AgentProfile({ id }) {
  const { openDM } = useShell();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [d, setD] = useState(null); const [err, setErr] = useState("");
  const [form, setForm] = useState(null); const [msg, setMsg] = useState("");
  const [note, setNote] = useState(""); const [adj, setAdj] = useState({ amount: "", reason: "" }); const [pw, setPw] = useState("");
  const [tab, setTab] = useState("overview"); const [org, setOrg] = useState({ departments: [], campaigns: [] });
  useEffect(() => { api("/api/org").then((r) => r.ok && setOrg(r.data)); }, []);

  const load = useCallback(() => api(`/api/agents/${id}?month=${month}`).then(({ ok, data }) => {
    if (!ok) return setErr(data.error);
    setD(data); setForm((f) => f || { ...data.user });
  }), [id, month]);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const act = async (body, done) => { setMsg(""); const r = await api(`/api/agents/${id}`, "POST", body); if (!r.ok) return setMsg(r.data.error); done?.(); load(); };
  const save = async (extra) => {
    setMsg("");
    const r = await api(`/api/agents/${id}`, "PATCH", extra || { name: form.name, email: form.email, phone: form.phone, cnic: form.cnic, vicidialUser: form.vicidialUser, baseSalary: form.baseSalary, shiftStart: form.shiftStart, shiftHours: form.shiftHours, graceMinutes: form.graceMinutes, workDays: form.workDays, departmentId: form.departmentId || null, campaignId: form.campaignId || null });
    if (!r.ok) return setMsg(r.data.error);
    setMsg(extra?.password ? "Password changed. Tell the agent their new password." : extra && "active" in extra ? (extra.active ? "Agent restored." : "Agent suspended. They can't sign in.") : "Details saved.");
    setPw(""); setForm(null); load();
  };
  if (err) return <p className="err">{err}</p>;
  if (!d || !form) return <p className="muted">Loading agent…</p>;
  const u = d.user, s = d.slip;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const days = new Set((form.workDays || "").split(",").filter(Boolean).map(Number));
  const toggleDay = (i) => { days.has(i) ? days.delete(i) : days.add(i); setForm({ ...form, workDays: [...days].sort().join(",") }); };

  return (
    <div className="stack">
      <section className="panel profile-head">
        <Link href="/admin/agents" className="ghost icon-btn" aria-label="All agents"><ArrowLeft size={18} /></Link>
        <span className="sl-avatar" style={{ width: 56, height: 56, borderRadius: 14, background: "var(--accent)", fontSize: 20 }}>{u.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}<i className={"presence" + (d.online ? " on" : "")} style={{ borderColor: "var(--card)" }} /></span>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontSize: 22 }}>{u.name}</h1>
          <div className="row small muted" style={{ gap: 8 }}>
            <span className="num">{u.agentId}</span>
            <span className={"chip " + (u.active ? "ok" : "red")}>{u.active ? "active" : "suspended"}</span>
            <span>{d.online ? "Online now" : "Offline"}</span>
            {d.today ? <span className={"chip " + (d.today.lateSeconds ? "late" : "ok")}>{d.today.clockOut ? "clocked out" : "on shift"}{d.today.lateSeconds ? ` · ${dur(d.today.lateSeconds)} late` : ""}</span> : <span className="chip">not signed in today</span>}
            {d.onBreak && <span className="chip late">on break</span>}
          </div>
        </div>
        <div className="row" style={{ marginLeft: "auto" }}>
          <button onClick={() => openDM(u.id, { call: true })}><Phone size={15} /> Call</button>
          <button className="ghost" onClick={() => openDM(u.id)}><MessageSquare size={15} /> Message</button>
        </div>
      </section>

      <div className="facts panel">
        <div><b>{pkr(s.net)}</b><span>net pay ({month})</span></div>
        <div><b>{s.present} / {s.present + s.absent}</b><span>days present</span></div>
        <div><b style={{ color: s.lateSeconds ? "var(--red)" : undefined }}>{dur(s.lateSeconds)}</b><span>late this month</span></div>
        <div><b>{d.stats.verified} / {d.stats.sales}</b><span>verified / total sales</span></div>
        <div><b>{d.stats.avgScore ?? "—"}</b><span>avg call score</span></div>
      </div>

      <div className="row" style={{ justifyContent: "flex-end" }}><AiButton task="agent_review" payload={{ userId: id }} label="AI 30-day review" /></div>
      <nav className="seg" role="tablist">
        {[["overview", "Details"], ["pay", "Pay & adjustments"], ["attendance", "Attendance"], ["sales", "Sales"], ["notes", "Notes"], ["actions", "Actions"]].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}
      </nav>
      {msg && <div className="receipt">{msg}</div>}

      {tab === "overview" && (
        <section className="panel stack">
          <h2><UserPen size={17} /> Edit details</h2>
          <div className="form">
            <label>Full name<input value={form.name || ""} onChange={set("name")} /></label>
            <label>Email<input type="email" value={form.email || ""} onChange={set("email")} /></label>
            <label>Phone<span className="row" style={{ gap: 6, flexWrap: "nowrap" }}><input value={form.phone || ""} onChange={set("phone")} style={{ flex: 1 }} />{form.phone ? <WaButton phone={form.phone} text={`Hi ${String(form.name || "").split(" ")[0]}, `} iconOnly /> : null}</span></label>
            <label>CNIC<input value={form.cnic || ""} onChange={set("cnic")} /></label>
            <label>VICIdial user<input value={form.vicidialUser || ""} onChange={set("vicidialUser")} /></label>
            <label>Monthly salary (Rs)<input type="number" min="0" value={form.baseSalary} onChange={set("baseSalary")} /></label>
            <label>Shift starts<input type="time" value={form.shiftStart} onChange={set("shiftStart")} /></label>
            <label>Shift length (hours)<input type="number" min="1" max="16" step="0.5" value={form.shiftHours} onChange={set("shiftHours")} /></label>
            <label>Grace period (minutes)<input type="number" min="0" value={form.graceMinutes} onChange={set("graceMinutes")} /></label>
            <label>Department<select value={form.departmentId || ""} onChange={set("departmentId")}><option value="">—</option>{org.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
            <label>Campaign<select value={form.campaignId || ""} onChange={set("campaignId")}><option value="">—</option>{org.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          </div>
          <div className="row small" role="group" aria-label="Working days">Working days:{DAYS.map((x, i) => <label key={x} className="row" style={{ fontWeight: 500, color: "var(--foreground)" }}><input type="checkbox" style={{ width: "auto" }} checked={days.has(i)} onChange={() => toggleDay(i)} />{x}</label>)}</div>
          <p className="muted small" style={{ margin: 0 }}>Per second {s.rates.perSecond.toFixed(4)} · per minute {pkr(s.rates.perSecond * 60)} · per hour {pkr(s.rates.perHour)} · per day {pkr(s.rates.perDay)}</p>
          <div className="row"><button onClick={() => save()}><Save size={15} /> Save details</button><button className="ghost" onClick={() => { setForm({ ...u }); setMsg(""); }}>Undo changes</button></div>
        </section>
      )}

      {tab === "pay" && (
        <div className="stack">
          <section className="panel stack">
            <div className="row" style={{ justifyContent: "space-between" }}><h2><Wallet size={17} /> Payslip</h2><label style={{ maxWidth: 180 }}>Month<input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label></div>
            <table><tbody>
              <tr><td>Base salary</td><td className="r">{pkr(s.base)}</td></tr>
              <tr><td>Absent ({s.absent} days)</td><td className="r" style={{ color: "var(--red)" }}>−{pkr(s.absentDeduction)}</td></tr>
              <tr><td>Late ({dur(s.lateSeconds)})</td><td className="r" style={{ color: "var(--red)" }}>−{pkr(s.lateDeduction)}</td></tr>
              <tr><td>Over-break ({dur(s.breakOverSeconds)})</td><td className="r" style={{ color: "var(--red)" }}>−{pkr(s.breakDeduction)}</td></tr>
              <tr><td>Target bonus ({s.verified} verified)</td><td className="r" style={{ color: "var(--green)" }}>+{pkr(s.bonus)}</td></tr>
              {s.adjustments.map((a) => <tr key={a.id}><td>{a.reason} <button className="ghost sm" onClick={() => act({ action: "deleteAdjust", id: a.id })} aria-label="Remove adjustment"><Trash2 size={13} /></button></td><td className="r" style={{ color: a.amount < 0 ? "var(--red)" : "var(--green)" }}>{a.amount < 0 ? "−" : "+"}{pkr(Math.abs(a.amount))}</td></tr>)}
              <tr><td><b>Net pay</b></td><td className="r num" style={{ fontSize: 20 }}>{pkr(s.net)}</td></tr>
            </tbody></table>
          </section>
          <section className="panel stack">
            <h2><BadgeDollarSign size={17} /> Add bonus or deduction</h2>
            <div className="form">
              <label>Amount (Rs, minus for deduction)<input type="number" value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} placeholder="e.g. 2000 or -500" /></label>
              <label>Reason<input value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} placeholder="e.g. Top seller of the week" /></label>
            </div>
            <div><button onClick={() => act({ action: "adjust", ...adj, month }, () => setAdj({ amount: "", reason: "" }))}><Plus size={15} /> Add to {month}</button></div>
          </section>
        </div>
      )}

      {tab === "attendance" && (
        <section className="panel tablewrap">
          <table>
            <thead><tr><th>Shift date</th><th>Clock in</th><th>Clock out</th><th>Late</th><th className="r">Deduction</th><th>IP</th><th></th></tr></thead>
            <tbody>{d.attendance.map((a) => (
              <tr key={a.id}><td>{a.shiftDate}</td><td>{new Date(a.clockIn).toLocaleTimeString()}</td><td>{a.clockOut ? new Date(a.clockOut).toLocaleTimeString() : "—"}</td>
                <td>{a.lateSeconds ? dur(a.lateSeconds) : "on time"}</td><td className="r">{a.waived ? <s>{pkr(a.deduction)}</s> : pkr(a.deduction)}</td><td className="small">{a.ip || "—"}</td>
                <td>{a.lateSeconds > 0 && <button className="ghost sm" onClick={async () => { await api("/api/attendance", "PATCH", { id: a.id, waived: !a.waived }); load(); }}>{a.waived ? "Restore" : "Waive"}</button>}</td></tr>))}
            </tbody>
          </table>
          {!d.attendance.length && <p className="muted">No sign-ins yet.</p>}
        </section>
      )}

      {tab === "sales" && (
        <section className="panel tablewrap">
          <table>
            <thead><tr><th>Receipt</th><th>Customer</th><th>Product</th><th className="r">Amount</th><th>Status</th><th>When</th></tr></thead>
            <tbody>{d.sales.map((x) => <tr key={x.id}><td className="num">{x.receipt}</td><td>{x.customer || "—"}</td><td>{x.product || "—"}</td><td className="r">{x.amount != null ? "$" + x.amount : "—"}</td><td><span className={"chip " + x.status}>{x.status.toLowerCase()}</span></td><td className="small">{new Date(x.createdAt).toLocaleString()}</td></tr>)}</tbody>
          </table>
          {!d.sales.length && <p className="muted">No sales yet.</p>}
        </section>
      )}

      {tab === "notes" && (
        <section className="panel stack">
          <h2><NotebookPen size={17} /> Private notes</h2>
          <p className="muted small" style={{ margin: 0 }}>Only admins see these.</p>
          <textarea style={{ minHeight: 80 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Coaching: slow down on disclosures. Follow up Friday." />
          <div><button onClick={() => act({ action: "note", text: note }, () => setNote(""))} disabled={!note.trim()}><Plus size={15} /> Add note</button></div>
          {d.notes.map((n) => (
            <div key={n.id} style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
              <div className="row small muted" style={{ justifyContent: "space-between" }}><span>{n.by} · {new Date(n.createdAt).toLocaleString()}</span><button className="ghost sm" onClick={() => act({ action: "deleteNote", id: n.id })}><Trash2 size={13} /></button></div>
              <div style={{ whiteSpace: "pre-wrap" }}>{n.text}</div>
            </div>
          ))}
        </section>
      )}

      {tab === "actions" && (
        <section className="panel stack">
          <h2><CalendarClock size={17} /> Account and shift</h2>
          <div className="action-list">
            <div><div><b>Reset password</b><div className="muted small">Set a new password and tell the agent.</div></div>
              <div className="row" style={{ flexWrap: "nowrap" }}><input type="text" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password" style={{ maxWidth: 180 }} /><button onClick={() => save({ password: pw })} disabled={pw.length < 6}><KeyRound size={15} /> Set</button></div></div>
            <div><div><b>{u.active ? "Suspend agent" : "Restore agent"}</b><div className="muted small">{u.active ? "Blocks sign-in. History and pay records stay." : "Lets them sign in again."}</div></div>
              <button className={u.active ? "danger" : ""} onClick={() => confirm(u.active ? `Suspend ${u.name}?` : `Restore ${u.name}?`) && save({ active: !u.active })}>{u.active ? <><Ban size={15} /> Suspend</> : <><RotateCcw size={15} /> Restore</>}</button></div>
            <div><div><b>Clock out now</b><div className="muted small">Ends today's shift (and any break).</div></div>
              <button className="ghost" onClick={() => act({ action: "clockOut" })} disabled={!d.today || !!d.today.clockOut}><LogOut size={15} /> Clock out</button></div>
            <div><div><b>End break</b><div className="muted small">If they forgot to end their break.</div></div>
              <button className="ghost" onClick={() => act({ action: "endBreak" })} disabled={!d.onBreak}><Coffee size={15} /> End break</button></div>
            <div><div><b>Remove today's sign-in</b><div className="muted small">If they signed in by mistake. Today won't count.</div></div>
              <button className="ghost" onClick={() => confirm("Remove today's attendance for this agent?") && act({ action: "resetToday" })} disabled={!d.today}><Trash2 size={15} /> Remove</button></div>
          </div>
        </section>
      )}
    </div>
  );
}
