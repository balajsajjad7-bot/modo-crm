import { getSettings } from "./settings";

// What agents may do. Admin can always do everything. Changed in Team → Agent access.
export const PERMS = {
  crm: { label: "Use CRM pages (pipeline, customers, tasks)", def: true },
  notepad: { label: "Use the callback notepad", def: true },
  seeContactInfo: { label: "See customers' phone, email and address", def: true },
  addNotes: { label: "Add notes and log calls", def: true },
  scheduleCallbacks: { label: "Schedule callbacks and tasks", def: true },
  addCustomers: { label: "Add new customers", def: true },
  editCustomers: { label: "Edit customer details (name, phone, address)", def: false },
  deals: { label: "Create and move deals in the pipeline", def: true },
  importCSV: { label: "Import customers from CSV", def: false },
  emailCustomers: { label: "Email customers from the CRM", def: false },
  lookups: { label: "Use Lookups (phone, ZIP, address, your own)", def: true },
  calculator: { label: "Use the discount calculator", def: true },
  callAssist: { label: "Use Call assist (live suggestions)", def: true },
  chat: { label: "Use team Chat & huddles", def: true },
  modoAI: { label: "Use Modo AI", def: true },
  googleVoice: { label: "Use the Modo phone (manual calls)", def: true },
  aiBuilder: { label: "Use AI Builder (build apps and pages with AI)", def: true },
  submitSale: { label: "Submit sales", def: true },
};
export const defaults = () => Object.fromEntries(Object.entries(PERMS).map(([k, v]) => [k, v.def]));

export async function permsFor(session) {
  if (!session) return {};
  if (session.role === "ADMIN") return Object.fromEntries(Object.keys(PERMS).map((k) => [k, true]));
  const s = await getSettings();
  let saved = {}; try { saved = JSON.parse(s.agentPerms || "{}"); } catch {}
  return { ...defaults(), ...saved };
}
export async function can(session, key) { return !!(await permsFor(session))[key]; }
