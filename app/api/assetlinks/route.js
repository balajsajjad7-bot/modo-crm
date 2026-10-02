import { NextResponse } from "next/server";

// Digital Asset Links for the Android app (TWA). Set these env vars on Vercel after you
// generate the Android package, so the installed app opens full-screen (no browser bar):
//   ANDROID_PACKAGE   e.g. app.vercel.modo_crm1  (your app's package name)
//   ANDROID_SHA256    the app signing cert SHA-256 fingerprint(s), comma-separated
// Google Play App Signing shows the SHA-256 under Setup → App integrity.
export async function GET() {
  const pkg = process.env.ANDROID_PACKAGE || "com.modo.crm";
  const fps = (process.env.ANDROID_SHA256 || "").split(",").map((s) => s.trim()).filter(Boolean);
  const body = [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: { namespace: "android_app", package_name: pkg, sha256_cert_fingerprints: fps },
    },
  ];
  return NextResponse.json(body, { headers: { "content-type": "application/json", "cache-control": "public, max-age=600" } });
}
