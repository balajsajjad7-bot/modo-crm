// Change a sale's status (New / Active / Not active) with all the side effects: congrats alert to the agent,
// automatic return label, #sales-updates line and connector events. Used by the Sales page and Modo Agent.
import { db } from "./db";
import { sendPush } from "./push";
import { feed, tag } from "./salesFeed";
import { emit } from "./connectors";
import { returnConfig, makeLabel } from "./returnLabel";

export async function setSaleStatus(id, status, byName = "Admin") {
  const session = { name: byName };
  const before = await db.sale.findUnique({ where: { id }, select: { status: true } });
  const turnedActive = status === "VERIFIED" && before?.status !== "VERIFIED";
  let s = await db.sale.update({ where: { id }, data: { status, ...(turnedActive ? { activatedAt: new Date(), cheeredAt: null } : {}) }, include: { user: { select: { name: true } } } });
  // Congrats: the agent gets a phone alert now and a celebration in Modo the next time it's open.
  if (turnedActive) {
    const first = String(s.user?.name || "").split(" ")[0];
    sendPush(s.userId, { title: `🎉 Congrats ${first}! Sale approved`, body: `Well done! #${s.orderNumber || s.receipt}${s.customer ? " for " + s.customer : ""}${s.device ? " (" + s.device + ")" : ""} is now Active.`, url: "/agent", tag: "cheer-" + s.id, urgent: true }).catch(() => {});
  }
  // Automatic return label: when a sale turns Active and "Make a label automatically" is on in Connectors.
  if (status === "VERIFIED" && !s.returnLabelUrl) {
    try {
      const cfg = await returnConfig();
      if (cfg?.auto) { const r = await makeLabel(s, { cfg }); if (r.sale) s = { ...s, ...r.sale }; }
    } catch {}
  }
  if (before?.status !== status) await feed(`${status === "VERIFIED" ? "✅" : status === "REJECTED" ? "❌" : "↩️"} ${tag(s)} → ${status === "VERIFIED" ? "Active" : status === "REJECTED" ? "Not active" : "New"} by ${session.name}${turnedActive ? ` · ${String(s.user?.name || "").split(" ")[0]} got a congrats 🎉` : ""}${s.returnLabelUrl && turnedActive ? " · return label made" : ""}`);
  await emit("sale.status", { order: s.orderNumber, receipt: s.receipt, status: status === "VERIFIED" ? "Active" : status === "REJECTED" ? "Not active" : "New", agent: s.user.name, customer: s.customer });
  return s;
}
