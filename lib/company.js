// Your company's name. Modo is the CRM; this is the company using it (shown on contracts, welcome letters,
// hiring pages, interview invites, WhatsApp replies and agent welcomes). Edit it in Admin → Settings → Your company.
import { getSettings } from "./settings";
import { currentOrg } from "./db";

export const DEFAULT_COMPANY = "Voice Verve";

export async function companyName() {
  const st = await getSettings().catch(() => null);
  const n = String(st?.companyName || "").trim();
  if (n) return n;
  let org = ""; try { org = currentOrg(); } catch {}
  if (!org) return DEFAULT_COMPANY;
  try { const { listTenants } = await import("./tenants"); const t = (await listTenants())[org]; if (t?.name) return t.name; } catch {}
  return "our company";
}
