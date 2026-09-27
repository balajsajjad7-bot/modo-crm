"use client";
// Floating pill navigation. On desktop: grouped dropdowns. On phones: a tap-to-open full menu (hamburger)
// that lists every option, so agents can always reach everything on a small screen.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu, X } from "lucide-react";
import AppearanceToggle from "./Appearance";

const isOn = (path, it) => (it.exact ? path === it.href : path === it.href || path.startsWith(it.href + "/"));

export default function PillNav({ nav, home, user, userMenu, action }) {
  const path = usePathname();
  const [open, setOpen] = useState(null);   // desktop dropdown / user menu
  const [sheet, setSheet] = useState(false); // mobile full menu
  const ref = useRef(null);
  useEffect(() => { setOpen(null); setSheet(false); }, [path]);
  useEffect(() => {
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(null); };
    const esc = (e) => e.key === "Escape" && (setOpen(null), setSheet(false));
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", esc); };
  }, []);
  // Lock body scroll while the mobile sheet is open
  useEffect(() => { if (typeof document !== "undefined") document.body.style.overflow = sheet ? "hidden" : ""; }, [sheet]);

  return (
    <nav className="pillnav" ref={ref} aria-label="Main">
      <button className="pn-burger" aria-label="Menu" aria-expanded={sheet} onClick={() => setSheet(!sheet)}>{sheet ? <X size={20} /> : <Menu size={20} />}</button>
      <Link href={home} className="pn-logo" aria-label="CRM Modo home"><span className="diamond" /><b>MODO</b></Link>
      <span className="pn-sep" />
      <div className="pn-scroll">
        {nav.map((it) => it.children ? (
          <div key={it.label} className="pn-group">
            <button className={"pn-item" + (it.children.some((c) => isOn(path, c)) ? " active" : "")} aria-expanded={open === it.label} onClick={() => setOpen(open === it.label ? null : it.label)}>
              {it.icon}<span className="lbl">{it.label}</span>{it.badge ? <span className="pn-badge">{it.badge}</span> : null}<ChevronDown size={14} />
            </button>
            {open === it.label && (
              <div className="pn-menu" role="menu">
                {it.children.map((c) => (
                  <Link key={c.href} href={c.href} className={isOn(path, c) ? "active" : ""} role="menuitem">
                    {c.icon}<span style={{ flex: 1 }}>{c.label}<span className="sub">{c.hint}</span></span>{c.badge ? <span className="pn-badge">{c.badge}</span> : null}
                  </Link>
                ))}
              </div>
            )}
          </div>
        ) : (
          <Link key={it.href} href={it.href} className={"pn-item" + (isOn(path, it) ? " active" : "")} aria-current={isOn(path, it) ? "page" : undefined}>
            {it.icon}<span className="lbl">{it.label}</span>{it.badge ? <span className="pn-badge">{it.badge}</span> : null}
          </Link>
        ))}
      </div>
      <span className="pn-sep" />
      <AppearanceToggle />
      {action}
      <div className="pn-group">
        <button className="pn-user" aria-expanded={open === "__user"} onClick={() => setOpen(open === "__user" ? null : "__user")}>
          <span className="sl-avatar" style={{ width: 28, height: 28, background: "var(--grad)", fontSize: 11 }}>{(user.name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>
          <span className={"pn-status " + (user.status || "")} aria-hidden="true" />
          <ChevronDown size={14} />
        </button>
        {open === "__user" && (
          <div className="pn-menu right" role="menu">
            <div style={{ padding: "8px 12px" }}><b>{user.name}</b><span className="sub" style={{ display: "block", color: "var(--muted-fg)", fontSize: 12 }}>{user.sub}</span></div>
            <hr />
            {userMenu.map((m) => <button key={m.label} role="menuitem" onClick={() => { setOpen(null); m.onClick(); }} style={m.danger ? { color: "#ff8a92" } : undefined}>{m.icon}{m.label}</button>)}
          </div>
        )}
      </div>

      {/* Mobile full menu */}
      {sheet && (
        <>
          <div className="pn-sheet-bg" onClick={() => setSheet(false)} />
          <div className="pn-sheet" role="menu" aria-label="All options">
            <div className="pn-sheet-user"><span className="sl-avatar" style={{ width: 40, height: 40, background: "var(--grad)", fontSize: 15 }}>{(user.name || "?").split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>
              <div style={{flex:1}}><b>{user.name}</b><span className="sub" style={{ display: "block", color: "var(--muted-fg)", fontSize: 13 }}>{user.sub}</span></div></div>
            <div className="pn-sheet-scroll">
              {nav.map((it) => it.children ? (
                <div key={it.label} className="pn-sheet-group">
                  <div className="pn-sheet-h">{it.icon}<span>{it.label}</span></div>
                  {it.children.map((c) => (
                    <Link key={c.href} href={c.href} className={"pn-sheet-item" + (isOn(path, c) ? " on" : "")} onClick={() => setSheet(false)}>
                      {c.icon}<span style={{ flex: 1 }}>{c.label}<span className="sub">{c.hint}</span></span>{c.badge ? <span className="pn-badge">{c.badge}</span> : null}
                    </Link>
                  ))}
                </div>
              ) : (
                <Link key={it.href} href={it.href} className={"pn-sheet-item solo" + (isOn(path, it) ? " on" : "")} onClick={() => setSheet(false)}>
                  {it.icon}<span style={{ flex: 1 }}>{it.label}</span>{it.badge ? <span className="pn-badge">{it.badge}</span> : null}
                </Link>
              ))}
              <div className="pn-sheet-group">
                <div className="pn-sheet-h">Account</div>
                {userMenu.map((m) => <button key={m.label} className="pn-sheet-item solo" onClick={() => { setSheet(false); m.onClick(); }} style={m.danger ? { color: "#ff8a92" } : undefined}>{m.icon}<span style={{ flex: 1 }}>{m.label}</span></button>)}
              </div>
            </div>
          </div>
        </>
      )}
    </nav>
  );
}
