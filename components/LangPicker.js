"use client";
// Pick the language Modo shows in (per device). Changing it reloads so the whole app re-translates cleanly.
import { useEffect, useState } from "react";
import { Languages } from "lucide-react";
import { LANGS, getLang } from "./Translator";

export default function LangPicker({ compact }) {
  const [lang, setLang] = useState("en");
  useEffect(() => { setLang(getLang()); }, []);
  const change = (v) => { try { localStorage.setItem("modo-lang", v); } catch {} setLang(v); location.reload(); };
  return (
    <label className={"langpick" + (compact ? " compact" : "")} title="Language">
      <Languages size={15} />
      <select value={lang} onChange={(e) => change(e.target.value)} aria-label="Language">
        {LANGS.map(([code, name]) => <option key={code} value={code}>{name}</option>)}
      </select>
    </label>
  );
}
