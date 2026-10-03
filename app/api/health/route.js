import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { configFor } from "@/lib/connectors";

// Admin → Settings → System check: is every part of Modo ready?
export async function GET() {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const checks = [];
  const add = (name, ok, detail, fix) => checks.push({ name, ok, detail, fix });
  const t0 = Date.now();
  try { await db.$queryRaw`SELECT 1`; add("Database connection", true, `Connected in ${Date.now() - t0} ms`); }
  catch (e) { add("Database connection", false, e.message.split("\n").pop(), "Check DATABASE_URL in .env"); return NextResponse.json({ checks }); }
  const tables = [["Users", () => db.user.count()], ["Attendance", () => db.attendance.count()], ["Sales", () => db.sale.count()], ["Chat", () => db.message.count()],
    ["Calls & huddles", () => db.huddle.count()], ["Customers", () => db.contact.count()], ["Pipeline", () => db.deal.count()], ["Tasks", () => db.task.count()], ["Connectors", () => db.connector.count()]];
  for (const [n, q] of tables) { try { const c = await q(); add(`${n} table`, true, `${c} record${c === 1 ? "" : "s"}`); } catch { add(`${n} table`, false, "Missing", "Run update-crm.bat (it runs npm run migrate)"); } }
  try { await db.sale.findFirst({ select: { orderNumber: true, saleType: true, notes: true } }); add("Sale form columns", true, "Up to date"); } catch { add("Sale form columns", false, "Missing new sale columns", "Run update-crm.bat"); }
  const s = await getSettings();
  const ai = (await configFor("ai"))?.apiKey || process.env.AI_API_KEY;
  add("AI (Modo AI, call assist, auto-fill)", !!ai, ai ? "Key set" : "No key", "Admin → Tools → Connectors → AI provider");
  const smtp = await configFor("smtp");
  add("Email (SMTP)", !!smtp?.host, smtp?.host ? `${smtp.host} as ${smtp.fromEmail || smtp.user}` : "Not set up", "Admin → Tools → Connectors → Email (SMTP)");
  try { await db.emailLog.count(); add("Email log table", true, "Ready"); } catch { add("Email log table", false, "Missing", "Run update-crm.bat"); }
  const vd = (await configFor("vicidial"))?.url || process.env.VICIDIAL_URL;
  add("VICIdial", !!vd && !/your-vicidial/.test(vd), vd && !/your-vicidial/.test(vd) ? vd : "Not connected (optional)", "Admin → Tools → Connectors → VICIdial");
  add("Office detection", !!(s.officeIps || s.officeLat != null), s.officeIps ? "Office Wi-Fi set" : s.officeLat != null ? "GPS location set" : "Not set (agents show as 'Clocked in' instead of 'In office')", "Team → Attendance → Office location, or Settings → Office IPs");
  const agents = await db.user.count({ where: { role: "AGENT", active: true } });
  add("Agents", agents > 0, `${agents} active`, "Team → Agents → Add an agent");
  add("Login secret", !!process.env.JWT_SECRET && !/change-me/.test(process.env.JWT_SECRET), process.env.JWT_SECRET ? "Set" : "Missing", "Set a long random JWT_SECRET in .env");
  return NextResponse.json({ checks });
}
