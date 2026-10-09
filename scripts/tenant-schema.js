// Build step: write Modo's full table list (from prisma/schema.prisma) to lib/tenant-schema.sql, so a brand-new
// company workspace database can be set up in one go. Never fails the build: without it, sign-ups just fall
// back to "request received" and the admin is told.
const { execSync } = require("child_process");
const fs = require("fs");
const out = "lib/tenant-schema.sql";
try {
  const sql = execSync("npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120000 });
  if (!sql.includes("CREATE TABLE")) throw new Error("no tables in output");
  fs.writeFileSync(out, sql);
  console.log(`tenant-schema: wrote ${out} (${(sql.match(/CREATE TABLE/g) || []).length} tables)`);
} catch (e) {
  console.warn("tenant-schema: skipped —", String(e.message).split("\n")[0]);
  if (!fs.existsSync(out)) fs.writeFileSync(out, "-- not generated\n");
}
