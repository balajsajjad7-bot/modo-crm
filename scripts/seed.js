// Creates or resets the admin account. Run: npm run seed
const fs = require("fs");
if (fs.existsSync(".env")) fs.readFileSync(".env", "utf8").split(/\r?\n/).forEach((l) => {
  const m = l.match(/^\s*([A-Z_]+)\s*=\s*"?([^"#]*?)"?\s*(#.*)?$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
});
const { PrismaClient } = require("@prisma/client");
const { PrismaNeon } = require("@prisma/adapter-neon");
const { Pool, neonConfig } = require("@neondatabase/serverless");
const { cleanUrl } = require("../lib/neon-url");
neonConfig.webSocketConstructor = require("ws");
const bcrypt = require("bcryptjs");
(async () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing from .env");
  const db = new PrismaClient({ adapter: new PrismaNeon(new Pool({ connectionString: cleanUrl(process.env.DATABASE_URL) })) });
  const agentId = (process.env.ADMIN_ID || "ADMIN").trim().toUpperCase(); // login always uses capitals
  const pw = (process.env.ADMIN_PASSWORD || "").trim();
  if (!pw || pw === "change-me") throw new Error("Set ADMIN_PASSWORD in .env first.");
  const hash = await bcrypt.hash(pw, 10);
  // Neon's free tier sleeps when idle; retry while it wakes up
  for (let i = 1; ; i++) {
    try { await db.$queryRaw`SELECT 1`; break; }
    catch (e) { if (i >= 5) throw e; console.log(`Database is waking up, retrying (${i}/4)...`); await new Promise((r) => setTimeout(r, 4000)); }
  }
  await db.user.upsert({
    where: { agentId },
    update: { passwordHash: hash, role: "ADMIN", active: true },
    create: { agentId, name: "Admin", role: "ADMIN", passwordHash: hash },
  });
  const check = await db.user.findUnique({ where: { agentId } });
  const ok = await bcrypt.compare(pw, check.passwordHash);
  console.log(`Admin ready: ${agentId}  (password is ${pw.length} characters, check: ${ok ? "OK" : "FAILED"})`);
  await db.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
