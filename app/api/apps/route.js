import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { TYPES, parse } from "@/lib/connectors";
import { relayOnline } from "@/lib/relay";

// Every app Modo can connect to, whether it's connected, and which Modo page uses it.
const OPEN = { ai: ["/admin/ai", "Modo AI"], vicidial: ["/admin/autodial", "Auto dialer"], gdrive: ["/admin/drive", "Drive"], dropbox: ["/admin/drive", "Drive"], shippo: ["/admin/sales", "Return labels"], tracking: ["/admin/tracking", "Order tracking"], smtp: ["/admin/email", "Email"], whatsapp: ["/admin/chat", "Chat"], lookup: ["/admin/lookups", "Lookups"] };
const SETUP = { gdrive: "/admin/drive", dropbox: "/admin/drive", vicidial: "/admin/dialer" };

export async function GET() {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const rows = await db.connector.findMany({ orderBy: { createdAt: "desc" } });
  const apps = Object.entries(TYPES).map(([key, t]) => {
    const mine = rows.filter((r) => r.type === key);
    const on = mine.find((r) => r.enabled);
    const cfg = on ? parse(on) : {};
    const connected = !!on && (key === "gdrive" || key === "dropbox" ? !!cfg.refreshToken : true);
    let detail = "";
    if (key === "gdrive" || key === "dropbox") detail = cfg.account || (on && !cfg.refreshToken ? "waiting for permission" : "");
    if (key === "vicidial" && on) detail = relayOnline(cfg) ? "through office relay" : cfg.url ? new URL(cfg.url).hostname : "";
    if (key === "ai" && on) detail = cfg.provider || "";
    return { key, label: t.label, hint: t.hint, group: t.group || "Other", connected, count: mine.length, detail, open: OPEN[key] ? { href: OPEN[key][0], label: OPEN[key][1] } : null, setup: SETUP[key] || "/admin/connectors" };
  });
  return NextResponse.json({ apps });
}
