// Modo for Windows — offline server.
// Runs INSIDE the packaged app folder so it resolves the app's own node_modules (next, pg, prisma).
// It is launched by the Electron shell (desktop/main.js) once the bundled local PostgreSQL is up.
// It makes sure the admin login exists with a known password, then starts Next on a loopback port.
// Nothing here reaches the internet: the whole CRM runs on the local database.
const path = require("path");
const http = require("http");

const APP_DIR = path.join(__dirname, ".."); // the app root inside resources
const PORT = parseInt(process.env.PORT || "41700", 10);
const HOST = "127.0.0.1";

async function ensureAdmin() {
  // Guarantee a predictable desktop login (survives the one-time cloud password fix in migrate.js),
  // so whoever installs Modo can always get in on this PC.
  try {
    const { Pool } = require("pg");
    const bcrypt = require("bcryptjs");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    const agentId = (process.env.ADMIN_ID || "ADMIN").trim().toUpperCase();
    const pw = (process.env.ADMIN_PASSWORD || "").trim();
    if (!pw) { await pool.end(); return; } // only apply a password the user actually set during install
    const hash = await bcrypt.hash(pw, 10);
    await pool.query(`UPDATE "User" SET "passwordHash"=$1, "role"='ADMIN', "active"=true WHERE "agentId"=$2`, [hash, agentId]);
    await pool.end();
    console.log("MODO_ADMIN_READY " + agentId);
  } catch (e) {
    console.error("Admin ensure skipped: " + e.message);
  }
}

async function main() {
  await ensureAdmin();
  const next = require("next");
  const app = next({ dev: false, dir: APP_DIR });
  await app.prepare();
  const handle = app.getRequestHandler();
  http.createServer((req, res) => handle(req, res)).listen(PORT, HOST, () => {
    // The Electron shell watches for this line before it opens the window.
    console.log("MODO_READY " + PORT);
  });
}

main().catch((e) => { console.error("MODO_FATAL " + (e && e.stack || e)); process.exit(1); });
