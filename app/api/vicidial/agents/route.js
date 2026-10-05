import { NextResponse } from "next/server";

export const maxDuration = 60;
import { requireRole } from "@/lib/auth";
import { loggedInAgents } from "@/lib/vicidial";
import { configFor } from "@/lib/connectors";

// Admin: everyone currently on the dialer, UNfiltered, with campaign + user group,
// so you can see which campaign your named agents are in and then set the filter.
export async function GET() {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  try {
    const cfg = (await configFor("vicidial")) || {};
    const raw = await loggedInAgents({ ...cfg, campaigns: "", userGroups: "" }); // keep creds, drop filter
    const agents = raw.map((a) => ({
      user: a.user || a.f0 || "",
      name: a.full_name || a.fullname || a.name || "",
      campaign: a.campaign_id || a.campaign || a.campaignid || "",
      group: a.user_group || a.group || "",
      status: a.status || "",
    }));
    const uniq = (k) => [...new Set(agents.map((a) => a[k]).filter(Boolean))].sort();
    return NextResponse.json({ agents, campaigns: uniq("campaign"), groups: uniq("group"), count: agents.length });
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 502 }); }
}
