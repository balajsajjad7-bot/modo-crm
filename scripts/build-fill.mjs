// Writes the shared "Modo Fill" script into the Android app and the browser add-on, then zips the add-on.
// Run after changing lib/orderFill.js:  node scripts/build-fill.mjs
import { writeFileSync, mkdirSync, readFileSync } from "fs";
import { execSync } from "child_process";
const { FILL_SRC } = await import("../lib/orderFill.js");

mkdirSync("android/app/src/main/assets", { recursive: true });
writeFileSync("android/app/src/main/assets/modofill.js", FILL_SRC + "\n");

const content = `// Modo Fill add-on: when Modo opens a carrier order page with #modo=<code>, fill it, search,
// read the status and save it back to Modo. Runs only on the carrier order pages listed in manifest.json.
(function () {
  if (/modo-crm1\\.vercel\\.app$/.test(location.hostname)) { document.documentElement.dataset.modoFill = "1"; return; }
  var m = location.hash.match(/[#&]modo=([^&]+)/);
  if (m) {
    try { sessionStorage.setItem("modo-code", decodeURIComponent(m[1])); } catch (e) {}
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
  }
  var code = ""; try { code = sessionStorage.getItem("modo-code") || ""; } catch (e) {}
  if (!code) return;
  window.__MODO_CODE = code; window.__MODO_AUTO = 1;
  var run = function () { setTimeout(function () {
${FILL_SRC}
  }, 1200); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run); else run();
})();
`;
writeFileSync("extension/content.js", content);
const manifest = {
  manifest_version: 3, name: "Modo Fill", version: "1.1.0",
  description: "Fills Verizon, AT&T and T-Mobile order-status pages from Modo and saves the status back to the sale.",
  icons: { "48": "icon-48.png", "128": "icon-128.png" },
  content_scripts: [
    { matches: ["https://www.verizon.com/*", "https://www.att.com/*", "https://www.t-mobile.com/*"], js: ["content.js"], run_at: "document_start" },
    { matches: ["https://modo-crm1.vercel.app/*"], js: ["content.js"], run_at: "document_start" },
  ],
};
writeFileSync("extension/manifest.json", JSON.stringify(manifest, null, 2) + "\n");
mkdirSync("public/downloads", { recursive: true });
execSync("cd extension && rm -f ../public/downloads/modo-fill-addon.zip && zip -q -r ../public/downloads/modo-fill-addon.zip manifest.json content.js icon-48.png icon-128.png");
console.log("Modo Fill written:", FILL_SRC.length, "chars; add-on zipped to public/downloads/modo-fill-addon.zip");
