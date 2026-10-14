// Which database Modo uses: MODO_DATABASE_URL (a database connected in Vercel → Storage with the prefix "MODO")
// wins over the older hand-pasted DATABASE_URL, which is kept untouched so old data can still be copied across.
if (process.env.MODO_DATABASE_URL) process.env.DATABASE_URL = process.env.MODO_DATABASE_URL;
// Neon's HTTPS/WebSocket driver doesn't need Prisma-only options in the URL.
function cleanUrl(raw) {
  const u = new URL(raw);
  ["pgbouncer", "connect_timeout", "channel_binding", "schema"].forEach((k) => u.searchParams.delete(k));
  return u.toString();
}
module.exports = { cleanUrl };
