"use client";
// Appearance: Day · Auto · Night, a colour palette (Aurora, Ember, Ocean, Emerald) and a look: Vivid (glass + glow) or Minimal (flat).
// Auto = night mode from 7 PM to 7 AM (your computer's clock), day mode otherwise.
//
// One shared store for the whole page. Every toggle (desktop bar, phone menu, login, kiosk) reads and
// writes the same state, so two toggles can never fight each other (that fight used to flip the page
// back and forth and freeze it when you picked Night).
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Sun, Moon, SunMoon, Sparkles, Square } from "lucide-react";

export const KEY = "modo-appearance";
export const STYLE_KEY = "modo-style";
export const PALETTE_KEY = "modo-palette";
export const PALETTES = [
  { id: "aurora", name: "Aurora", sw: ["#22d3ee", "#8b5cf6"] },
  { id: "ember", name: "Ember", sw: ["#ffb347", "#ff5a3c"] },
  { id: "ocean", name: "Ocean", sw: ["#2dd4bf", "#3b82f6"] },
  { id: "emerald", name: "Emerald", sw: ["#facc15", "#10b981"] },
];
export const NIGHT_FROM = 19, NIGHT_TO = 7;
const isNight = (d = new Date()) => d.getHours() >= NIGHT_FROM || d.getHours() < NIGHT_TO;
export const effective = (mode) => (mode === "light" ? "light" : mode === "dark" ? "dark" : isNight() ? "dark" : "light");
const MODES = ["light", "auto", "dark"], STYLES = ["royal", "minimal"], PAL = PALETTES.map((p) => p.id);

// Runs before the page paints (in <head>) so there is no white/black flash.
export const bootScript = `(function(){var d=document.documentElement;try{var m=localStorage.getItem("${KEY}")||"auto";var s=localStorage.getItem("${STYLE_KEY}")||"royal";var p=localStorage.getItem("${PALETTE_KEY}")||"aurora";d.dataset.palette=p;var h=new Date().getHours();var e=m==="light"?"light":m==="dark"?"dark":(h>=${NIGHT_FROM}||h<${NIGHT_TO})?"dark":"light";d.dataset.appearance=e;d.dataset.appearanceMode=m;d.dataset.look=s;}catch(e){d.dataset.appearance="dark";d.dataset.look="royal";d.dataset.palette="aurora";}})();`;

// ---- shared store ----
const read = (k, ok, def) => { try { const v = localStorage.getItem(k); return ok.includes(v) ? v : def; } catch { return def; } };
let state = null;
const subs = new Set();
const SERVER = { mode: "auto", style: "royal", palette: "aurora", eff: "dark" };
function init() {
  if (state || typeof window === "undefined") return;
  const mode = read(KEY, MODES, "auto"), style = read(STYLE_KEY, STYLES, "royal"), palette = read(PALETTE_KEY, PAL, "aurora");
  state = { mode, style, palette, eff: effective(mode) };
  // Keep in sync with other tabs, and flip by itself at 7 PM / 7 AM while on Auto.
  window.addEventListener("storage", (e) => { if ([KEY, STYLE_KEY, PALETTE_KEY].includes(e.key)) set({ mode: read(KEY, MODES, state.mode), style: read(STYLE_KEY, STYLES, state.style), palette: read(PALETTE_KEY, PAL, state.palette) }, false); });
  if (!init.timer) init.timer = setInterval(() => { if (state.mode === "auto") apply(); }, 60000);
}
// Switch instantly. (It used to fade every element on the page at once, which froze big pages like
// the admin Overview for 1–2 seconds and could crash weaker PCs and phones when picking Night.)
function apply() {
  const root = document.documentElement;
  const eff = effective(state.mode);
  const changed = root.dataset.appearance !== eff || root.dataset.look !== state.style || root.dataset.palette !== state.palette;
  if (changed) {
    root.dataset.appearance = eff; root.dataset.look = state.style; root.dataset.palette = state.palette;
    root.style.colorScheme = eff; // native scrollbars, inputs and dropdowns follow Day/Night too
  }
  if (root.dataset.appearanceMode !== state.mode) root.dataset.appearanceMode = state.mode;
  if (state.eff !== eff) { state = { ...state, eff }; subs.forEach((f) => f()); } // tell React instead of changing the snapshot silently
  if (changed) window.dispatchEvent(new CustomEvent("modo-appearance", { detail: { appearance: eff, look: state.style, palette: state.palette } }));
}
function set(patch, save = true) {
  init();
  const next = { ...state, ...patch };
  if (next.mode === state.mode && next.style === state.style && next.palette === state.palette) return;
  state = { ...next, eff: effective(next.mode) };
  if (save) { try { localStorage.setItem(KEY, state.mode); localStorage.setItem(STYLE_KEY, state.style); localStorage.setItem(PALETTE_KEY, state.palette); } catch {} }
  apply();
  subs.forEach((f) => f());
}
const subscribe = (f) => { init(); subs.add(f); return () => subs.delete(f); };
const snap = () => { init(); return state || SERVER; };

