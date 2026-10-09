"use client";
// Public install helper: one-tap install on Android/desktop, clear steps on iPhone, and a QR to open on a phone.
import { useEffect, useState } from "react";

export default function Install() {
  const [deferred, setDeferred] = useState(null);
  const [installed, setInstalled] = useState(false);
  const [ua, setUa] = useState("");
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setUa(navigator.userAgent); setOrigin(location.origin);
    const h = (e) => { e.preventDefault(); setDeferred(e); };
    const done = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", h);
    window.addEventListener("appinstalled", done);
    try { if (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) setInstalled(true); } catch {}
    if (navigator.standalone) setInstalled(true);
    return () => { window.removeEventListener("beforeinstallprompt", h); window.removeEventListener("appinstalled", done); };
  }, []);
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (/mac/i.test(ua) && navigator.maxTouchPoints > 1);
  const isAndroid = /android/i.test(ua);
  async function install() { if (!deferred) return; deferred.prompt(); await deferred.userChoice; setDeferred(null); }
  const qr = origin ? `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=8&data=${encodeURIComponent(origin + "/install")}` : "";

  return (
    <main className="install-wrap">
      <div className="panel install-card stack">
        <div className="row" style={{ gap: 10, alignItems: "center" }}><img src="/icon-192.png" alt="Modo" width={48} height={48} style={{ borderRadius: 12 }} /><div><h1 style={{ margin: 0 }}>Install Modo</h1><p className="muted" style={{ margin: 0 }}>Add Modo to your phone so alerts reach you even when it's closed.</p></div></div>

        {installed ? <div className="receipt">✓ Modo is installed on this device. Open it from your home screen.</div> : (
          <>
            {(deferred) && <button onClick={install} style={{ fontSize: 16, padding: "12px 18px" }}>Install Modo</button>}

            {isIOS && (
              <section className="stack" style={{ gap: 6 }}>
                <b>On iPhone / iPad (use Safari):</b>
                <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
                  <li>Tap the <b>Share</b> button (the square with an ↑) at the bottom.</li>
                  <li>Scroll down and tap <b>Add to Home Screen</b>.</li>
                  <li>Tap <b>Add</b>. Open <b>Modo</b> from your home screen and allow notifications.</li>
                </ol>
                <p className="muted small" style={{ margin: 0 }}>iPhone needs this step before lock-screen alerts work — it's an Apple requirement.</p>
              </section>
            )}

            {isAndroid && !deferred && (
              <section className="stack" style={{ gap: 6 }}>
                <b>On Android (use Chrome):</b>
                <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.7 }}>
                  <li>Tap the <b>⋮</b> menu (top right).</li>
                  <li>Tap <b>Install app</b> (or <b>Add to Home screen</b>).</li>
                  <li>Open <b>Modo</b> and allow notifications.</li>
                </ol>
              </section>
            )}

            {!isIOS && !isAndroid && !deferred && (
              <p className="muted">On a computer, open this page in Chrome or Edge and use the <b>Install</b> icon in the address bar. To install on a phone, scan the code below.</p>
            )}
          </>
        )}

        {qr && (
          <div className="stack" style={{ gap: 6, alignItems: "center", marginTop: 6 }}>
            <span className="muted small">Or scan to open this on a phone:</span>
            <img src={qr} alt="Install QR code" width={180} height={180} style={{ borderRadius: 12, background: "#fff", padding: 6 }} />
            <span className="muted small num">{origin}/install</span>
          </div>
        )}
        <a className="btn-link" href="/login" style={{ textAlign: "center" }}>Go to sign in →</a>
      </div>
    </main>
  );
}
