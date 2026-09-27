/** @type {import('next').NextConfig} */
const security = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }, // always HTTPS
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(self), payment=()" },
];
module.exports = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["ogl"],
  experimental: { serverComponentsExternalPackages: ["ws", "@neondatabase/serverless", "@prisma/adapter-neon", "@prisma/client", "nodemailer"] },
  async headers() { return [{ source: "/:path*", headers: security }]; },
};
