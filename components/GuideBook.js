"use client";
// Trainer: every tool and how to use it. Searchable; each card links straight to the tool.
import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { GraduationCap, Search, ArrowRight, Lightbulb } from "lucide-react";
import { guideForRole, GUIDE_GROUPS } from "@/lib/guide";

export default function GuideBook({ role = "ADMIN" }) {
  const items = useMemo(() => guideForRole(role), [role]);
  const [q, setQ] = useState("");
  // Deep link: /…/guide?t=<id> opens focused on one topic
  useEffect(() => { try { const t = new URLSearchParams(location.search).get("t"); if (t) { const el = document.getElementById("g-" + t); if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.add("g-flash"); setTimeout(() => el.classList.remove("g-flash"), 1600); } } } catch {} }, []);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((g) => (g.title + " " + g.for + " " + g.steps.join(" ") + " " + (g.tips || []).join(" ")).toLowerCase().includes(s));
  }, [items, q]);
  const groups = GUIDE_GROUPS.filter((g) => list.some((x) => x.group === g));

  return (
    <div className="stack">
      <section className="panel stack">
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <h2><GraduationCap size={18} /> Trainer — every tool, how to use it</h2>
          <label className="sl-search" style={{ margin: 0, maxWidth: 320, background: "rgba(255,255,255,.06)" }}><Search size={14} /><input placeholder="Search the guide… (e.g. dock, listen, contract)" value={q} onChange={(e) => setQ(e.target.value)} autoFocus /></label>
        </div>
        <p className="muted small" style={{ margin: 0 }}>Short how-to for each tool in Modo. Click <b>Open</b> on any card to jump straight to it. {list.length} topic{list.length === 1 ? "" : "s"}.</p>
      </section>

      {!list.length && <p className="muted">Nothing matches “{q}”. Try a simpler word.</p>}

      {groups.map((g) => (
        <section key={g} className="stack" style={{ gap: 10 }}>
          <h3 className="sec-h" style={{ margin: "4px 0 0" }}>{g}</h3>
          <div className="guide-grid">
            {list.filter((x) => x.group === g).map((x) => (
              <article key={x.id} id={"g-" + x.id} className="panel stack guide-card" style={{ gap: 8 }}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "start", gap: 8 }}>
                  <b>{x.title}</b>
                  {x.path ? <Link className="ghost sm" href={x.path}>Open <ArrowRight size={13} /></Link> : <span className="chip">menu</span>}
                </div>
                <p className="muted small" style={{ margin: 0 }}>{x.for}</p>
                <ol className="guide-steps">{x.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
                {(x.tips || []).map((t, i) => <p key={i} className="guide-tip small"><Lightbulb size={13} /> {t}</p>)}
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
