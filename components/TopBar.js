"use client";
// Modo top bar: full width, labels always visible. Whatever doesn't fit the screen moves into a "More"
// menu automatically (no sideways scrolling, nothing cut off). Groups open as menus; big groups as
// two-column panels. Appearance (Day/Night, colours, language) sits behind one button. Phones get the
// full-screen menu.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { ChevronDown, Menu, X, MoreHorizontal, Palette } from "lucide-react";
import AppearanceToggle from "./Appearance";
import LangPicker from "./LangPicker";
import { ModoMark, ModoWord } from "./ModoLogo";

const isOn = (path, it) => (it.exact ? path === it.href : path === it.href || path.startsWith(it.href + "/"));
const groupOn = (path, it) => (it.children ? it.children.some((c) => isOn(path, c)) : isOn(path, it));
const initials = (n) => (n || "?").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const useIso = typeof window !== "undefined" ? useLayoutEffect : useEffect;

function MenuList({ items, path, wide }) {
  return (
    <div className={"tb-list" + (wide ? " wide" : "")}>
      {items.map((c) => (
        <Link key={c.href} href={c.href} className={"tb-link" + (isOn(path, c) ? " on" : "")} role="menuitem">
          <span className="tb-link-ic">{c.icon}</span>
          <span className="tb-link-t"><b>{c.label}</b>{c.hint && <small>{c.hint}</small>}</span>
          {c.badge ? <span className="tb-badge">{c.badge}</span> : null}
        </Link>
      ))}
    </div>
  );
}

function Item({ it, measuring, path, open, toggle }) {
  return it.children ? (
    <div className="tb-group">
      <button type="button" className={"tb-item" + (groupOn(path, it) ? " active" : "")} aria-expanded={!measuring && open === it.label} aria-haspopup="true"
        onClick={measuring ? undefined : () => toggle(it.label)} tabIndex={measuring ? -1 : undefined}>
        {it.icon}<span>{it.label}</span>{it.badge ? <span className="tb-badge">{it.badge}</span> : null}<ChevronDown size={14} className="tb-chev" />
      </button>
      {!measuring && open === it.label && (
        <div className={"tb-menu" + (it.children.length > 6 ? " wide" : "")} role="menu"><MenuList items={it.children} path={path} wide={it.children.length > 6} /></div>
      )}
    </div>
  ) : (
    <Link href={it.href} className={"tb-item" + (isOn(path, it) ? " active" : "")} aria-current={isOn(path, it) ? "page" : undefined} tabIndex={measuring ? -1 : undefined}>
      {it.icon}<span>{it.label}</span>{it.badge ? <span className="tb-badge">{it.badge}</span> : null}
    </Link>
  );
}

