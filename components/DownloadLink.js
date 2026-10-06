"use client";
// Download that also works when it opens in another window/app: ask Modo for a short signed link first.
import { useState } from "react";
export default function DownloadLink({ api, body = {}, className = "btn-link", children, title, onError }) {
  const [busy, setBusy] = useState(false);
  async function go(e) {
    e.preventDefault(); if (busy) return; setBusy(true);
    const r = await fetch(api, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const d = r ? await r.json().catch(() => ({})) : {}; setBusy(false);
    if (!r || !r.ok || !d.url) { const m = d.error || "Couldn't start the download."; onError ? onError(m, d) : alert(m); return; }
    const a = document.createElement("a"); a.href = d.url; a.rel = "noopener"; a.download = ""; document.body.appendChild(a); a.click(); a.remove();
  }
  return <a href="#" className={className} title={title} onClick={go} aria-busy={busy}>{busy ? "…" : children}</a>;
}
