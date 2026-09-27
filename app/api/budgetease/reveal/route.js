import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { dec } from "@/lib/crypto";

// Admin only: show SSN last 4 and date of birth for one submission. Every reveal is recorded.
export async function POST(req) {
  const { session, error } = await requireRole("ADMIN");
  if (error) return error;
  const { id } = await req.json();
  const r = await db.beSale.findUnique({ where: { id: id || "" } });
  if (!r) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const audit = JSON.parse(r.audit || "[]"); audit.push({ by: session.name, uid: session.uid, at: new Date().toISOString() });
  await db.beSale.update({ where: { id: r.id }, data: { audit: JSON.stringify(audit.slice(-100)) } });
  return NextResponse.json({ ssn4: dec(r.ssn4), dob: dec(r.dob), audit });
}
