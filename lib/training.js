import { db } from "./db";

// #modo-training: a channel everyone is always in. Admins post lessons (call guides, scripts, rules);
// agents read them, tap "Got it" (a ✅ reaction) and ask questions in the lesson's thread.
// Lessons are ordinary chat messages with kind "LESSON" and text = JSON { title, body }.
// Body format (plain text, easy to paste):
//   # Heading            → section heading
//   "Quoted line"        → a line to say to the customer (shown as a script bubble)
//   - item               → bullet
//   [ ] item             → checklist item
//   ! line               → important notice
//   anything else        → normal paragraph
export const TRAINING_ID = "modo-training";
export const GOT_IT = "✅";

const FIRST_LESSON = {
  title: "Customer Service & Savings Call Guide",
  body: `! Say who you really are and why you're calling. Never claim to be Verizon or any other provider unless we are authorised. Never promise a discount, bill payment, gift or device until it is verified and approved.

# 1. Opening & permission
"Hello, may I speak with [Customer Name]? My name is [Agent Name], calling from [Your Company]. This is a [sales/service] call about [accurate purpose]. Is now an okay time for a quick conversation?"
If they're busy:
"No problem. Is there a better time to call, or would you prefer not to receive another call?"

# 2. Understand their experience
"I'm calling to understand how things are going with your current service. Have you had any issues with your service or billing recently?"
If yes:
"I'm sorry you've had that experience. I can explain what our team is able to help with. I can't access or change your provider's account unless we're authorized to do so."
If no:
"That's good to hear. Are you generally comfortable with what you pay each month, or would you be interested in reviewing possible savings?"

# 3. Explain a savings offer transparently
"Depending on your eligibility and the terms, there may be an offer worth reviewing. I'll explain the actual provider, price, duration, fees, and any conditions before you decide. I don't want to promise savings until they're confirmed."
Before quoting an offer, confirm and explain:
- The company providing the offer and whether it is affiliated with the customer's current provider
- The verified current price and the exact new price (if confirmed)
- How long the price lasts, what may cause it to change, and any taxes or fees
- Whether a contract, credit check, cancellation fee, or plan change applies
- Any bill credit or payment assistance, including who funds it and when it will appear

# 4. Confirm details only when needed
"To check the offer, I may need to confirm limited information, such as your ZIP code. Please don't share passwords, one-time verification codes, full payment-card details, or your Social Security number on this call."
Collect only what's needed for the stated purpose, follow company privacy procedures, and explain why each detail is needed.

# 5. Devices, gifts & promotions
"If any device or gift promotion is available, I'll provide the exact model, storage, total cost, taxes, shipping, eligibility rules, and any one-time or recurring charges. I'll only describe an item as free if the written terms confirm that it is free with no undisclosed costs."
! Never imply a customer has been selected for a phone, tablet, watch or gift unless eligibility is confirmed through an approved system.

# 6. Recap & customer consent
"Before we proceed, let me recap: [company], [offer or service], [confirmed price], [duration], and [fees/conditions]. Is that clear, and would you like to continue? You can take time to review the written terms before making a decision."
! Do not enroll a customer, change service, or submit an order without clear consent and any required verification.

# 7. Transfer to a supervisor
"I can connect you with my supervisor for further assistance. I'll explain the reason for the transfer so you don't have to repeat everything. Please hold while I check whether they're available."

# Quick compliance checklist
[ ] I stated my real name, company, and purpose
[ ] I did not falsely claim to be the customer's provider
[ ] I used only verified pricing, discounts, and promotion terms
[ ] I explained fees, duration, eligibility, and conditions clearly
[ ] I requested only necessary information and protected customer privacy
[ ] I received clear consent before proceeding and honored opt-out requests`,
};

let seeded = false;
export async function ensureTraining() {
  const exists = await db.conversation.findUnique({ where: { id: TRAINING_ID }, select: { id: true } });
  if (!exists) {
    await db.conversation.create({ data: { id: TRAINING_ID, name: "modo-training", isGroup: true, isChannel: true, topic: "Lessons and call guides from management. Read each one and tap Got it." } });
  }
  const users = await db.user.findMany({ where: { active: true }, select: { id: true } });
  await db.convMember.createMany({ data: users.map((u) => ({ conversationId: TRAINING_ID, userId: u.id })), skipDuplicates: true });
  if (!seeded) {
    const any = await db.message.count({ where: { conversationId: TRAINING_ID, kind: "LESSON" } });
    if (!any) await postLesson("modo-bot", FIRST_LESSON);
    seeded = true;
  }
}

export function cleanLesson(l) {
  const title = String(l?.title || "").trim().slice(0, 140);
  const body = String(l?.body || "").replace(/\r\n/g, "\n").trim().slice(0, 12000);
  return title && body ? { title, body } : null;
}

export async function postLesson(userId, lesson) {
  const l = cleanLesson(lesson); if (!l) return null;
  const m = await db.message.create({ data: { conversationId: TRAINING_ID, userId, kind: "LESSON", text: JSON.stringify(l) } });
  await db.conversation.update({ where: { id: TRAINING_ID }, data: { lastMessageAt: m.createdAt } });
  return m;
}

export const lessonTitle = (text) => { try { return JSON.parse(text).title || "Lesson"; } catch { return "Lesson"; } };

// Plain-text version of the latest lessons for Modo AI, so call assist and the AI coach follow them.
export async function lessonsForAI(limit = 6) {
  const list = await db.message.findMany({ where: { conversationId: TRAINING_ID, kind: "LESSON", deletedAt: null, parentId: null }, orderBy: { createdAt: "desc" }, take: limit });
  return list.map((m) => { try { const l = JSON.parse(m.text); return `## ${l.title}\n${l.body}`; } catch { return ""; } }).filter(Boolean).join("\n\n");
}
