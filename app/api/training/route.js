import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { ensureTraining, listLessons } from "@/lib/training";

// Lessons and product knowledge from #modo-training. ?kind=knowledge | lesson
export async function GET(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  await ensureTraining().catch(() => {});
  const kind = new URL(req.url).searchParams.get("kind");
  return NextResponse.json(await listLessons(["knowledge", "lesson"].includes(kind) ? kind : undefined));
}
