"use client";
// Every card on every page can be minimized: a small "–" button appears on each card's heading. Minimized
// cards show only their heading; the choice is remembered per page on this device.
// Works on the page's existing cards without changing them (it only adds the button and a data attribute).
import { useEffect } from "react";
import { usePathname } from "next/navigation";

const KEY = "modo-folds";
const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } };
const write = (o) => { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch {} };
const MIN = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14"/></svg>';
const MAX = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';

function headOf(sec) {
  const first = sec.firstElementChild; if (!first) return null;
  if (first.tagName === "H2") return first;
  if (first.matches(".row, .ln-head, header") && first.querySelector(":scope > h2, :scope > div > h2")) return first.querySelector(":scope > h2, :scope > div > h2");
  return null;
}

export default function AutoFold() {
  const path = usePathname() || "";
  useEffect(() => {
    const main = document.querySelector("main.shell"); if (!main) return;
    const apply = () => {
      const folds = read();
      main.querySelectorAll("section.panel").forEach((sec) => {
        if (sec.querySelector(":scope > .fold-h") || sec.closest(".ai-modal, .wl, .login")) return; // has its own minimize
        const h = headOf(sec); if (!h) return;
        const title = (h.textContent || "").replace(/[–+]$/, "").trim().slice(0, 60); if (!title) return;
        const id = path + "|" + title;
        sec.dataset.foldId = id;
        let btn = h.querySelector(":scope > .af-btn");
        if (!btn) {
          btn = document.createElement("button"); btn.type = "button"; btn.className = "af-btn"; btn.setAttribute("data-plain", "");
          btn.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); const f = read(); const k = sec.dataset.foldId; f[k] = !f[k]; if (!f[k]) delete f[k]; write(f); set(sec, btn, !!f[k]); });
          h.appendChild(btn); h.classList.add("af-h");
        }
        set(sec, btn, !!folds[id]);
      });
    };
    const set = (sec, btn, min) => {
      if (min) sec.setAttribute("data-folded", "1"); else sec.removeAttribute("data-folded");
      btn.innerHTML = min ? MAX : MIN; btn.title = min ? "Show" : "Minimize"; btn.setAttribute("aria-label", btn.title); btn.setAttribute("aria-expanded", String(!min));
    };
    apply();
    let t = null;
    const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(apply, 150); });
    mo.observe(main, { childList: true, subtree: true });
    return () => { mo.disconnect(); clearTimeout(t); };
  }, [path]);
  return null;
}
