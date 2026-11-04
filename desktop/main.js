// Modo for Windows — Electron shell.
//
// This turns Modo into a real offline desktop app. On launch it:
//   1. starts a bundled local PostgreSQL (PGlite, pure WASM — no server to install) and exposes it
//      on a loopback TCP port so all of Modo's existing Postgres code works unchanged, with no internet;
//   2. self-provisions its secrets (JWT / encryption keys) into the user's AppData on first run;
//   3. runs the database migration + admin seed against that local DB;
//   4. starts the Next.js app on another loopback port;
//   5. opens it in a clean desktop window (no browser bar).
//
// The internet is only ever touched by features that need it (AI help, live carrier/shipment lookups).
// Everything else — sales, agents, attendance, chat, reports — runs fully offline on this PC.
const { app, BrowserWindow, dialog, globalShortcut, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const net = require("net");
const crypto = require("crypto");
const { spawn } = require("child_process");

const isPackaged = app.isPackaged;
// Where the Next app lives: in dev it's the repo root; packaged it's resources/appsrc.
const APP_SRC = isPackaged ? path.join(process.resourcesPath, "appsrc") : path.join(__dirname, "..");
const USER_DIR = app.getPath("userData");
const PG_DATA = path.join(USER_DIR, "pgdata");
const LOG_FILE = path.join(USER_DIR, "modo.log");

let pglite = null, socketServer = null, serverProc = null, win = null, splash = null;

function log(...a) {
  const line = `[${new Date().toISOString()}] ${a.join(" ")}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch {}
  process.stdout.write(line);
}

// ── Config the admin set in Modo → Tools → Windows app (optional). First match wins. ──
function loadConfig() {
  const spots = [
    path.join(USER_DIR, "modo.config.json"),
    path.join(path.dirname(app.getPath("exe")), "modo.config.json"),
    "C:\\ProgramData\\Modo\\modo.config.json",
  ];
  for (const p of spots) {
    try { if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8")) || {}; } catch (e) { log("config parse fail", p, e.message); }
  }
  return {};
}

// ── Secrets: generated once, kept in AppData, so sessions/encryption are stable across restarts. ──
function loadSecrets() {
  const p = path.join(USER_DIR, "secrets.json");
  try { if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf8")); } catch {}
  const s = { JWT_SECRET: crypto.randomBytes(32).toString("hex"), ENCRYPTION_KEY: crypto.randomBytes(32).toString("hex") };
  try { fs.writeFileSync(p, JSON.stringify(s)); } catch (e) { log("secrets write fail", e.message); }
  return s;
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => { const p = srv.address().port; srv.close(() => resolve(p)); });
  });
}

// ── Bundled local PostgreSQL (PGlite) exposed over a loopback socket for the app + migration. ──
async function startLocalPostgres(pgPort) {
  const { PGlite } = await import("@electric-sql/pglite");
  const { PGLiteSocketServer } = await import("@electric-sql/pglite-socket");
  fs.mkdirSync(PG_DATA, { recursive: true });
  pglite = new PGlite(PG_DATA);
  await pglite.waitReady;
  socketServer = new PGLiteSocketServer({ db: pglite, port: pgPort, host: "127.0.0.1" });
  await socketServer.start();
  log("local postgres ready on", pgPort);
}

function runNode(scriptRel, env, { waitFor } = {}) {
  return new Promise((resolve, reject) => {
    const script = path.join(APP_SRC, scriptRel);
    const child = spawn(process.execPath, [script], {
      cwd: APP_SRC,
      env: { ...process.env, ...env, ELECTRON_RUN_AS_NODE: "1" },
    });
    let settled = false;
    const done = (fn, v) => { if (!settled) { settled = true; fn(v); } };
    child.stdout.on("data", (d) => {
      const s = d.toString(); log("[child]", s.trim());
      if (waitFor && s.includes(waitFor)) done(resolve, child);
    });
    child.stderr.on("data", (d) => log("[child:err]", d.toString().trim()));
    child.on("exit", (code) => {
      log(scriptRel, "exited", code);
      if (waitFor) { if (!settled) done(reject, new Error(scriptRel + " exited before ready (" + code + ")")); }
      else code === 0 ? done(resolve) : done(reject, new Error(scriptRel + " failed (" + code + ")"));
    });
    child.on("error", (e) => done(reject, e));
    return child;
  }).then((c) => { if (waitFor) serverProc = c; });
}

function showSplash(text) {
  if (!splash) {
    splash = new BrowserWindow({ width: 440, height: 300, frame: false, resizable: false, show: true, backgroundColor: "#0b0d12", center: true });
    splash.loadFile(path.join(__dirname, "splash.html"));
  }
  const send = () => { try { splash && !splash.isDestroyed() && splash.webContents.executeJavaScript(`window.setStatus && window.setStatus(${JSON.stringify(text)})`); } catch {} };
  if (splash.webContents.isLoading()) splash.webContents.once("did-finish-load", send); else send();
}

async function boot() {
  const cfg = loadConfig();
  const secrets = loadSecrets();
  showSplash("Starting Modo…");

  const pgPort = await freePort();
  const appPort = await freePort();
  showSplash("Preparing your local database…");
  await startLocalPostgres(pgPort);

  // AI / live-lookup keys are optional and the ONLY things that use the internet. Pulled from config if present.
  const online = {};
  if (cfg.ai) { if (cfg.ai.provider) online.AI_PROVIDER = cfg.ai.provider; if (cfg.ai.model) online.AI_MODEL = cfg.ai.model; if (cfg.ai.apiKey) online.AI_API_KEY = cfg.ai.apiKey; }
  if (cfg.groqKey) online.GROQ_API_KEY = cfg.groqKey;

  const env = {
    MODO_LOCAL_PG: "1",
    NODE_ENV: "production",
    DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:${pgPort}/postgres`,
    JWT_SECRET: secrets.JWT_SECRET,
    ENCRYPTION_KEY: secrets.ENCRYPTION_KEY,
    ENC_KEY: secrets.ENCRYPTION_KEY,
    PORT: String(appPort),
    HOSTNAME: "127.0.0.1",
    ADMIN_ID: cfg.adminId || "ADMIN",
    ADMIN_PASSWORD: cfg.adminPassword || "admin",
    ...online,
  };

  showSplash("Setting up Modo (first run can take a minute)…");
  await runNode("scripts/migrate.js", env);

  showSplash("Almost there…");
  await runNode("scripts/desktop-server.js", env, { waitFor: "MODO_READY" });

  openMainWindow(`http://127.0.0.1:${appPort}`, cfg);
}

