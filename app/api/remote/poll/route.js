import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { poll } from "@/lib/remote";

// An agent's open Modo checks in every few seconds: where it is, and any admin command waiting for it.
export async function POST(req) {
  const s = await currentUser();
  if (!s || s.role !== "AGENT") return NextResponse.json({ cmds: [], locked: null });
  const b = await req.json().catch(() => ({}));
  const r = await poll(s.uid, { path: String(b.path || "").slice(0, 120), title: String(b.title || "").slice(0, 80), visible: !!b.visible, idle: !!b.idle });
  return NextResponse.json(r);
}
