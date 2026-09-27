// Neon's HTTPS/WebSocket driver doesn't need Prisma-only options in the URL.
function cleanUrl(raw) {
  const u = new URL(raw);
  ["pgbouncer", "connect_timeout", "channel_binding", "schema"].forEach((k) => u.searchParams.delete(k));
  return u.toString();
}
module.exports = { cleanUrl };
