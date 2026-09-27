import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { askAI } from "@/lib/ai";
import { toolById, TOOLS } from "@/lib/assistTools";

const readable = (t) => (t || "").split("\n").filter(Boolean).map((l) => (l.startsWith("C: ") ? "Customer: " + l.slice(3) : "Agent: " + l.replace(/^A: /, ""))).join("\n");

export async function GET() { return NextResponse.json(TOOLS.map(({ prompt, ...t }) => t)); }

// { tool, sessionId?, input? }
export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const b = await req.json();
  const tool = toolById(b.tool);
  if (!tool) return NextResponse.json({ error: "Unknown tool." }, { status: 400 });
  let call = null;
  if (b.sessionId) call = await db.callSession.findFirst({ where: { id: b.sessionId, ...(s.role === "ADMIN" ? {} : { userId: s.uid }) } });
  if (!call && s.role !== "ADMIN") call = await db.callSession.findFirst({ where: { userId: s.uid, endedAt: null }, orderBy: { startedAt: "desc" } });
  let live = {}; try { live = JSON.parse(call?.live || "{}"); } catch {}
  const me = await db.user.findUnique({ where: { id: s.uid }, select: { name: true } });
  const ctx = [
    `Agent's name: ${me?.name || ""}. Customers are in the USA.`,
    live.facts ? `Known facts: ${JSON.stringify(live.facts)}` : "", live.objection ? `Latest objection: ${live.objection}` : "",
    call?.lastTip ? `Last suggested line: ${call.lastTip}` : "",
    b.input ? `Agent's input: ${String(b.input).slice(0, 1500)}` : "",
    call?.transcript ? `Call so far:\n${readable(call.transcript).slice(-6000)}` : "No call transcript yet (answer generally, or from the agent's input).",
  ].filter(Boolean).join("\n\n");
  try {
    const text = await askAI(`You are Modo, a world-class real-time sales coach sitting next to a US call-center agent during a live call. Be practical and fast: short lines the agent can say out loud. Never suggest lying, pressure, or skipping disclosures. Plain text, no markdown symbols.\n\nTASK: ${tool.prompt}`, ctx, { maxTokens: 700 });
    return NextResponse.json({ text });
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
