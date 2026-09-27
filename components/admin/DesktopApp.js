"use client";
// Admin → Tools → Windows app: download the installer, and set what the app does on each PC.
import { useEffect, useState } from "react";
import { api } from "./api";
import { Download, Monitor, Lock, Save, ShieldAlert, Github } from "lucide-react";

export default function DesktopApp() {
  const [cfg, setCfg] = useState({ url: "", kiosk: false, startWithWindows: true, adminExitPin: "", allowedHosts: "", updateFeedUrl: "" }); const [msg, setMsg] = useState("");
  useEffect(() => { api("/api/settings").then((r) => { if (r.ok) { const site = typeof window !== "undefined" ? window.location.origin : ""; setCfg((c) => ({ ...c, url: site })); } }); }, []);
  const download = () => { const json = JSON.stringify({ url: cfg.url, kiosk: cfg.kiosk, startWithWindows: cfg.startWithWindows, adminExitPin: cfg.adminExitPin || undefined, allowedHosts: cfg.allowedHosts ? cfg.allowedHosts.split(",").map((x) => x.trim()).filter(Boolean) : [], updateFeedUrl: cfg.updateFeedUrl || undefined }, null, 2);
    const blob = new Blob([json], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "modo.config.json"; a.click(); setMsg("modo.config.json downloaded. Put it in C:\\ProgramData\\Modo on each PC (or next to Modo.exe)."); };
  return (
    <div className="stack">
      <section className="panel stack">
        <h2><Monitor size={17} /> Modo for Windows</h2>
        <p className="muted small" style={{ margin: 0 }}>A real Windows app: its own icon and window, no browser bar, starts with the PC, and (optionally) locks the PC to Modo only. Agents install it once and open "Modo" like any program.</p>
        <div className="row"><a className="btn-link" href="/downloads/Modo-Setup.exe" download><Download size={15} /> Download installer (Modo-Setup.exe)</a>
          <a className="btn-link" href="https://github.com" target="_blank" rel="noreferrer"><Github size={14} /> How to build it</a></div>
        <p className="small muted" style={{ margin: 0 }}>Put the built <code>Modo-Setup.exe</code> in your site's <code>public/downloads/</code> folder so this button serves it. Agents run it → Modo appears on their desktop.</p>
      </section>

      <section className="panel stack">
        <h2><Lock size={17} /> What the app does on each PC</h2>
        <p className="muted small" style={{ margin: 0 }}>These go into <b>modo.config.json</b>. Download it below and drop it on each PC (or push the same values by Group Policy to <code>HKLM\\Software\\Modo</code>).</p>
        <label>Modo web address the app opens<input value={cfg.url} onChange={(e) => setCfg({ ...cfg, url: e.target.value })} /></label>
        <label>Also allow these sites in-app (comma separated) — e.g. your dialer<input value={cfg.allowedHosts} onChange={(e) => setCfg({ ...cfg, allowedHosts: e.target.value })} placeholder="dialer.yourcompany.com" /></label>
        <div className="action-list">
          <div><div><b>Start Modo when the PC turns on</b></div><button role="switch" aria-checked={cfg.startWithWindows} className={"toggle" + (cfg.startWithWindows ? " on" : "")} onClick={() => setCfg({ ...cfg, startWithWindows: !cfg.startWithWindows })}><span /></button></div>
          <div><div><b className="row" style={{ gap: 6 }}><ShieldAlert size={15} /> Kiosk mode (lock the PC to Modo only)</b><div className="muted small">Full screen, no other apps, no Task Manager, Control Panel, Run box or USB drives. Only for PCs you own and administer. Leaving needs the admin PIN below. The uninstaller always removes the lock.</div></div>
            <button role="switch" aria-checked={cfg.kiosk} className={"toggle" + (cfg.kiosk ? " on" : "")} onClick={() => setCfg({ ...cfg, kiosk: !cfg.kiosk })}><span /></button></div>
        </div>
        <label>Admin PIN to exit / unlock (leave blank for none)<input value={cfg.adminExitPin} onChange={(e) => setCfg({ ...cfg, adminExitPin: e.target.value.replace(/\D/g, "").slice(0, 8) })} inputMode="numeric" placeholder="e.g. 4729" /></label>
        <label>Auto-update server URL (optional)<input value={cfg.updateFeedUrl} onChange={(e) => setCfg({ ...cfg, updateFeedUrl: e.target.value })} placeholder="https://…/updates (leave blank — the app already loads the latest site)" /></label>
        <div className="row"><button onClick={download}><Save size={15} /> Download modo.config.json</button>{msg && <span className="small" style={{ color: "var(--green)" }}>{msg}</span>}</div>
      </section>

      <section className="panel stack">
        <h2>Kiosk safety</h2>
        <ul className="qa-ul">
          <li>Kiosk only works when the app runs as administrator on a PC you own. On an agent's personal PC it can't (and shouldn't) lock anything.</li>
          <li>Uninstalling Modo, or the exit PIN, always removes the lock — a PC can never get stuck.</li>
          <li>For a truly tight lock (block websites, downloads, other logins) use Windows Assigned Access + AppLocker too; see the IT guide in the download.</li>
        </ul>
      </section>
    </div>
  );
}
