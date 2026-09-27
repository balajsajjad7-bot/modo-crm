"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";

export const api = (url, method = "GET", body) => fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined }).then(async (r) => ({ ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) }));
export const money = (n) => "$" + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
export const when = (d) => d ? new Date(d).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";
export const toLocalInput = (d) => { if (!d) return ""; const x = new Date(d); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
export const base = (role) => (role === "ADMIN" ? "/admin" : "/agent");

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => { const k = (e) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className="sl-modal-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={"sl-modal panel" + (wide ? " wide" : "")} role="dialog" aria-label={title}>
        <div className="row" style={{ justifyContent: "space-between" }}><h2>{title}</h2><button className="ghost icon-btn" aria-label="Close" onClick={onClose}><X size={16} /></button></div>
        {children}
      </div>
    </div>
  );
}

// Agents list for admin filters and assignment
export function usePeople(enabled) {
  const [people, setPeople] = useState([]);
  useEffect(() => { if (enabled) api("/api/agents").then((r) => r.ok && setPeople(r.data.filter((a) => a.active).map((a) => ({ id: a.id, name: a.name })))); }, [enabled]);
  return people;
}
export function OwnerFilter({ people, value, onChange, label = "All agents" }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)} style={{ maxWidth: 200 }}><option value="">{label}</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>;
}
