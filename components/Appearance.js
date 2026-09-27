"use client";
// Appearance: Day · Auto · Night. Auto = night mode from 7 PM to 7 AM (your computer's clock), day mode otherwise.
import { useEffect, useState } from "react";
import { Sun, Moon, SunMoon } from "lucide-react";

export const KEY = "modo-appearance";
export const NIGHT_FROM = 19, NIGHT_TO = 7;
const isNight = (d = new Date()) => d.getHours() >= NIGHT_FROM || d.getHours() < NIGHT_TO;
export const effective = (mode) => (mode === "light" ? "light" : mode === "dark" ? "dark" : isNight() ? "dark" : "light");

// Runs before the page paints (in <head>) so there is no white/black flash.
export const bootScript = `(function(){try{var m=localStorage.getItem("${KEY}")||"auto";var h=new Date().getHours();var e=m==="light"?"light":m==="dark"?"dark":(h>=${NIGHT_FROM}||h<${NIGHT_TO})?"dark":"light";document.documentElement.dataset.appearance=e;document.documentElement.dataset.appearanceMode=m;}catch(e){document.documentElement.dataset.appearance="dark";}})();`;

export function useAppearance() {
  const [mode, setMode] = useState("auto");
  const [eff, setEff] = useState("dark");
  useEffect(() => { try { setMode(localStorage.getItem(KEY) || "auto"); } catch {} }, []);
  useEffect(() => {
    const apply = () => {
      const e = effective(mode);
      const root = document.documentElement;
      if (root.dataset.appearance !== e) { root.classList.add("theme-switching"); setTimeout(() => root.classList.remove("theme-switching"), 450); }
      root.dataset.appearance = e; root.dataset.appearanceMode = mode; setEff(e);
      window.dispatchEvent(new CustomEvent("modo-appearance", { detail: e }));
    };
    apply();
    try { localStorage.setItem(KEY, mode); } catch {}
    if (mode !== "auto") return;
    const t = setInterval(apply, 60000); // flips by itself at 7 PM / 7 AM
    return () => clearInterval(t);
  }, [mode]);
  return [mode, setMode, eff];
}

export default function AppearanceToggle({ compact }) {
  const [mode, setMode, eff] = useAppearance();
  const opts = [["light", "Day", Sun], ["auto", "Auto", SunMoon], ["dark", "Night", Moon]];
  return (
    <div className={"appear2" + (compact ? " compact" : "")} role="radiogroup" aria-label="Appearance"
      title={mode === "auto" ? `Auto: night 7 PM–7 AM (now ${eff === "dark" ? "night" : "day"})` : undefined}>
      {opts.map(([k, l, I]) => (
        <button key={k} type="button" role="radio" aria-checked={mode === k} className={mode === k ? "on" : ""} onClick={() => setMode(k)}
          title={k === "auto" ? "Auto: night mode from 7 PM to 7 AM" : l + " mode"}>
          <I size={14} /><span className="lbl">{l}</span>
        </button>
      ))}
    </div>
  );
}