export default function TopBar({ nav, home, user, userMenu, action, search }) {
  const path = usePathname() || "";
  const [open, setOpen] = useState(null);     // which menu is open: group label | "__more" | "__user" | "__look"
  const [sheet, setSheet] = useState(false);  // phone menu
  const [fit, setFit] = useState(nav.length); // how many top-level items fit in the bar
  const ref = useRef(null); const navRef = useRef(null); const measure = useRef(null);

  useEffect(() => { setOpen(null); setSheet(false); }, [path]);
  useEffect(() => {
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(null); };
    const esc = (e) => e.key === "Escape" && (setOpen(null), setSheet(false));
    document.addEventListener("pointerdown", close); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", esc); };
  }, []);
  useEffect(() => { document.body.style.overflow = sheet ? "hidden" : ""; return () => { document.body.style.overflow = ""; }; }, [sheet]);

  // Fit as many items as the bar has room for; the rest go into "More".
  const layout = useCallback(() => {
    const box = navRef.current, m = measure.current; if (!box || !m) return;
    const widths = [...m.children].map((el) => el.getBoundingClientRect().width + 4);
    const avail = box.clientWidth;
    const total = widths.reduce((a, b) => a + b, 0);
    if (total <= avail) return setFit(nav.length);
    const moreW = 96; let used = 0, n = 0;
    for (const w of widths) { if (used + w > avail - moreW) break; used += w; n++; }
    setFit(Math.max(1, n));
  }, [nav.length]);
  useIso(() => { layout(); }, [layout, nav]);
  useEffect(() => {
    const ro = new ResizeObserver(() => layout());
    if (navRef.current) ro.observe(navRef.current);
    document.fonts?.ready?.then(layout).catch(() => {});
    return () => ro.disconnect();
  }, [layout]);

  const shown = nav.slice(0, fit), extra = nav.slice(fit);
  const extraOn = extra.some((it) => groupOn(path, it));
  const toggle = (k) => setOpen((o) => (o === k ? null : k));

  return (
    <header className="tb" ref={ref}>
      <button type="button" className="tb-icon tb-burger" aria-label="Menu" aria-expanded={sheet} onClick={() => setSheet(!sheet)}>{sheet ? <X size={22} /> : <Menu size={22} />}</button>
      <Link href={home} className="tb-logo" aria-label="Modo home"><ModoMark size={34} glow={false} /><ModoWord height={15} /></Link>

      <nav className="tb-nav" ref={navRef} aria-label="Main">
        {shown.map((it) => <Item key={it.label} it={it} path={path} open={open} toggle={toggle} />)}
        {extra.length > 0 && (
          <div className="tb-group">
            <button type="button" className={"tb-item" + (extraOn ? " active" : "")} aria-expanded={open === "__more"} aria-haspopup="true" onClick={() => toggle("__more")}>
              <MoreHorizontal size={17} /><span>More</span>{extra.some((x) => x.badge) ? <span className="tb-badge dot" /> : null}<ChevronDown size={14} className="tb-chev" />
            </button>
            {open === "__more" && (
              <div className="tb-menu wide right" role="menu">
                <div className="tb-more">
                  {extra.map((it) => it.children ? (
                    <section key={it.label}><h6>{it.icon}{it.label}</h6><MenuList items={it.children} path={path} /></section>
                  ) : (
                    <section key={it.label}><MenuList items={[it]} path={path} /></section>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {/* invisible copy used only to measure how wide each item is */}
        <div className="tb-measure" ref={measure} aria-hidden="true">{nav.map((it) => <Item key={it.label} it={it} measuring path={path} />)}</div>
      </nav>

      <div className="tb-right">
        {search && <div className="tb-search">{search}</div>}
        <div className="tb-group tb-look-g">
          <button type="button" className="tb-icon" aria-label="Appearance and language" title="Day / Night, colours, language" aria-expanded={open === "__look"} onClick={() => toggle("__look")}><Palette size={18} /></button>
          {open === "__look" && (
            <div className="tb-menu right tb-look" role="dialog" aria-label="Appearance">
              <b className="tb-h">Appearance</b>
              <AppearanceToggle />
              <b className="tb-h">Language</b>
              <div data-no-translate><LangPicker /></div>
            </div>
          )}
        </div>
        {action}
        <div className="tb-group">
          <button type="button" className="tb-user" aria-expanded={open === "__user"} onClick={() => toggle("__user")} title={user.name}>
            <span className="tb-avatar">{initials(user.name)}</span>
            <span className={"tb-status " + (user.status || "")} aria-hidden="true" />
            <span className="tb-user-t"><b>{user.name || "…"}</b><small>{user.sub}</small></span>
            <ChevronDown size={14} className="tb-chev" />
          </button>
          {open === "__user" && (
            <div className="tb-menu right" role="menu">
              <div className="tb-who"><b>{user.name}</b><small>{user.sub}</small></div>
              {userMenu.map((m) => <button key={m.label} type="button" role="menuitem" className={"tb-act" + (m.danger ? " danger" : "")} onClick={() => { setOpen(null); m.onClick(); }}>{m.icon}<span>{m.label}</span></button>)}
            </div>
          )}
        </div>
      </div>

      {/* Phone: full menu */}
      {sheet && typeof document !== "undefined" && createPortal(
        <>
          <div className="pn-sheet-bg" onClick={() => setSheet(false)} />
          <div className="pn-sheet tb-sheet" role="menu" aria-label="All options">
            <div className="tb-sheet-top">
              <Link href={home} className="tb-logo" onClick={() => setSheet(false)} aria-label="Modo home"><ModoMark size={30} glow={false} /><ModoWord height={13} /></Link>
              <button type="button" className="tb-icon" aria-label="Close menu" onClick={() => setSheet(false)}><X size={20} /></button>
            </div>
            <div className="pn-sheet-user"><span className="tb-avatar big">{initials(user.name)}</span>
              <div style={{ flex: 1 }}><b>{user.name}</b><span className="sub" style={{ display: "block", color: "var(--muted-fg)", fontSize: 13 }}>{user.sub}</span></div></div>
            <div className="pn-sheet-scroll">
              <div className="pn-sheet-appear"><AppearanceToggle /></div>
              <div className="pn-sheet-appear" data-no-translate><LangPicker /></div>
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
        </>, document.body
      )}
    </header>
  );
}
