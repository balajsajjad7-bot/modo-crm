import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { vapidPublic } from "@/lib/push";

// The browser fetches the public key, then subscribes and posts the subscription here.
export async function GET() {
  return NextResponse.json({ key: vapidPublic() });
}

export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { subscription, ua } = await req.json().catch(() => ({}));
  const endpoint = subscription?.endpoint, p256dh = subscription?.keys?.p256dh, auth = subscription?.keys?.auth;
  if (!endpoint || !p256dh || !auth) return NextResponse.json({ error: "Bad subscription." }, { status: 400 });
  await db.pushSub.upsert({
    where: { endpoint },
    update: { userId: s.uid, p256dh, auth, ua: (ua || "").slice(0, 200) },
    create: { userId: s.uid, endpoint, p256dh, auth, ua: (ua || "").slice(0, 200) },
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const endpoint = new URL(req.url).searchParams.get("endpoint");
  if (endpoint) await db.pushSub.deleteMany({ where: { endpoint, userId: s.uid } });
  return NextResponse.json({ ok: true });
}
