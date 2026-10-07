import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { BOT_INFO, botConfig, saveBotConfig } from "@/lib/botsPlus";
import { runBots } from "@/lib/bots";

export const maxDuration = 60;
// Admin → AI → Bots: every bot, on/off, last run; run them all now.
export async function GET() {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const cfg = await botConfig();
  return NextResponse.json({ bots: BOT_INFO.map((b) => ({ ...b, on: !cfg.off?.includes(b.key), run: cfg.runs?.[b.key] || null })) });
}
export async function POST(req) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const b = await req.json().catch(() => ({}));
  if (b.run) { const r = await runBots({ force: true }); return NextResponse.json({ ok: true, result: r.bots }); }
  if (b.key) {
    const cfg = await botConfig(); const off = new Set(cfg.off || []);
    if (b.on) off.delete(String(b.key)); else off.add(String(b.key));
    await saveBotConfig({ ...cfg, off: [...off] });
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Nothing to do." }, { status: 400 });
}