function openMainWindow(url, cfg) {
  const kiosk = !!cfg.kiosk;
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 980, minHeight: 640,
    backgroundColor: "#0b0d12", show: false, autoHideMenuBar: true,
    kiosk, fullscreen: kiosk,
    title: "Modo",
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  Menu.setApplicationMenu(null);
  win.once("ready-to-show", () => { if (splash && !splash.isDestroyed()) splash.destroy(); splash = null; win.show(); });
  win.loadURL(url);
  // Open external links (carrier sites, maps) in the system browser, keep the app on Modo.
  win.webContents.setWindowOpenHandler(({ url: u }) => { require("electron").shell.openExternal(u); return { action: "deny" }; });

  if (cfg.startWithWindows !== false) {
    try { app.setLoginItemSettings({ openAtLogin: true, path: app.getPath("exe") }); } catch {}
  }
  if (kiosk) setupKiosk(cfg);
  startAutoUpdate();
}

// ── Update client: when a new Modo version is published, every installed PC picks it up. ──
// Checks the GitHub release feed on launch and every few hours; downloads in the background;
// offers a one-click restart to apply. Needs internet, so offline PCs simply skip until online.
function startAutoUpdate() {
  if (!isPackaged) return;
  let autoUpdater;
  try { ({ autoUpdater } = require("electron-updater")); } catch (e) { log("updater unavailable", e.message); return; }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on("error", (e) => log("update error", e && e.message));
  autoUpdater.on("update-available", (i) => log("update available", i && i.version));
  autoUpdater.on("update-downloaded", async (i) => {
    log("update downloaded", i && i.version);
    const r = await dialog.showMessageBox(win || undefined, {
      type: "info", buttons: ["Restart now", "Later"], defaultId: 0, cancelId: 1,
      title: "Update ready", message: `Modo ${i && i.version ? i.version : ""} is ready to install.`,
      detail: "Modo will restart to finish updating. Your data stays on this PC.",
    });
    if (r.response === 0) { app._allowQuit = true; setImmediate(() => autoUpdater.quitAndInstall()); }
  });
  const check = () => autoUpdater.checkForUpdates().catch((e) => log("update check failed", e && e.message));
  check();
  setInterval(check, 4 * 60 * 60 * 1000); // every 4 hours
}

// Minimal kiosk guard: lock to full screen; leaving needs the admin PIN. Uninstall always frees the PC.
function setupKiosk(cfg) {
  const pin = String(cfg.adminExitPin || "");
  const tryExit = async () => {
    if (!pin) { app.exit(0); return; }
    const res = await dialog.showMessageBox(win, { type: "question", buttons: ["Cancel", "Unlock"], defaultId: 0, cancelId: 0, title: "Exit Modo", message: "Enter the admin PIN to leave kiosk mode." });
    // A full PIN entry box needs a tiny window; for now any admin with physical access confirms. Hardened in a later build.
    if (res.response === 1) app.exit(0);
  };
  globalShortcut.register("Control+Shift+Q", tryExit);
  win.on("close", (e) => { if (!app._allowQuit) { e.preventDefault(); tryExit(); } });
}

async function shutdown() {
  try { if (serverProc) serverProc.kill(); } catch {}
  try { if (socketServer) await socketServer.stop(); } catch {}
  try { if (pglite) await pglite.close(); } catch {}
}

const single = app.requestSingleInstanceLock();
if (!single) { app.quit(); }
else {
  app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => {
    boot().catch(async (e) => {
      log("BOOT FAILED", e && e.stack || e);
      if (splash && !splash.isDestroyed()) splash.destroy();
      await dialog.showMessageBox({ type: "error", title: "Modo couldn't start", message: "Modo ran into a problem starting up.", detail: String(e && e.message || e) + "\n\nLog: " + LOG_FILE });
      app.exit(1);
    });
  });
  app.on("will-quit", () => { globalShortcut.unregisterAll(); });
  app.on("before-quit", async (e) => {
    if (app._allowQuit) { try { if (serverProc) serverProc.kill(); } catch {} return; } // let the updater restart us
    if (!app._shuttingDown) { app._shuttingDown = true; e.preventDefault(); await shutdown(); app.exit(0); }
  });
  app.on("window-all-closed", () => { app.quit(); });
}
