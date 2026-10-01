"use client";
// Live in-app translation: when an agent picks a language, this walks the page text and swaps it,
// caching every phrase so it's instant next time. English = off. Handles right-to-left (Urdu/Arabic…).
import { useEffect } from "react";

export const LANGS = [
  ["en", "English"], ["ur", "اردو (Urdu)"], ["hi", "हिन्दी (Hindi)"], ["pa", "ਪੰਜਾਬੀ (Punjabi)"], ["ar", "العربية (Arabic)"],
  ["fa", "فارسی (Persian)"], ["ps", "پښتو (Pashto)"], ["bn", "বাংলা (Bengali)"], ["es", "Español"], ["fr", "Français"],
  ["pt", "Português"], ["tr", "Türkçe"], ["id", "Bahasa Indonesia"], ["fil", "Filipino"], ["zh", "中文"], ["ru", "Русский"], ["de", "Deutsch"],
];
const RTL = new Set(["ur", "ar", "fa", "ps", "sd", "he"]);
export const getLang = () => { try { return localStorage.getItem("modo-lang") || "en"; } catch { return "en"; } };

const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "CODE", "PRE", "TEXTAREA", "INPUT", "SELECT", "OPTION", "svg", "SVG"]);

export default function Translator() {
  useEffect(() => {
    const lang = getLang();
    const root = document.documentElement;
    root.setAttribute("lang", lang);
    root.setAttribute("dir", RTL.has(lang) ? "rtl" : "ltr");
    if (lang === "en") return; // off

    let cache = {}; try { cache = JSON.parse(localStorage.getItem("modo-tr-" + lang) || "{}"); } catch {}
    const saveCache = () => { try { localStorage.setItem("modo-tr-" + lang, JSON.stringify(cache)); } catch {} };
    let stopped = false;

    const nodeInfo = (n) => { const raw = n.nodeValue; const key = raw.trim(); if (!key) return null; const lead = raw.slice(0, raw.indexOf(key)); const trail = raw.slice(raw.indexOf(key) + key.length); return { key, lead, trail }; };
    const translatable = (n) => {
      const p = n.parentElement; if (!p) return false;
      if (SKIP_TAGS.has(p.tagName)) return false;
      if (p.closest("[data-no-translate],[contenteditable='true']")) return false;
      const t = (n.nodeValue || "").trim();
      if (t.length < 2 || t.length > 200) return false;
      if (!/[A-Za-z]/.test(t)) return false;          // skip pure numbers / symbols
      if (/^[\d\s.,:/+\-()#*]+$/.test(t)) return false; // skip codes/amounts
      return true;
    };
    const apply = (n, info) => { if (cache[info.key] && n.nodeValue === info.lead + info.key + info.trail) { n.nodeValue = info.lead + cache[info.key] + info.trail; n.__trDone = cache[info.key]; } };

    const scan = () => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (translatable(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
      const need = new Map(); // key -> nodes[]
      let cur; while ((cur = walker.nextNode())) {
        const info = nodeInfo(cur); if (!info) continue;
        if (cur.__trDone === (cache[info.key] || null) && cache[info.key]) continue;
        if (cache[info.key]) { apply(cur, info); continue; }
        if (!need.has(info.key)) need.set(info.key, []);
        need.get(info.key).push([cur, info]);
      }
      return need;
    };

    const flush = async () => {
      if (stopped) return;
      const need = scan();
      const keys = [...need.keys()].filter((k) => !(k in cache));
      if (!keys.length) return;
      for (let i = 0; i < keys.length && !stopped; i += 40) {
        const batch = keys.slice(i, i + 40);
        try {
          const r = await fetch("/api/translate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lang, texts: batch }) });
          const d = await r.json().catch(() => ({}));
          if (Array.isArray(d.t) && d.t.length === batch.length) {
            batch.forEach((k, j) => { cache[k] = d.t[j] || k; });
            saveCache();
            batch.forEach((k) => (need.get(k) || []).forEach(([node, info]) => apply(node, info)));
          }
        } catch { /* leave English on failure */ }
      }
    };

    flush();
    // Re-translate when the page content changes (navigation, live updates) — debounced.
    let timer = null;
    const obs = new MutationObserver(() => { clearTimeout(timer); timer = setTimeout(flush, 600); });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => { stopped = true; obs.disconnect(); clearTimeout(timer); };
  }, []);
  return null;
}
