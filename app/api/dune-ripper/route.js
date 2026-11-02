import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { lockState } from "@/lib/lock";
import { BOT, ensureBotChannel } from "@/lib/bots";
import { handleCommand } from "@/lib/botCommands";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Dune Ripper, Balaj's personal assistant, talks to Modo here. It sends one admin command at a time and gets
// the same answer #modo-bot would give, so customer messages and sale changes still wait for YES.
// Off until DUNE_RIPPER_KEY is set (32+ characters). The emergency stop blocks it too.
const hash = (s) => createHash("sha256").update(String(s)).digest();
const sameKey = (a, b) => timingSafeEqual(hash(a), hash(b));
const fail = (error, status) => NextResponse.json({ error }, { status });

export async function POST(req) {
  const key = process.env.DUNE_RIPPER_KEY || "";
  if (key.length < 32) return fail("Dune Ripper isn't set up.", 503);
  const given = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!given || !sameKey(given, key)) return fail("Wrong key.", 401);
  if ((await lockState()).on) return fail("Modo is under emergency stop.", 423);

  const body = await req.json().catch(() => null);
  const text = String(body?.text || "").trim().slice(0, 2000);
  if (!text) return fail("Send some text.", 400);

  try {
    const admin = await db.user.findFirst({ where: { role: "ADMIN", active: true }, orderBy: [{ ceo: "desc" }, { createdAt: "asc" }], select: { id: true, name: true } });
    if (!admin) return fail("No admin account found.", 500);

    // Leaves a trail in #modo-bot of everything sent through this door. Written directly so it doesn't go out to phones or connectors.
    try {
      await ensureBotChannel();
      await db.message.create({ data: { conversationId: BOT, userId: BOT, kind: "TEXT", text: `🏜️ Dune Ripper: ${text.slice(0, 300)}` } });
    } catch {}
    const reply = await handleCommand(text, { uid: admin.id, name: admin.name + " (Dune Ripper)", role: "ADMIN" });
    return NextResponse.json({ reply: String(reply || "Done.") });
  } catch (e) {
    return fail("Modo couldn't finish that: " + String(e?.message || "unknown error").slice(0, 200), 500);
  }
}