export function useAppearance() {
  const s = useSyncExternalStore(subscribe, snap, () => SERVER);
  useEffect(() => { init(); if (state) apply(); }, []);
  return [s.mode, (mode) => set({ mode }), s.eff, s.style, (style) => set({ style }), s.palette, (palette) => set({ palette })];
}

// Read-only hook for components that only need to react to the look (e.g. backgrounds).
export function useLook() {
  const s = useSyncExternalStore(subscribe, snap, () => SERVER);
  return { appearance: s.eff, look: s.style, palette: s.palette };
}

export default function AppearanceToggle({ compact, showStyle = true }) {
  const [mode, setMode, eff, style, setStyle, palette, setPalette] = useAppearance();
  const [pickOpen, setPickOpen] = useState(false); const box = useRef(null);
  useEffect(() => { if (!pickOpen) return; const c = (e) => { if (!box.current?.contains(e.target)) setPickOpen(false); }; document.addEventListener("pointerdown", c); return () => document.removeEventListener("pointerdown", c); }, [pickOpen]);
  const cur = PALETTES.find((p) => p.id === palette) || PALETTES[0];
  const opts = [["light", "Day", Sun], ["auto", "Auto", SunMoon], ["dark", "Night", Moon]];
  return (
    <div className={"appear2" + (compact ? " compact" : "")} role="group" aria-label="Appearance"
      title={mode === "auto" ? `Auto: night 7 PM–7 AM (now ${eff === "dark" ? "night" : "day"})` : undefined}>
      {opts.map(([k, l, I]) => (
        <button key={k} type="button" role="radio" aria-checked={mode === k} className={mode === k ? "on" : ""} onClick={() => setMode(k)}
          title={k === "auto" ? "Auto: night mode from 7 PM to 7 AM" : l + " mode"}>
          <I size={14} /><span className="lbl">{l}</span>
        </button>
      ))}
      {showStyle && (
        <span className="pal-wrap" ref={box}>
          <button type="button" className="pal-btn" aria-haspopup="true" aria-expanded={pickOpen} onClick={() => setPickOpen((o) => !o)} title={`Colour: ${cur.name}`}>
            <i className="pal-dot" style={{ background: `linear-gradient(135deg,${cur.sw[0]},${cur.sw[1]})` }} /><span className="lbl">{cur.name}</span>
          </button>
          {pickOpen && (
            <span className="pal-menu" role="menu">
              {PALETTES.map((p) => (
                <button key={p.id} type="button" role="menuitemradio" aria-checked={palette === p.id} className={palette === p.id ? "on" : ""} onClick={() => { setPalette(p.id); setPickOpen(false); }}>
                  <i className="pal-dot" style={{ background: `linear-gradient(135deg,${p.sw[0]},${p.sw[1]})` }} />{p.name}
                </button>
              ))}
              <hr />
              <button type="button" role="menuitemcheckbox" aria-checked={style === "minimal"} className={style === "minimal" ? "on" : ""} onClick={() => setStyle(style === "minimal" ? "royal" : "minimal")}>
                {style === "minimal" ? <Square size={14} /> : <Sparkles size={14} />}{style === "minimal" ? "Minimal look (on)" : "Minimal look"}
              </button>
            </span>
          )}
        </span>
      )}
    </div>
  );
}

// One-tap Day/Night switch for the top bar: a single icon, nothing else.
export function QuickTheme() {
  const [, setMode, eff] = useAppearance();
  const night = eff === "dark";
  return (
    <button type="button" className="tb-icon tb-theme" onClick={() => setMode(night ? "light" : "dark")}
      aria-label={night ? "Switch to day mode" : "Switch to night mode"} title={night ? "Day mode" : "Night mode"}>
      {night ? <Sun size={17} /> : <Moon size={17} />}
    </button>
  );
}
