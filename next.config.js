/** @type {import('next').NextConfig} */
const security = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }, // always HTTPS
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" }, // never leak Modo addresses (with IDs) to other sites
  { key: "Permissions-Policy", value: "camera=(), microphone=*, geolocation=(self), payment=(), usb=(), bluetooth=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "Origin-Agent-Cluster", value: "?1" },
  // No plugins, no <base> tricks, no framing by other sites, forms only post to Modo, always HTTPS.
  { key: "Content-Security-Policy", value: "object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
];
module.exports = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["ogl"],
  experimental: { serverComponentsExternalPackages: ["ws", "@neondatabase/serverless", "@prisma/adapter-neon", "@prisma/client", "nodemailer", "undici", "web-push", "unpdf", "mammoth"], outputFileTracingIncludes: { "/api/subs/public": ["./lib/tenant-schema.sql"], "/api/subs": ["./lib/tenant-schema.sql"] } },
  async headers() {
    // Private pages and every API answer: never kept in the browser's or any proxy's cache, never indexed.
    const priv = [{ key: "Cache-Control", value: "no-store, no-cache, must-revalidate, private, max-age=0" }, { key: "Pragma", value: "no-cache" }, { key: "Expires", value: "0" }, { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }];
    return [{ source: "/:path*", headers: security }, ...["/api/:path*", "/admin/:path*", "/agent/:path*", "/login", "/test/:path*", "/kiosk", "/order-status"].map((source) => ({ source, headers: priv }))];
  },
  // Android app (TWA/Play Store) verification: serve Digital Asset Links at the well-known path.
  async rewrites() { return [{ source: "/.well-known/assetlinks.json", destination: "/api/assetlinks" }]; },
};
