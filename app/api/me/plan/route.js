import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { agentPlan } from "@/lib/subs";

export async function GET() {
  const { error, session } = await requireRole();
  if (error) return error;
  return NextResponse.json({ plan: await agentPlan(session.uid) });
}
