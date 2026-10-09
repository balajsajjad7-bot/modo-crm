// Company workspaces: every company that signs up gets its own Modo — its own database (modo_t_<workspace>) in
// your Neon project — with an admin login and agent logins shown once on screen. The list of companies lives in
// YOUR database (mainDb), never in theirs.
import crypto from "crypto";
import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { mainDb, db, runAsOrg, tenantDbName, tenantUrl, validOrg } from "./db";
import { cleanUrl } from "./neon-url";

neonConfig.webSocketConstructor = ws;
const REG = "modo-tenants";
const NEON = "https://console.neon.tech/api/v2";

async function loadReg() {
  const b = await mainDb.fileBlob.findUnique({ where: { id: REG } }).catch(() => null);
  try { return b ? JSON.parse(Buffer.from(b.data).toString("utf8")) : { orgs: {} }; } catch { return { orgs: {} }; }
}
async function saveReg(v) {
  const data = Buffer.from(JSON.stringify(v), "utf8");
  await mainDb.fileBlob.upsert({ where: { id: REG }, update: { data, size: data.length }, create: { id: REG, userId: "system", name: REG, mime: "application/json", size: data.length, data } });
}
export async function listTenants() { return (await loadReg()).orgs; }

// Is this workspace allowed in right now? Cached for a minute per server.
const cache = globalThis.__tenantOpen || (globalThis.__tenantOpen = new Map());
export async function tenantState(org) {
  if (!validOrg(org)) return { ok: false, why: "Unknown workspace." };
  const hit = cache.get(org); if (hit && Date.now() - hit.at < 60000) return hit.v;
  const t = (await loadReg()).orgs[org];
  let v;
  if (!t || t.status === "failed") v = { ok: false, why: "We couldn't find that workspace. Check the workspace name." };
  else if (t.status === "paused") v = { ok: false, why: "This workspace is paused. Contact Modo to turn it back on." };
  else if (t.status === "cancelled") v = { ok: false, why: "This workspace's subscription was cancelled. Contact Modo to reactivate it." };
  else if (t.status === "trial" && t.trialEnds && new Date(t.trialEnds) < new Date()) v = { ok: false, why: "Your free trial has ended. Contact Modo to choose a plan and keep going." };
  else v = { ok: true, t };
  cache.set(org, { at: Date.now(), v });
  return v;
}
export async function setTenantStatus(org, status, extra = {}) {
  const r = await loadReg(); const t = r.orgs[org]; if (!t) return null;
  Object.assign(t, extra, status ? { status } : {}); t.updatedAt = new Date().toISOString(); await saveReg(r); cache.delete(org);
  return t;
}

// ── Neon: find your project + branch from DATABASE_URL, then create a database for the company ──
const neonKey = () => process.env.NEON_API_KEY || "";
export const canProvision = () => !!neonKey() && !!process.env.DATABASE_URL;
async function neon(pathname, opts = {}) {
  const r = await fetch(NEON + pathname, { ...opts, headers: { authorization: "Bearer " + neonKey(), accept: "application/json", "content-type": "application/json", ...(opts.headers || {}) }, signal: AbortSignal.timeout(20000) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Neon: " + (d.message || r.status));
  return d;
}
async function neonTarget() {
  const reg = await loadReg(); if (reg.neon?.projectId && reg.neon?.branchId) return reg.neon;
  const host = new URL(cleanUrl(process.env.DATABASE_URL)).hostname; // ep-xxx(-pooler).region.aws.neon.tech
  const ep = host.split(".")[0].replace(/-pooler$/, "");
  const projects = process.env.NEON_PROJECT_ID ? [{ id: process.env.NEON_PROJECT_ID }] : (await neon("/projects?limit=100")).projects || [];
  for (const p of projects) {
    const eps = (await neon(`/projects/${p.id}/endpoints`)).endpoints || [];
    const hit = eps.find((e) => e.id === ep || String(e.host || "").startsWith(ep));
    if (hit) { reg.neon = { projectId: p.id, branchId: hit.branch_id }; await saveReg(reg); return reg.neon; }
  }
  throw new Error("Couldn't find your Neon project from DATABASE_URL. Add NEON_PROJECT_ID in Vercel too.");
}
async function createDatabase(org) {
  const { projectId, branchId } = await neonTarget();
  const owner = decodeURIComponent(new URL(cleanUrl(process.env.DATABASE_URL)).username);
  await neon(`/projects/${projectId}/branches/${branchId}/databases`, { method: "POST", body: JSON.stringify({ database: { name: tenantDbName(org), owner_name: owner } }) });
}
async function dropDatabase(org) {
  try { const { projectId, branchId } = await neonTarget(); await neon(`/projects/${projectId}/branches/${branchId}/databases/${tenantDbName(org)}`, { method: "DELETE" }); } catch {}
}

// Modo's tables, generated from prisma/schema.prisma at build time (see package.json → vercel-build).
function schemaSql() {
  let sql = "";
  for (const p of [path.join(process.cwd(), "lib", "tenant-schema.sql"), path.join(__dirname, "tenant-schema.sql")]) { try { sql = fs.readFileSync(p, "utf8"); if (sql.includes("CREATE TABLE")) break; } catch {} }
  if (!sql.includes("CREATE TABLE")) throw new Error("Modo's table list wasn't built into this deploy. Redeploy once on Vercel.");
  return sql.split(/;\s*\n(?=\s*(?:--|CREATE|ALTER|DROP|$))/).map((x) => x.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean);
}
async function applySchema(org) {
  const pool = new Pool({ connectionString: tenantUrl(org) });
  try {
    for (let i = 0; ; i++) { try { await pool.query("SELECT 1"); break; } catch (e) { if (i >= 10) throw e; await new Promise((r) => setTimeout(r, 1500)); } } // new DB may take a moment
    const done = await pool.query(`SELECT to_regclass('public."User"') AS t`);
    if (done.rows[0]?.t) return;
    for (const stmt of schemaSql()) await pool.query(stmt);
  } finally { await pool.end().catch(() => {}); }
}

const slugify = (s) => String(s || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "").slice(0, 16);
const RESERVED = new Set(["admin", "modo", "main", "public", "login", "test", "api", "www", "root", "system", "support"]);
const PW = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
const password = () => Array.from(crypto.randomBytes(10), (b) => PW[b % PW.length]).join("");

// You (main admin) reset a customer's admin password: new random password, 2-step sign-in turned off so they can
// set it up again, and any lockout on that ID cleared. Returns the new login (shown once, never stored).
export async function resetWorkspaceAdmin(org) {
  if (!validOrg(org) || !(await loadReg()).orgs[org]) throw new Error("This customer has no workspace yet.");
  const pw = password();
  return runAsOrg(org, async () => {
    const admin = (await db.user.findUnique({ where: { agentId: "ADMIN" } }).catch(() => null))
      || (await db.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } }));
    if (!admin) throw new Error("No admin account found in that workspace.");
    await db.user.update({ where: { id: admin.id }, data: { passwordHash: await bcrypt.hash(pw, 10), active: true, totpEnabled: false, totpSecret: null } });
    try { const { cleared } = await import("./throttle"); await cleared("login-id:" + admin.agentId); } catch {}
    return { org, id: admin.agentId, name: admin.name, password: pw };
  });
}

