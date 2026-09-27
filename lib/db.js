// Connects to Neon over HTTPS/WebSockets (port 443) instead of Postgres port 5432,
// which some networks block or drop. Same Prisma queries everywhere else.
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { cleanUrl } from "./neon-url";

neonConfig.webSocketConstructor = ws;
const g = globalThis;
function make() {
  const pool = new Pool({ connectionString: cleanUrl(process.env.DATABASE_URL) });
  return new PrismaClient({ adapter: new PrismaNeon(pool) });
}
export const db = g.__db || make();
if (process.env.NODE_ENV !== "production") g.__db = db;
