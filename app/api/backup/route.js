import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdminOnly } from "@/lib/auth";
import { buildBackup } from "@/lib/backup";

// Owner/admin: download a full JSON backup of all business data (no passwords or API secrets).
export async function GET() {
  const { error } = await requireAdminOnly();
  if (error) return error;
  const data = await buildBackup();
  const json = JSON.stringify(data, null, 2);
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(json, {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="modo-backup-${date}.json"`,
      "cache-control": "no-store",
    },
  });
}
