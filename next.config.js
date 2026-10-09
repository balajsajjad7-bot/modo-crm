/** @type {import('next').NextConfig} */
const security = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }, // always HTTPS
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
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
  experimental: { serverComponentsExternalPackages: ["ws", "@neondatabase/serverless", "@prisma/adapter-neon", "@prisma/client", "nodemailer", "undici", "web-push", "unpdf", "mammoth"] },
  async headers() { return [{ source: "/:path*", headers: security }]; },
  // Android app (TWA/Play Store) verification: serve Digital Asset Links at the well-known path.
  async rewrites() { return [{ source: "/.well-known/assetlinks.json", destination: "/api/assetlinks" }]; },
};
