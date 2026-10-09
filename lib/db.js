// Connects to Neon over HTTPS/WebSockets (port 443) instead of Postgres port 5432,
// which some networks block or drop. Same Prisma queries everywhere else.
//
// Multi-company: your own Modo uses DATABASE_URL as always. Each company that signs up gets its OWN database
// (modo_t_<workspace>) in the same Neon project, so their data can never mix with yours. Which database a request
// uses comes from the signed-in session (middleware puts the verified workspace in the x-modo-org header), or
// from runAsOrg() for sign-in and provisioning. No workspace → your main database, exactly as before.
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { AsyncLocalStorage } from "node:async_hooks";
import { headers } from "next/headers";
import { cleanUrl } from "./neon-url";

neonConfig.webSocketConstructor = ws;
const g = globalThis;
function make(url) {
  const pool = new Pool({ connectionString: cleanUrl(url) });
  return new PrismaClient({ adapter: new PrismaNeon(pool) });
}
const base = g.__db || make(process.env.DATABASE_URL);
if (process.env.NODE_ENV !== "production") g.__db = base;

export const ORG_HEADER = "x-modo-org";
export const validOrg = (s) => /^[a-z0-9]{3,24}$/.test(String(s || ""));
export const tenantDbName = (org) => "modo_t_" + org;
export function tenantUrl(org) {
  const u = new URL(cleanUrl(process.env.DATABASE_URL));
  u.pathname = "/" + tenantDbName(org);
  return u.toString();
}

const als = g.__orgAls || (g.__orgAls = new AsyncLocalStorage());
const clients = g.__tenantDbs || (g.__tenantDbs = new Map());
const isDynamicErr = (e) => e?.digest === "DYNAMIC_SERVER_USAGE" || /Dynamic server usage/i.test(e?.message || "");

// Run code against one company's database (sign-in, provisioning). "" = your main database.
export function runAsOrg(org, fn) { return als.run({ org: validOrg(org) ? org : "" }, fn); }

// Which company is this request for? "" = your own (main) Modo.
export function currentOrg() {
  const s = als.getStore(); if (s) return s.org || "";
  let h; try { h = headers(); } catch (e) { if (isDynamicErr(e)) throw e; return ""; } // outside a request (cron, scripts) → main
  const o = h.get(ORG_HEADER);
  return validOrg(o) ? o : "";
}
function clientFor(org) {
  if (!org) return base;
  let c = clients.get(org);
  if (!c) { c = make(tenantUrl(org)); clients.set(org, c); }
  return c;
}

// Always your own Modo's database (company registry, subscriptions, your alerts).
export const mainDb = base;
// The database for whoever is making this request.
export const db = new Proxy({}, {
  get(_, k) {
    const c = clientFor(currentOrg());
    const v = c[k];
    return typeof v === "function" ? v.bind(c) : v;
  },
});
