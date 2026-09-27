// Turns common setup/database errors into plain instructions.
export function friendlyError(e) {
  const code = e?.code || "", msg = String(e?.message || e);
  if (code === "P2021" || /does not exist in the current database/i.test(msg)) return "Database tables are missing. Stop the server, run: npm run db:push, then npm run dev.";
  if (code === "P1001" || code === "P1000" || /Can't reach database|authentication failed/i.test(msg)) return "Can't connect to the database. Check DATABASE_URL in .env (copy it again from Neon, keep the quotes).";
  if (/Environment variable not found: DATABASE_URL/i.test(msg)) return "DATABASE_URL is missing. Make sure the file is named exactly .env (not .env.txt) and restart npm run dev.";
  if (/did you run "prisma generate"|has not been initialized/i.test(msg)) return "Database client isn't ready. Stop the server, run: npx prisma generate, then npm run dev.";
  return "Server error: " + msg.split("\n").filter(Boolean).slice(-1)[0].slice(0, 200);
}
