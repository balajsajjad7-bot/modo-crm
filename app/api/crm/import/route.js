import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/perms";

// Import customers from CSV text. Header row with any of: name, phone, email, address, city, company, tags
function parseCSV(text) {
  const rows = []; let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else if (ch === '"') q = true; else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

export async function POST(req) {
  const s = await currentUser();
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!(await can(s, "importCSV"))) return NextResponse.json({ error: "Admin has turned this off for agents." }, { status: 403 });
  const { csv } = await req.json();
  const rows = parseCSV(String(csv || "").slice(0, 2_000_000));
  if (rows.length < 2) return NextResponse.json({ error: "The file needs a header row and at least one customer." }, { status: 400 });
  const head = rows.shift().map((h) => h.trim().toLowerCase().replace(/\s+/g, ""));
  const idx = (k, alts = []) => [k, ...alts].map((x) => head.indexOf(x)).find((i) => i >= 0);
  const col = { name: idx("name", ["fullname", "customer", "customername"]), phone: idx("phone", ["mobile", "phonenumber", "cell"]), email: idx("email"), address: idx("address"), city: idx("city"), company: idx("company"), tags: idx("tags", ["tag"]) };
  if (col.name === undefined) return NextResponse.json({ error: "Couldn't find a 'name' column." }, { status: 400 });
  const data = rows.slice(0, 5000).map((r) => {
    const g = (k) => (col[k] !== undefined ? String(r[col[k]] || "").trim() || null : null);
    return { name: g("name"), phone: g("phone"), email: g("email"), address: g("address"), city: g("city"), company: g("company"), tags: g("tags") || "imported", source: "CSV import", ownerId: s.uid };
  }).filter((d) => d.name);
  const res = await db.contact.createMany({ data });
  return NextResponse.json({ imported: res.count, skipped: rows.length - res.count });
}
