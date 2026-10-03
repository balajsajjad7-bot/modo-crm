"use client";
// Appearance: Day · Auto · Night, plus a look: Royal (wine-red glass) or Minimal (flat, no effects).
// Auto = night mode from 7 PM to 7 AM (your computer's clock), day mode otherwise.
//
// One shared store for the whole page. Every toggle (desktop bar, phone menu, login, kiosk) reads and
// writes the same state, so two toggles can never fight each other (that fight used to flip the page
// back and forth and freeze it when you picked Night).
import { useEffect, useSyncExternalStore } from "react";
import { Sun, Moon, SunMoon, Sparkles, Square } from "lucide-react";

export const KEY = "modo-appearance";
export const STYLE_KEY = "modo-style";
export const NIGHT_FROM = 19, NIGHT_TO = 7;
const isNight = (d = new Date()) => d.getHours() >= NIGHT_FROM || d.getHours() < NIGHT_TO;
export const effective = (mode) => (mode === "light" ? "light" : mode === "dark" ? "dark" : isNight() ? "dark" : "light");
const MODES = ["light", "auto", "dark"], STYLES = ["royal", "minimal"];

// Runs before the page paints (in <head>) so there is no white/black flash.
export const bootScript = `(function(){var d=document.documentElement;try{var m=localStorage.getItem("${KEY}")||"auto";var s=localStorage.getItem("${STYLE_KEY}")||"royal";var h=new Date().getHours();var e=m==="light"?"light":m==="dark"?"dark":(h>=${NIGHT_FROM}||h<${NIGHT_TO})?"dark":"light";d.dataset.appearance=e;d.dataset.appearanceMode=m;d.dataset.look=s;}catch(e){d.dataset.appearance="dark";d.dataset.look="royal";}})();`;

// ---- shared store ----
const read = (k, ok, def) => { try { const v = localStorage.getItem(k); return ok.includes(v) ? v : def; } catch { return def; } };
let state = null;
const subs = new Set();
const SERVER = { mode: "auto", style: "royal", eff: "dark" };
function init() {
  if (state || typeof window === "undefined") return;
  const mode = read(KEY, MODES, "auto"), style = read(STYLE_KEY, STYLES, "royal");
  state = { mode, style, eff: effective(mode) };
  // Keep in sync with other tabs, and flip by itself at 7 PM / 7 AM while on Auto.
  window.addEventListener("storage", (e) => { if (e.key === KEY || e.key === STYLE_KEY) set({ mode: read(KEY, MODES, state.mode), style: read(STYLE_KEY, STYLES, state.style) }, false); });
  setInterval(() => { if (state.mode === "auto") apply(); }, 60000);
}
function apply() {
  const root = document.documentElement;
  const eff = effective(state.mode);
  const changed = root.dataset.appearance !== eff || root.dataset.look !== state.style;
  if (changed) {
    root.classList.add("theme-switching");
    clearTimeout(apply.t); apply.t = setTimeout(() => root.classList.remove("theme-switching"), 450);
  }
  root.dataset.appearance = eff; root.dataset.appearanceMode = state.mode; root.dataset.look = state.style;
  if (state.eff !== eff) state = { ...state, eff };
  if (changed) window.dispatchEvent(new CustomEvent("modo-appearance", { detail: { appearance: eff, look: state.style } }));
}
function set(patch, save = true) {
  init();
  const next = { ...state, ...patch };
  if (next.mode === state.mode && next.style === state.style) return;
  state = { ...next, eff: effective(next.mode) };
  if (save) { try { localStorage.setItem(KEY, state.mode); localStorage.setItem(STYLE_KEY, state.style); } catch {} }
  apply();
  subs.forEach((f) => f());
}
const subscribe = (f) => { init(); subs.add(f); return () => subs.delete(f); };
const snap = () => { init(); return state || SERVER; };

export function useAppearance() {
  const s = useSyncExternalStore(subscribe, snap, () => SERVER);
  useEffect(() => { init(); apply(); }, []);
  return [s.mode, (mode) => set({ mode }), s.eff, s.style, (style) => set({ style })];
}

// Read-only hook for components that only need to react to the look (e.g. backgrounds).
export function useLook() {
  const s = useSyncExternalStore(subscribe, snap, () => SERVER);
  return { appearance: s.eff, look: s.style };
}

export default function AppearanceToggle({ compact, showStyle = true }) {
  const [mode, setMode, eff, style, setStyle] = useAppearance();
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
        <button type="button" className={"look-btn" + (style === "minimal" ? " on" : "")} aria-pressed={style === "minimal"}
          onClick={() => setStyle(style === "minimal" ? "royal" : "minimal")}
          title={style === "minimal" ? "Minimal look is on — click for Royal wine" : "Switch to the Minimal look (flat, no effects)"}>
          {style === "minimal" ? <Square size={14} /> : <Sparkles size={14} />}<span className="lbl">{style === "minimal" ? "Minimal" : "Royal"}</span>
        </button>
      )}
    </div>
  );
}
