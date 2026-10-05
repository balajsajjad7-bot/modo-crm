import { db } from "./db";

// Full JSON backup of all business data (no passwords or API secrets).
export async function buildBackup() {
  const safe = async (fn) => { try { return await fn(); } catch { return []; } };

  const data = {
    exportedAt: new Date().toISOString(),
    version: 1,
    users: await safe(() => db.user.findMany({ select: { id: true, agentId: true, name: true, email: true, phone: true, role: true, baseSalary: true, shiftStart: true, shiftHours: true, workDays: true, departmentId: true, campaignId: true, vicidialUser: true, active: true, createdAt: true } })),
    sales: await safe(() => db.sale.findMany()),
    budgetEase: await safe(() => db.beSale.findMany()),
    contacts: await safe(() => db.contact.findMany()),
    activity: await safe(() => db.crmActivity.findMany()),
    tasks: await safe(() => db.task.findMany()),
    calls: await safe(() => db.callSession.findMany()),
    attendance: await safe(() => db.attendance.findMany()),
    breaks: await safe(() => db.breakLog.findMany()),
    adjustments: await safe(() => db.adjustment.findMany()),
    agentNotes: await safe(() => db.agentNote.findMany()),
    conversations: await safe(() => db.conversation.findMany()),
    messages: await safe(() => db.message.findMany()),
    geoEvents: await safe(() => db.geoEvent.findMany()),
    qa: await safe(() => db.recordingQa.findMany()),
  };
  return data;
}