// Create a company's Modo: database, tables, admin + agent logins. Returns the logins (shown once, never stored).
export async function provisionWorkspace({ company, contact, email, phone, plan = "free", seats = 3, trialDays = 14, source = "website" }) {
  if (!canProvision()) throw Object.assign(new Error("Instant workspaces aren't switched on yet (NEON_API_KEY missing)."), { notReady: true });
  const reg = await loadReg();
  const today = new Date().toISOString().slice(0, 10);
  const madeToday = Object.values(reg.orgs).filter((t) => (t.createdAt || "").startsWith(today) && t.source === "website").length;
  if (source === "website" && madeToday >= 40) throw new Error("We're getting a lot of sign-ups today. Your request was saved — we'll email your logins shortly.");
  let base = slugify(company) || "team"; if (base.length < 3) base = (base + "team").slice(0, 8); if (RESERVED.has(base)) base += "team";
  let org = base; for (let i = 2; reg.orgs[org]; i++) org = (base.slice(0, 13) + i);
  const isFree = plan === "free";
  const agents = Math.max(1, Math.min(isFree ? 2 : 25, (parseInt(seats, 10) || (isFree ? 3 : 10)) - 1));
  reg.orgs[org] = { name: String(company || org).slice(0, 80), contact: String(contact || "").slice(0, 80), email: String(email || "").slice(0, 120), phone: String(phone || "").slice(0, 40), plan, seats: agents + 1, status: "creating", source, createdAt: new Date().toISOString(), ...(isFree ? {} : { trialEnds: new Date(Date.now() + trialDays * 86400000).toISOString() }) };
  await saveReg(reg);
  try {
    await createDatabase(org);
    await applySchema(org);
    const users = [{ role: "ADMIN", id: "ADMIN", name: String(contact || "Admin").slice(0, 60) || "Admin", password: password() }];
    for (let i = 1; i <= agents; i++) users.push({ role: "AGENT", id: "AG" + String(i).padStart(2, "0"), name: "Agent " + i, password: password() });
    await runAsOrg(org, async () => {
      for (const u of users) {
        const passwordHash = await bcrypt.hash(u.password, 10);
        await db.user.upsert({ where: { agentId: u.id }, update: { passwordHash, role: u.role, active: true, name: u.name }, create: { agentId: u.id, name: u.name, role: u.role, passwordHash, ...(u.role === "ADMIN" && email ? { email: String(email).slice(0, 120) } : {}) } });
      }
    });
    await setTenantStatus(org, isFree ? "active" : "trial");
    return { org, users, plan, trialEnds: reg.orgs[org].trialEnds || null };
  } catch (e) {
    await setTenantStatus(org, "failed", { error: String(e.message).slice(0, 300) });
    await dropDatabase(org);
    throw e;
  }
}
