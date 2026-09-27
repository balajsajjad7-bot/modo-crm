import { db } from "./db";
import { getSettings } from "./settings";
import { payslip } from "./payroll";

// Loads everything a payslip needs for one or more agents.
export async function slipsFor(users, month) {
  const ids = users.map((u) => u.id);
  const where = { userId: { in: ids }, shiftDate: { startsWith: month } };
  const [settings, attendance, breaks, activity, sales, adjustments] = await Promise.all([
    getSettings(), db.attendance.findMany({ where, orderBy: { shiftDate: "desc" } }), db.breakLog.findMany({ where }),
    db.activity.findMany({ where }), db.sale.findMany({ where, select: { userId: true, shiftDate: true, status: true } }),
    db.adjustment.findMany({ where: { userId: { in: ids }, month }, orderBy: { createdAt: "asc" } }),
  ]);
  const of = (list, id) => list.filter((x) => x.userId === id);
  return users.map((u) => {
    const att = of(attendance, u.id);
    return { user: u, attendance: att, slip: payslip(u, att, month, new Date(), {
      breaks: of(breaks, u.id), activity: of(activity, u.id), sales: of(sales, u.id), settings, adjustments: of(adjustments, u.id) }) };
  });
}
