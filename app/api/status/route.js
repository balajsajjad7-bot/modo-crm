import { NextResponse } from "next/server";
import { lockState } from "@/lib/lock";
// Public: is the CRM paused by admin?
export async function GET() {
  const l = await lockState();
  return NextResponse.json({ lockdown: l.on, message: l.message }, { headers: { "cache-control": "no-store" } });
}
