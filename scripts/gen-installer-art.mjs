// Renders the Modo glass logo and the installer sidebar with headless Chromium, then hands PNGs back.
// Used only at build/design time to brand the Windows installer and splash.
import pw from "/opt/npm-tools/node_modules/playwright/index.js";
const { chromium } = pw;
import fs from "fs";
import path from "path";

const OUT = process.argv[2] || "desktop/build";
fs.mkdirSync(OUT, { recursive: true });

const GLASS_LOGO = (size) => `
<div class="mark" style="width:${size}px;height:${size}px">
  <div class="tile">
    <div class="sheen"></div>
    <svg viewBox="0 0 100 100" class="m"><defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#8b7bff"/><stop offset="1" stop-color="#35c3ff"/></linearGradient></defs>
      <path d="M20 76 V30 L50 56 L80 30 V76" fill="none" stroke="url(#g)" stroke-width="10"
        stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  </div>
</div>`;

const CSS = `
  *{margin:0;box-sizing:border-box}
  .mark{position:relative;display:grid;place-items:center}
  .tile{position:relative;width:72%;height:72%;border-radius:26%;
    background:linear-gradient(145deg,rgba(255,255,255,.22),rgba(255,255,255,.04));
    border:1.5px solid rgba(255,255,255,.35);
    box-shadow:0 18px 40px -12px rgba(0,0,0,.65), inset 0 2px 10px rgba(255,255,255,.28), inset 0 -8px 20px rgba(10,12,30,.5);
    backdrop-filter:blur(8px);overflow:hidden}
  .tile .sheen{position:absolute;inset:0;background:
    radial-gradient(120% 80% at 20% 0%,rgba(255,255,255,.4),transparent 55%),
    radial-gradient(90% 90% at 100% 100%,rgba(53,195,255,.35),transparent 60%)}
  .tile .m{position:absolute;inset:16%;filter:drop-shadow(0 4px 10px rgba(0,0,0,.4))}
`;

async function shot(page, html, w, h, file) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${CSS}
    html,body{width:${w}px;height:${h}px}body{display:flex}</style></head><body>${html}</body></html>`, { waitUntil: "networkidle" });
  await page.screenshot({ path: path.join(OUT, file), clip: { x: 0, y: 0, width: w, height: h } });
  console.log("wrote", file);
}

const SIDEBAR = `
<div style="position:relative;width:164px;height:314px;overflow:hidden;font-family:'Segoe UI',system-ui,sans-serif;
  background:radial-gradient(130% 70% at 25% 8%,#2b2f58 0%,#141734 45%,#0b0d1c 100%)">
  <div style="position:absolute;width:150px;height:150px;left:-50px;top:150px;border-radius:50%;
    background:radial-gradient(circle,rgba(107,92,255,.5),transparent 70%);filter:blur(10px)"></div>
  <div style="position:absolute;width:140px;height:140px;right:-55px;top:-30px;border-radius:50%;
    background:radial-gradient(circle,rgba(53,195,255,.42),transparent 70%);filter:blur(10px)"></div>
  <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px">
    ${GLASS_LOGO(104)}
    <div style="font-size:30px;font-weight:800;letter-spacing:4px;
      background:linear-gradient(90deg,#b9adff,#7fe0ff);-webkit-background-clip:text;background-clip:text;color:transparent">MODO</div>
    <div style="font-size:10.5px;letter-spacing:1px;color:#aab3d6">OFFLINE DESKTOP APP</div>
  </div>
  <div style="position:absolute;bottom:14px;left:0;right:0;text-align:center;font-size:9px;letter-spacing:.5px;color:#7b84a8">Secure • Local • Yours</div>
</div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
await shot(page, GLASS_LOGO(256), 256, 256, "logo.png");
await shot(page, SIDEBAR, 164, 314, "sidebar.png");
await browser.close();
