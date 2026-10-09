"use client";
// Admin → Subscriptions: sell Modo. Plans (Free → Starter → Next → Enterprise) with editable prices,
// customers (activate / pause / cancel / change plan / renew), your own agents' plans, and the change history.
import { useEffect, useState } from "react";
import { CreditCard, Plus, Check, Pause, X, RotateCcw, Trash2, Save, Users, TrendingUp, Clock3, Sparkles, Crown, Rocket, Gift, ExternalLink, History, Building2, KeyRound, Copy, Loader2 } from "lucide-react";

const api = (url, method = "GET", body) => fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" }).then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }));
const money = (n) => "$" + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
const day = (t) => (t ? new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");
const ICON = { free: Gift, starter: Rocket, next: Sparkles, enterprise: Crown };
const TONE = { free: ["#cbd5e1", "#475569"], starter: ["#60a5fa", "#2563eb"], next: ["#a78bfa", "#7c3aed"], enterprise: ["#fcd34d", "#d97706"] };
const tone = (id) => { const [a, b] = TONE[id] || ["#5eead4", "#0d9488"]; return { "--g1": a, "--g2": b }; };
const BLANK = { company: "", contact: "", email: "", phone: "", plan: "starter", seats: 5, status: "active", price: "", notes: "" };

export default function Subscriptions() {
  const [d, setD] = useState(null); const [tab, setTab] = useState("customers"); const [msg, setMsg] = useState("");
  const [newWs, setNewWs] = useState(null); const [making, setMaking] = useState("");
  const [form, setForm] = useState(null); const [plans, setPlans] = useState(null); const [filter, setFilter] = useState("all");
  const load = () => api("/api/subs").then((r) => { if (r.ok) { setD(r.data); setPlans((p) => p || r.data.plans); } else setMsg(r.data.error || "Couldn't load."); });
  useEffect(() => { load(); }, []);
  if (!d) return <p className="muted">{msg || "Loading subscriptions…"}</p>;
  const say = (t) => { setMsg(t); setTimeout(() => setMsg(""), 3500); };
  const planOf = (id) => d.plans.find((p) => p.id === id);
  const save = async (sub) => { const r = await api("/api/subs", "POST", { action: "save", sub }); say(r.ok ? "✓ Saved" : r.data.error); load(); return r.ok; };
  const del = async (s) => { if (!confirm(`Delete ${s.company || "this subscription"} for good?`)) return; await api("/api/subs", "POST", { action: "delete", id: s.id }); load(); };
  const counts = Object.fromEntries(["active", "trial", "pending", "paused", "cancelled"].map((k) => [k, d.subs.filter((s) => s.status === k).length]));
  const seats = d.subs.filter((s) => s.status === "active").reduce((t, s) => t + (s.seats || 1), 0);
  const shown = d.subs.filter((s) => filter === "all" || s.status === filter);

  return (
    <div className="stack">
      <div className="sb-kpis">
        <div><span className="gt gt-sm" style={tone("enterprise")}><TrendingUp size={17} /></span><b>{money(d.mrr)}</b><small>monthly revenue · {money(d.mrr * 12)} / year</small></div>
        <div><span className="gt gt-sm" style={tone("starter")}><Check size={17} /></span><b>{counts.active}</b><small>active · {seats} paid users</small></div>
        <div><span className="gt gt-sm" style={tone("next")}><Clock3 size={17} /></span><b>{counts.pending + counts.trial}</b><small>{counts.pending} waiting · {counts.trial} on trial</small></div>
        <div><span className="gt gt-sm" style={tone("free")}><X size={17} /></span><b>{counts.cancelled}</b><small>cancelled · {counts.paused} paused</small></div>
      </div>

      <div className="sb-tabs">
        {[["customers", "Customers", CreditCard], ["plans", "Plans & prices", Sparkles], ["agents", "Agents' plans", Users], ["history", "History", History]].map(([k, l, I]) => (
          <button key={k} className={tab === k ? "on" : "ghost"} onClick={() => setTab(k)}><I size={14} /> {l}</button>
        ))}
        <a className="sb-link" href="/welcome" target="_blank" rel="noreferrer"><ExternalLink size={13} /> Public page</a>
      </div>
      {msg && <div className="small muted">{msg}</div>}
      {newWs && (
        <div className="panel stack sb-newws">
          <h2><Building2 size={17} /> {newWs.reset ? "New admin password" : "Workspace created"} for {newWs.company}: <code>{newWs.org}</code></h2>
          <p className="small muted" style={{ margin: 0 }}>Send these to the customer now — passwords can't be shown again (their admin can reset them later in their Modo).</p>
          <pre className="sb-creds">{`Sign in: ${typeof location !== "undefined" ? location.origin : ""}${newWs.loginPath}\nWorkspace: ${newWs.org}\n\n` + newWs.users.map((u) => `${u.role === "ADMIN" ? "Admin" : u.name}  ID: ${u.id}  Password: ${u.password}`).join("\n")}</pre>
          <div className="row" style={{ gap: 6 }}><button onClick={() => navigator.clipboard?.writeText(document.querySelector(".sb-creds")?.textContent || "").then(() => say("✓ Copied"))}><Copy size={14} /> Copy</button><button className="ghost" onClick={() => setNewWs(null)}>Done</button></div>
        </div>
      )}

      {tab === "customers" && (
        <section className="panel stack">
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <h2><CreditCard size={17} /> Customers</h2>
            <span className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              <select style={{ width: "auto" }} value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All ({d.subs.length})</option>{["pending", "active", "trial", "paused", "cancelled"].map((k) => <option key={k} value={k}>{k[0].toUpperCase() + k.slice(1)} ({counts[k]})</option>)}</select>
              <button onClick={() => setForm({ ...BLANK })}><Plus size={14} /> Give a subscription</button>
            </span>
          </div>
          {form && <SubForm form={form} setForm={setForm} plans={d.plans} onSave={async () => { if (!form.company.trim()) return say("Add the company name."); if (await save(form)) setForm(null); }} />}
          <div className="sb-list">
            {shown.map((s) => {
              const p = planOf(s.plan); const I = ICON[s.plan] || CreditCard; const each = s.price != null ? s.price : p?.price || 0;
              return (
                <div key={s.id} className={"sb-row st-" + s.status}>
                  <span className="gt gt-sm" style={tone(s.plan)}><I size={17} /></span>
                  <span className="sb-who"><b>{s.company || "—"}{s.workspace && <span className={"sb-ws " + (d.tenants?.[s.workspace]?.status || "")} title="Their own Modo workspace"><Building2 size={11} /> {s.workspace}</span>}</b><small>{[s.contact, s.email, s.phone].filter(Boolean).join(" · ") || "no contact"}{s.source === "website" ? " · from website" : ""}</small></span>
                  <span className="sb-plan"><b>{p?.name || s.plan}</b><small>{s.seats || 1} user(s) · {money(each * (s.seats || 1))}/mo{s.price != null ? " (custom)" : ""}</small></span>
                  <span className={"sb-st " + s.status}>{s.status}</span>
                  <span className="sb-dates small muted">{s.status === "cancelled" ? "Cancelled " + day(s.cancelledAt) : s.renewsAt ? "Renews " + day(s.renewsAt) : "Since " + day(s.createdAt)}</span>
                  <span className="sb-acts">
                    {s.workspace && <button className="ghost sm" disabled={!!making} onClick={async () => { if (!confirm(`Reset the admin password for ${s.company} (${s.workspace})?\n\nTheir old admin password stops working and 2-step sign-in is turned off so they can set it up again.`)) return; setMaking("r" + s.id); const r = await api("/api/subs", "POST", { action: "resetAdmin", id: s.id }); setMaking(""); if (r.ok) { setNewWs({ ...r.data.workspace, company: s.company }); load(); } else say(r.data.error); }}>{making === "r" + s.id ? <Loader2 size={13} className="spin" /> : <KeyRound size={13} />} Reset admin password</button>}
                    {!s.workspace && s.status !== "cancelled" && d.canProvision && <button className="sm" disabled={!!making} onClick={async () => { setMaking(s.id); const r = await api("/api/subs", "POST", { action: "provision", id: s.id }); setMaking(""); if (r.ok) { setNewWs({ ...r.data.workspace, company: s.company }); load(); } else say(r.data.error); }}>{making === s.id ? <Loader2 size={13} className="spin" /> : <Building2 size={13} />} Create workspace</button>}
                    {s.status !== "active" && <button className="sm" onClick={() => save({ id: s.id, status: "active" })}><Check size={13} /> Activate</button>}
                    {s.status === "active" && <button className="ghost sm" onClick={() => save({ id: s.id, status: "paused" })}><Pause size={13} /> Pause</button>}
                    {s.status === "active" && <button className="ghost sm" onClick={() => { const r = new Date(s.renewsAt || Date.now()); r.setMonth(r.getMonth() + 1); save({ id: s.id, renewsAt: r.toISOString() }); }}><RotateCcw size={13} /> +1 month</button>}
                    {s.status !== "cancelled" && <button className="ghost sm danger" onClick={() => confirm(`Cancel ${s.company}'s subscription?`) && save({ id: s.id, status: "cancelled" })}><X size={13} /> Cancel</button>}
                    <button className="ghost sm" onClick={() => setForm({ ...BLANK, ...s, price: s.price ?? "", renewsAt: s.renewsAt ? s.renewsAt.slice(0, 10) : "" })}>Change</button>
                    <button className="ghost sm icon-btn" title="Delete" onClick={() => del(s)}><Trash2 size={13} /></button>
                  </span>
                </div>
              );
            })}
            {!shown.length && <p className="muted small">No subscriptions here yet. Press “Give a subscription”, or share your public page — requests land here as “pending”.</p>}
          </div>
          {!d.canProvision && <p className="sb-note"><KeyRound size={14} /> <span><b>Instant workspaces are off.</b> Add <code>NEON_API_KEY</code> in Vercel → Settings → Environment Variables (Neon → Account settings → API keys), then redeploy. After that, every sign-up gets its own Modo and logins on screen.</span></p>}
          <p className="muted small" style={{ margin: 0 }}>Each company with a workspace has its own separate Modo and database. Pause or Cancel stops their logins; Activate opens them again. Modo doesn't charge cards: collect payment your usual way (bank, Payoneer, invoice), then press Activate. Renewal dates remind you when to bill.</p>
        </section>
      )}

      {tab === "plans" && plans && (
        <section className="panel stack">
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <h2><Sparkles size={17} /> Plans & prices</h2>
            <span className="row" style={{ gap: 6 }}>
              <button className="ghost sm" onClick={() => confirm("Put back Modo's recommended plans and prices?") && setPlans(d.defaults)}>Recommended prices</button>
              <button onClick={async () => { const r = await api("/api/subs", "POST", { action: "plans", plans }); say(r.ok ? "✓ Plans saved — the public page shows them now" : r.data.error); if (r.ok) { setPlans(r.data.plans); load(); } }}><Save size={14} /> Save plans</button>
            </span>
          </div>
          <div className="sb-plans">
            {plans.map((p, i) => {
              const I = ICON[p.id] || CreditCard; const set = (k, v) => setPlans(plans.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
              return (
                <div key={p.id} className={"sb-pcard" + (p.popular ? " pop" : "")}>
                  <span className="gt" style={{ ...tone(p.id), width: 44, height: 44, borderRadius: 14 }}><I size={22} /></span>
                  <label>Name<input value={p.name} onChange={(e) => set("name", e.target.value)} /></label>
                  <div className="row" style={{ gap: 6 }}>
                    <label style={{ flex: 1 }}>Price ($)<input type="number" min="0" step="1" value={p.price} onChange={(e) => set("price", e.target.value)} /></label>
                    <label style={{ flex: 1.4 }}>Per<input value={p.period} onChange={(e) => set("period", e.target.value)} /></label>
                  </div>
                  <label>Users<input value={p.seats} onChange={(e) => set("seats", e.target.value)} /></label>
                  <label>Tagline<input value={p.tagline} onChange={(e) => set("tagline", e.target.value)} /></label>
                  <label>Features (one per line)<textarea rows={6} value={(p.features || []).join("\n")} onChange={(e) => set("features", e.target.value.split("\n"))} /></label>
                  <label className="row" style={{ gap: 6, alignItems: "center" }}><input type="checkbox" checked={!!p.popular} onChange={(e) => setPlans(plans.map((x, j) => ({ ...x, popular: j === i ? e.target.checked : e.target.checked ? false : x.popular })))} style={{ width: "auto" }} /> Show as “Most popular”</label>
                </div>
              );
            })}
          </div>
          <p className="muted small" style={{ margin: 0 }}>Recommended prices sit just under comparable tools in 2026: HubSpot Sales Starter ≈ $20/user, Pipedrive $14–$99, Aircall $30–$50, call-center suites (Five9, Talkdesk) $100+/user.</p>
        </section>
      )}

      {tab === "agents" && (
        <section className="panel stack">
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <h2><Users size={17} /> Your agents' plans</h2>
            <span className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              <span className="small muted">Everyone:</span>
              {d.plans.map((p) => <button key={p.id} className="ghost sm" onClick={async () => { const r = await api("/api/subs", "POST", { action: "agentsAll", plan: p.id }); say(r.ok ? `✓ ${r.data.n} agents on ${p.name}` : r.data.error); load(); }}>{p.name}</button>)}
              <button className="ghost sm" onClick={async () => { await api("/api/subs", "POST", { action: "agentsAll", plan: null }); load(); }}>None</button>
            </span>
          </div>
          <div className="sb-list">
            {d.agents.map((a) => {
              const cur = d.agentPlans[a.id] || ""; const I = ICON[cur] || CreditCard;
              return (
                <div key={a.id} className="sb-row">
                  <span className="gt gt-sm" style={tone(cur || "x")}><I size={17} /></span>
                  <span className="sb-who"><b>{a.name}</b><small>{a.agentId}</small></span>
                  <select value={cur} onChange={async (e) => { await api("/api/subs", "POST", { action: "agent", uid: a.id, plan: e.target.value || null }); load(); }}>
                    <option value="">No plan</option>{d.plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              );
            })}
            {!d.agents.length && <p className="muted small">No agents yet.</p>}
          </div>
          <p className="muted small" style={{ margin: 0 }}>Each agent sees their active plan on their Modo home screen.</p>
        </section>
      )}

      {tab === "history" && (
        <section className="panel stack">
          <h2><History size={17} /> History</h2>
          <div className="sb-hist">
            {d.history.map((h, i) => <div key={i}><small className="muted">{new Date(h.at).toLocaleString()}</small><span><b>{h.company || "—"}</b> {h.change}</span><small className="muted">by {h.by}</small></div>)}
            {!d.history.length && <p className="muted small">No changes yet.</p>}
          </div>
        </section>
      )}
    </div>
  );
}

function SubForm({ form, setForm, plans, onSave }) {
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <div className="sb-form">
      <label>Company<input value={form.company} onChange={set("company")} placeholder="Acme Call Center" /></label>
      <label>Contact name<input value={form.contact} onChange={set("contact")} /></label>
      <label>Email<input type="email" value={form.email} onChange={set("email")} /></label>
      <label>Phone<input value={form.phone} onChange={set("phone")} /></label>
      <label>Plan<select value={form.plan} onChange={set("plan")}>{plans.map((p) => <option key={p.id} value={p.id}>{p.name} — ${p.price}/{p.period}</option>)}</select></label>
      <label>Users<input type="number" min="1" value={form.seats} onChange={set("seats")} /></label>
      <label>Status<select value={form.status} onChange={set("status")}>{["active", "trial", "pending", "paused", "cancelled"].map((s) => <option key={s} value={s}>{s}</option>)}</select></label>
      <label>Custom price / user ($)<input type="number" min="0" value={form.price} onChange={set("price")} placeholder="blank = plan price" /></label>
      <label>Renews on<input type="date" value={form.renewsAt || ""} onChange={set("renewsAt")} /></label>
      <label className="sb-wide">Notes<input value={form.notes} onChange={set("notes")} placeholder="Discount, payment method, anything" /></label>
      <div className="sb-wide row" style={{ gap: 6 }}><button onClick={onSave}><Save size={14} /> {form.id ? "Update subscription" : "Give subscription"}</button><button className="ghost" onClick={() => setForm(null)}>Close</button></div>
    </div>
  );
}
