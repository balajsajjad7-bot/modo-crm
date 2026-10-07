"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "./api";
import EmailComposer from "@/components/EmailComposer";
import { useShell } from "@/components/Shell";
import { Mail, Plus, CheckCircle2, XCircle, Send } from "lucide-react";

export default function EmailCenter() {
  const { me } = useShell();
  const [d, setD] = useState(null); const [compose, setCompose] = useState(null); const [contacts, setContacts] = useState([]); const [pick, setPick] = useState("");
  const load = () => api("/api/email").then((r) => r.ok && setD(r.data));
  useEffect(() => { load(); api("/api/crm/contacts").then((r) => r.ok && setContacts(r.data.filter((c) => c.email))); }, []);
  if (!d) return <p className="muted">Loading…</p>;
  const c = contacts.find((x) => x.id === pick);
  return (
    <div className="stack">
      {!d.ready && <section className="panel"><b>Email isn't set up yet.</b> <span className="muted">Add your SMTP details in </span><Link href="/admin/connectors">Tools → Connectors → Email (SMTP)</Link><span className="muted">, then press Test.</span></section>}
      <section className="panel stack">
        <h2><Mail size={17} /> New email</h2>
        <div className="toolbar">
          <select value={pick} onChange={(e) => setPick(e.target.value)} style={{ maxWidth: 320 }}><option value="">Pick a customer (or type any address)</option>{contacts.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.email}</option>)}</select>
          <button onClick={() => setCompose({ to: c?.email || "", data: { customer: c?.name?.split(" ")[0] || "" }, contactId: c?.id })}><Plus size={15} /> Write email</button>
        </div>
        <p className="muted small" style={{ margin: 0 }}>You can also email straight from a sale card (Sales) or a customer's page.</p>
      </section>
      <section className="panel tablewrap">
        <h2 style={{ marginBottom: 8 }}><Send size={17} /> Sent</h2>
        <table><thead><tr><th></th><th>To</th><th>Subject</th><th>By</th><th>When</th></tr></thead>
          <tbody>{d.logs.map((l) => <tr key={l.id} title={l.error || ""}><td>{l.status === "sent" ? <CheckCircle2 size={15} style={{ color: "var(--green)" }} /> : <XCircle size={15} style={{ color: "var(--red)" }} />}</td><td>{l.to}</td><td>{l.subject}{l.error && <div className="small" style={{ color: "var(--red)" }}>{l.error}</div>}</td><td className="small">{l.by}</td><td className="small muted">{new Date(l.createdAt).toLocaleString()}</td></tr>)}</tbody>
        </table>
        {!d.logs.length && <p className="muted">No emails sent yet.</p>}
      </section>
      {compose && <EmailComposer {...compose} sender={me?.name} onClose={() => setCompose(null)} onSent={load} />}
    </div>
  );
}
