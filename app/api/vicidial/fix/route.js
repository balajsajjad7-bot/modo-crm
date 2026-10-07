import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { viciConnector, relayOnline } from "@/lib/relay";
import { clearHold } from "@/lib/vicidial";
import { viciHealth } from "@/lib/vicidialHealth";

export const maxDuration = 60;
// One button: "Fix dialer connection". Wakes the free cloud relay (it sleeps when unused), waits for it to
// check in, signs it in on the dialer's firewall page, clears any pause, then re-checks every step and says
// in plain words what (if anything) is still blocked and how to fix it.
export async function POST() {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const done = [];
  clearHold(); done.push("Cleared the waiting period after earlier errors");
  let conn = await viciConnector();
  if (!conn) return NextResponse.json({ ok: false, done, summary: "VICIdial isn't connected yet.", fix: "Open Connectors → VICIdial and enter the dialer URL, API user and password." });
  if (conn.cfg.relayUrl && !relayOnline(conn.cfg)) {
    const url = conn.cfg.relayUrl.replace(/\/+$/, "");
    await fetch(url + "/ping", { signal: AbortSignal.timeout(25000) }).catch(() => {});
    for (let i = 0; i < 9 && !relayOnline((conn = await viciConnector()).cfg); i++) await new Promise((r) => setTimeout(r, 3000));
    done.push(relayOnline(conn.cfg) ? "Woke up the cloud relay — it's online" : "Tried to wake the cloud relay (it may need another minute)");
  } else if (conn.cfg.relayUrl) done.push("Cloud relay is online");
  const h = await viciHealth();
  const bad = h.steps.filter((s) => !s.ok);
  const warn = h.steps.filter((s) => s.ok && s.warn);
  return NextResponse.json({
    ok: !bad.length, done, steps: h.steps,
    summary: !bad.length ? (warn.length ? `Connected ✓ — ${warn.length} thing(s) worth a look below.` : "Everything works ✓ — calls, agents, recordings and listening.") : `Still blocked at: ${bad[0].name}`,
    fix: bad[0]?.fix || bad[0]?.detail || "",
  });
}
