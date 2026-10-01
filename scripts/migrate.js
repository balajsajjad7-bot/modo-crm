// Creates the chat/huddle tables over HTTPS (port 443), so it works even when port 5432 is blocked.
// Safe to run many times. Run: npm run migrate
const fs = require("fs");
if (fs.existsSync(".env")) fs.readFileSync(".env", "utf8").split(/\r?\n/).forEach((l) => {
  const m = l.match(/^\s*([A-Z_]+)\s*=\s*"?([^"#]*?)"?\s*(#.*)?$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
});
const { Pool, neonConfig } = require("@neondatabase/serverless");
const { cleanUrl } = require("../lib/neon-url");
neonConfig.webSocketConstructor = require("ws");

const fk = (table, name, col, ref) => `DO $$ BEGIN ALTER TABLE "${table}" ADD CONSTRAINT "${name}" FOREIGN KEY ("${col}") REFERENCES "${ref}"("id") ON DELETE CASCADE ON UPDATE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`;
const SQL = [
  `CREATE TABLE IF NOT EXISTS "Conversation" ("id" TEXT NOT NULL, "name" TEXT, "isGroup" BOOLEAN NOT NULL DEFAULT false, "createdById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id"))`,
  `CREATE TABLE IF NOT EXISTS "ConvMember" ("id" TEXT NOT NULL, "conversationId" TEXT NOT NULL, "userId" TEXT NOT NULL, "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ConvMember_pkey" PRIMARY KEY ("id"))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "ConvMember_conversationId_userId_key" ON "ConvMember"("conversationId", "userId")`,
  `CREATE INDEX IF NOT EXISTS "ConvMember_userId_idx" ON "ConvMember"("userId")`,
  `CREATE TABLE IF NOT EXISTS "Message" ("id" TEXT NOT NULL, "conversationId" TEXT NOT NULL, "userId" TEXT NOT NULL, "kind" TEXT NOT NULL DEFAULT 'TEXT', "text" TEXT, "fileId" TEXT, "fileName" TEXT, "fileMime" TEXT, "fileSize" INTEGER, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Message_pkey" PRIMARY KEY ("id"))`,
  `CREATE INDEX IF NOT EXISTS "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt")`,
  `CREATE TABLE IF NOT EXISTS "FileBlob" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "name" TEXT NOT NULL, "mime" TEXT NOT NULL, "size" INTEGER NOT NULL, "data" BYTEA NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "FileBlob_pkey" PRIMARY KEY ("id"))`,
  `CREATE TABLE IF NOT EXISTS "Huddle" ("id" TEXT NOT NULL, "conversationId" TEXT NOT NULL, "startedById" TEXT NOT NULL, "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "endedAt" TIMESTAMP(3), CONSTRAINT "Huddle_pkey" PRIMARY KEY ("id"))`,
  `CREATE TABLE IF NOT EXISTS "HuddleParticipant" ("id" TEXT NOT NULL, "huddleId" TEXT NOT NULL, "userId" TEXT NOT NULL, "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "leftAt" TIMESTAMP(3), "muted" BOOLEAN NOT NULL DEFAULT false, CONSTRAINT "HuddleParticipant_pkey" PRIMARY KEY ("id"))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "HuddleParticipant_huddleId_userId_key" ON "HuddleParticipant"("huddleId", "userId")`,
  `CREATE TABLE IF NOT EXISTS "Signal" ("id" TEXT NOT NULL, "huddleId" TEXT NOT NULL, "fromId" TEXT NOT NULL, "toId" TEXT NOT NULL, "type" TEXT NOT NULL, "payload" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Signal_pkey" PRIMARY KEY ("id"))`,
  `CREATE INDEX IF NOT EXISTS "Signal_huddleId_toId_idx" ON "Signal"("huddleId", "toId")`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3)`,
  `ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "isChannel" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "isPrivate" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "topic" TEXT`,
  `ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "parentId" TEXT`,
  `ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "editedAt" TIMESTAMP(3)`,
  `ALTER TABLE "Message" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3)`,
  `CREATE INDEX IF NOT EXISTS "Message_parentId_idx" ON "Message"("parentId")`,
  `CREATE TABLE IF NOT EXISTS "Reaction" ("id" TEXT NOT NULL, "messageId" TEXT NOT NULL, "userId" TEXT NOT NULL, "emoji" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Reaction_pkey" PRIMARY KEY ("id"))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Reaction_messageId_userId_emoji_key" ON "Reaction"("messageId", "userId", "emoji")`,
  fk("Reaction", "Reaction_messageId_fkey", "messageId", "Message"),
  `UPDATE "Conversation" SET "name" = 'general', "isChannel" = true, "topic" = COALESCE("topic", 'Company-wide announcements and chat') WHERE "id" = 'everyone' AND "isChannel" = false`,
  `ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "currency" TEXT NOT NULL DEFAULT '$'`,
  `ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "discountRates" TEXT NOT NULL DEFAULT '{"Internet":20,"Electricity":15,"Gas":15}'`,
  `CREATE TABLE IF NOT EXISTS "Connector" ("id" TEXT NOT NULL, "type" TEXT NOT NULL, "name" TEXT NOT NULL, "config" TEXT NOT NULL DEFAULT '{}', "events" TEXT NOT NULL DEFAULT '', "enabled" BOOLEAN NOT NULL DEFAULT true, "lastStatus" TEXT, "lastAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Connector_pkey" PRIMARY KEY ("id"))`,
  `CREATE TABLE IF NOT EXISTS "Adjustment" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "month" TEXT NOT NULL, "amount" DOUBLE PRECISION NOT NULL, "reason" TEXT NOT NULL, "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Adjustment_pkey" PRIMARY KEY ("id"))`,
  `CREATE INDEX IF NOT EXISTS "Adjustment_userId_month_idx" ON "Adjustment"("userId", "month")`,
  `CREATE TABLE IF NOT EXISTS "AgentNote" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "text" TEXT NOT NULL, "byId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AgentNote_pkey" PRIMARY KEY ("id"))`,
  `CREATE INDEX IF NOT EXISTS "AgentNote_userId_idx" ON "AgentNote"("userId")`,
  `ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'login'`,
  `ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "location" TEXT`,
  `ALTER TABLE "Attendance" ADD COLUMN IF NOT EXISTS "autoOut" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "officeLat" DOUBLE PRECISION`,
  `ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "officeLng" DOUBLE PRECISION`,
  `ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "officeRadius" INTEGER NOT NULL DEFAULT 150`,
  `ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "autoClockOut" INTEGER NOT NULL DEFAULT 30`,
  `ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "autoClockIn" BOOLEAN NOT NULL DEFAULT true`,
  `CREATE TABLE IF NOT EXISTS "Contact" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "phone" TEXT, "email" TEXT, "address" TEXT, "city" TEXT, "company" TEXT, "tags" TEXT NOT NULL DEFAULT '', "source" TEXT, "ownerId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Contact_pkey" PRIMARY KEY ("id"))`,
  `CREATE INDEX IF NOT EXISTS "Contact_ownerId_idx" ON "Contact"("ownerId")`,
  `CREATE TABLE IF NOT EXISTS "Deal" ("id" TEXT NOT NULL, "title" TEXT NOT NULL, "contactId" TEXT, "ownerId" TEXT NOT NULL, "stage" TEXT NOT NULL DEFAULT 'lead', "value" DOUBLE PRECISION NOT NULL DEFAULT 0, "service" TEXT, "expectedClose" TIMESTAMP(3), "lostReason" TEXT, "position" DOUBLE PRECISION NOT NULL DEFAULT 0, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "Deal_pkey" PRIMARY KEY ("id"))`,
  `CREATE INDEX IF NOT EXISTS "Deal_ownerId_idx" ON "Deal"("ownerId")`,
  `CREATE INDEX IF NOT EXISTS "Deal_stage_idx" ON "Deal"("stage")`,
  `CREATE TABLE IF NOT EXISTS "Task" ("id" TEXT NOT NULL, "title" TEXT NOT NULL, "type" TEXT NOT NULL DEFAULT 'callback', "dueAt" TIMESTAMP(3), "contactId" TEXT, "dealId" TEXT, "assigneeId" TEXT NOT NULL, "createdById" TEXT NOT NULL, "done" BOOLEAN NOT NULL DEFAULT false, "doneAt" TIMESTAMP(3), "notes" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Task_pkey" PRIMARY KEY ("id"))`,
  `CREATE INDEX IF NOT EXISTS "Task_assigneeId_done_idx" ON "Task"("assigneeId", "done")`,
  `CREATE TABLE IF NOT EXISTS "CrmActivity" ("id" TEXT NOT NULL, "contactId" TEXT, "dealId" TEXT, "userId" TEXT NOT NULL, "kind" TEXT NOT NULL, "text" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "CrmActivity_pkey" PRIMARY KEY ("id"))`,
  `CREATE INDEX IF NOT EXISTS "CrmActivity_contactId_idx" ON "CrmActivity"("contactId")`,
  `CREATE INDEX IF NOT EXISTS "CrmActivity_dealId_idx" ON "CrmActivity"("dealId")`,
  `ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "email" TEXT`,
  `ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "address" TEXT`,
  `ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "zip" TEXT`,
  `ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "orderNumber" TEXT`,
  `ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "discountPct" DOUBLE PRECISION`,
  `ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "billBefore" DOUBLE PRECISION`,
  `ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "billAfter" DOUBLE PRECISION`,
  `ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "nextBillDate" TIMESTAMP(3)`,
  `ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "lines" INTEGER`,
  `ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "overcharged" DOUBLE PRECISION`,
  `ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "device" TEXT`,
  `ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "deviceColor" TEXT`,
  `ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "storage" TEXT`,
  `ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "specs" TEXT`,
  `ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "gift" TEXT`,
  `ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "office" TEXT`,
  `ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "locationCode" TEXT`,
  `ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "closerId" TEXT`,
  `ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "notes" TEXT`,
  `ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "saleType" TEXT`,
  `CREATE INDEX IF NOT EXISTS "Sale_phone_idx" ON "Sale"("phone")`,
  `CREATE INDEX IF NOT EXISTS "Sale_orderNumber_idx" ON "Sale"("orderNumber")`,
  `ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "agentPerms" TEXT NOT NULL DEFAULT '{}'`,
  `CREATE TABLE IF NOT EXISTS "EmailLog" ("id" TEXT NOT NULL, "to" TEXT NOT NULL, "subject" TEXT NOT NULL, "body" TEXT NOT NULL, "status" TEXT NOT NULL, "error" TEXT, "contactId" TEXT, "saleId" TEXT, "sentById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id"))`,
  `CREATE INDEX IF NOT EXISTS "EmailLog_contactId_idx" ON "EmailLog"("contactId")`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'available'`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "statusAt" TIMESTAMP(3)`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "idleSince" TIMESTAMP(3)`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "departmentId" TEXT`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "campaignId" TEXT`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "totpSecret" TEXT`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "totpEnabled" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "lockdown" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "lockdownMsg" TEXT`,
  `ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "require2fa" TEXT NOT NULL DEFAULT 'none'`,
  `ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "campaignId" TEXT`,
  `CREATE TABLE IF NOT EXISTS "Department" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "email" TEXT, "color" TEXT NOT NULL DEFAULT '#ff6b4a', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Department_pkey" PRIMARY KEY ("id"))`,
  `CREATE TABLE IF NOT EXISTS "Campaign" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "color" TEXT NOT NULL DEFAULT '#ffb347', "active" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id"))`,
  `INSERT INTO "Department" ("id","name","email","color") SELECT * FROM (VALUES ('dept-outreach','Outreach',NULL,'#ff6b4a'),('dept-happiness','Customer Happiness',NULL,'#ffb347'),('dept-sales','Sales & Billing',NULL,'#ff2f3a')) v WHERE NOT EXISTS (SELECT 1 FROM "Department")`,
  `INSERT INTO "Campaign" ("id","name","color") SELECT * FROM (VALUES ('camp-budgetease','Budget Ease','#ffb347'),('camp-verizon','Verizon','#ff2f3a'),('camp-att','AT&T','#ff8a4a')) v WHERE NOT EXISTS (SELECT 1 FROM "Campaign")`,
  `ALTER TABLE "CallSession" ADD COLUMN IF NOT EXISTS "summary" TEXT`,
  `ALTER TABLE "CallSession" ADD COLUMN IF NOT EXISTS "mood" TEXT`,
  `ALTER TABLE "CallSession" ADD COLUMN IF NOT EXISTS "confused" TEXT`,
  `ALTER TABLE "CallSession" ADD COLUMN IF NOT EXISTS "confusedNote" TEXT`,
  `ALTER TABLE "CallSession" ADD COLUMN IF NOT EXISTS "endedBy" TEXT`,
  `ALTER TABLE "CallSession" ADD COLUMN IF NOT EXISTS "endedBySource" TEXT`,
  `ALTER TABLE "CallSession" ADD COLUMN IF NOT EXISTS "customerSide" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "padText" TEXT`,
  `ALTER TABLE "CallSession" ADD COLUMN IF NOT EXISTS "agentState" TEXT`,
  `ALTER TABLE "CallSession" ADD COLUMN IF NOT EXISTS "customerState" TEXT`,
  `ALTER TABLE "CallSession" ADD COLUMN IF NOT EXISTS "agentNerv" INTEGER`,
  `ALTER TABLE "CallSession" ADD COLUMN IF NOT EXISTS "custNerv" INTEGER`,
  `ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "monitorNotice" BOOLEAN NOT NULL DEFAULT false`,
  `CREATE TABLE IF NOT EXISTS "ListenRequest" ("id" TEXT NOT NULL, "callSessionId" TEXT NOT NULL, "adminId" TEXT NOT NULL, "agentId" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "endedAt" TIMESTAMP(3), CONSTRAINT "ListenRequest_pkey" PRIMARY KEY ("id"))`,
  `CREATE INDEX IF NOT EXISTS "ListenRequest_agentId_endedAt_idx" ON "ListenRequest"("agentId", "endedAt")`,
  `ALTER TABLE "ListenRequest" ALTER COLUMN "callSessionId" DROP NOT NULL`,
  `ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "shiftEndOut" BOOLEAN NOT NULL DEFAULT true`,
  `ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "shiftEndGrace" INTEGER NOT NULL DEFAULT 0`,
  `CREATE TABLE IF NOT EXISTS "QaReview" ("id" TEXT NOT NULL, "callSessionId" TEXT NOT NULL, "userId" TEXT NOT NULL, "overall" INTEGER NOT NULL, "scores" TEXT NOT NULL, "grammar" TEXT NOT NULL, "nervous" TEXT NOT NULL, "compliance" TEXT NOT NULL, "highlights" TEXT NOT NULL, "fillers" INTEGER NOT NULL DEFAULT 0, "agentWords" INTEGER NOT NULL DEFAULT 0, "customerWords" INTEGER NOT NULL DEFAULT 0, "wpm" INTEGER, "agentNervous" INTEGER, "customerNervous" INTEGER, "sentiment" TEXT, "outcome" TEXT, "summary" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "QaReview_pkey" PRIMARY KEY ("id"))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "QaReview_callSessionId_key" ON "QaReview"("callSessionId")`,
  `CREATE INDEX IF NOT EXISTS "QaReview_userId_createdAt_idx" ON "QaReview"("userId", "createdAt")`,
  `CREATE TABLE IF NOT EXISTS "BeSale" ("id" TEXT NOT NULL, "consumerId" TEXT NOT NULL, "userId" TEXT NOT NULL, "customer" TEXT NOT NULL, "phone" TEXT NOT NULL, "email" TEXT, "ssn4" TEXT NOT NULL, "dob" TEXT NOT NULL, "zip" TEXT NOT NULL, "serviceAddress" TEXT NOT NULL, "company" TEXT NOT NULL, "service" TEXT NOT NULL DEFAULT 'electricity', "billAmount" DOUBLE PRECISION NOT NULL, "payAmount" DOUBLE PRECISION NOT NULL, "notes" TEXT, "status" TEXT NOT NULL DEFAULT 'NEW', "flags" TEXT, "campaignId" TEXT, "audit" TEXT NOT NULL DEFAULT '[]', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "BeSale_pkey" PRIMARY KEY ("id"))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "BeSale_consumerId_key" ON "BeSale"("consumerId")`,
  `CREATE INDEX IF NOT EXISTS "BeSale_userId_createdAt_idx" ON "BeSale"("userId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "BeSale_phone_idx" ON "BeSale"("phone")`,
  `ALTER TABLE "BeSale" ADD COLUMN IF NOT EXISTS "accountNumber" TEXT`,
  `ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "dialer" TEXT NOT NULL DEFAULT '{}'`,
  `ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "aiKnowledge" TEXT NOT NULL DEFAULT '{}'`,
  `ALTER TABLE "CallSession" ADD COLUMN IF NOT EXISTS "live" TEXT`,
  `CREATE TABLE IF NOT EXISTS "ShiftEndRequest" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "shiftDate" TEXT NOT NULL, "reason" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'pending', "codeHash" TEXT, "expiresAt" TIMESTAMP(3), "decidedBy" TEXT, "decidedAt" TIMESTAMP(3), "adminNote" TEXT, "usedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ShiftEndRequest_pkey" PRIMARY KEY ("id"))`,
  `CREATE INDEX IF NOT EXISTS "ShiftEndRequest_userId_createdAt_idx" ON "ShiftEndRequest"("userId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "ShiftEndRequest_status_idx" ON "ShiftEndRequest"("status")`,
  `CREATE TABLE IF NOT EXISTS "RecordingQa" ("id" TEXT NOT NULL, "recId" TEXT NOT NULL, "agentUser" TEXT, "callDate" TEXT, "phone" TEXT, "url" TEXT, "score" INTEGER NOT NULL DEFAULT 0, "checklist" TEXT NOT NULL DEFAULT '{}', "notes" TEXT, "outcome" TEXT, "reviewedBy" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "RecordingQa_pkey" PRIMARY KEY ("id"))`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "ceo" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "secureLine" BOOLEAN NOT NULL DEFAULT false`,
  `ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "creatorName" TEXT NOT NULL DEFAULT 'Balaj'`,
  `ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "switchHash" TEXT`,
  `ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "lookupUrls" TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "lookupProxy" TEXT`,
  `ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "onboardMsg" TEXT`,
  `ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "companyName" TEXT`,
  `ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "quickLinks" TEXT NOT NULL DEFAULT '[]'`,
  `UPDATE "Setting" SET "quickLinks" = '[{"label":"Verizon — Track my order","url":"https://www.verizon.com/digital/nsa/nos/ui/orders/trackmyorder/"}]' WHERE "quickLinks" IS NULL OR "quickLinks" = '[]'`,
  `CREATE TABLE IF NOT EXISTS "PushSub" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "endpoint" TEXT NOT NULL, "p256dh" TEXT NOT NULL, "auth" TEXT NOT NULL, "ua" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "PushSub_pkey" PRIMARY KEY ("id"))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "PushSub_endpoint_key" ON "PushSub"("endpoint")`,
  `CREATE INDEX IF NOT EXISTS "PushSub_userId_idx" ON "PushSub"("userId")`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "contract" TEXT`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "onboardedAt" TIMESTAMP(3)`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "geoInside" BOOLEAN`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "geoAt" TIMESTAMP(3)`,
  `ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPERVISOR'`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "supAccess" TEXT NOT NULL DEFAULT '[]'`,
  `ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SUPERVISOR'`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "supervisorAccess" TEXT NOT NULL DEFAULT '[]'`,
  `CREATE TABLE IF NOT EXISTS "GeoEvent" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "type" TEXT NOT NULL, "distance" INTEGER, "lat" DOUBLE PRECISION, "lng" DOUBLE PRECISION, "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "GeoEvent_pkey" PRIMARY KEY ("id"))`,
  `CREATE INDEX IF NOT EXISTS "GeoEvent_userId_at_idx" ON "GeoEvent"("userId", "at")`,
  `CREATE INDEX IF NOT EXISTS "GeoEvent_at_idx" ON "GeoEvent"("at")`,
  `CREATE TABLE IF NOT EXISTS "VaultMsg" ("id" TEXT NOT NULL, "body" TEXT NOT NULL, "userId" TEXT, "senderName" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "VaultMsg_pkey" PRIMARY KEY ("id"))`,
  `ALTER TABLE "VaultMsg" ADD COLUMN IF NOT EXISTS "userId" TEXT`,
  `ALTER TABLE "VaultMsg" ADD COLUMN IF NOT EXISTS "senderName" TEXT`,
  `CREATE INDEX IF NOT EXISTS "VaultMsg_createdAt_idx" ON "VaultMsg"("createdAt")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "RecordingQa_recId_key" ON "RecordingQa"("recId")`,
  `CREATE INDEX IF NOT EXISTS "RecordingQa_callDate_idx" ON "RecordingQa"("callDate")`,
  fk("ConvMember", "ConvMember_conversationId_fkey", "conversationId", "Conversation"),
  fk("Message", "Message_conversationId_fkey", "conversationId", "Conversation"),
  fk("Huddle", "Huddle_conversationId_fkey", "conversationId", "Conversation"),
  fk("HuddleParticipant", "HuddleParticipant_huddleId_fkey", "huddleId", "Huddle"),
];


// ── Core tables (User, Sale, Attendance, …) — created over HTTPS so no port 5432 is ever needed ──
const ROLE = `DO $$ BEGIN CREATE TYPE "Role" AS ENUM ('ADMIN','AGENT'); EXCEPTION WHEN duplicate_object THEN null; END $$;`;
const CORE = [
  `CREATE TABLE IF NOT EXISTS "User" ("id" TEXT NOT NULL, "agentId" TEXT NOT NULL, "passwordHash" TEXT NOT NULL, "role" "Role" NOT NULL DEFAULT 'AGENT', "name" TEXT NOT NULL, "email" TEXT, "phone" TEXT, "cnic" TEXT, "vicidialUser" TEXT, "baseSalary" DOUBLE PRECISION NOT NULL DEFAULT 0, "shiftStart" TEXT NOT NULL DEFAULT '19:00', "shiftHours" DOUBLE PRECISION NOT NULL DEFAULT 9, "workDays" TEXT NOT NULL DEFAULT '1,2,3,4,5,6', "graceMinutes" INTEGER NOT NULL DEFAULT 0, "active" BOOLEAN NOT NULL DEFAULT true, "lastSeenAt" TIMESTAMP(3), "status" TEXT NOT NULL DEFAULT 'available', "statusAt" TIMESTAMP(3), "idleSince" TIMESTAMP(3), "departmentId" TEXT, "campaignId" TEXT, "totpSecret" TEXT, "totpEnabled" BOOLEAN NOT NULL DEFAULT false, "padText" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "User_pkey" PRIMARY KEY ("id"))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "User_agentId_key" ON "User"("agentId")`,
  `CREATE TABLE IF NOT EXISTS "Attendance" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "shiftDate" TEXT NOT NULL, "clockIn" TIMESTAMP(3) NOT NULL, "clockOut" TIMESTAMP(3), "lateSeconds" INTEGER NOT NULL DEFAULT 0, "deduction" DOUBLE PRECISION NOT NULL DEFAULT 0, "waived" BOOLEAN NOT NULL DEFAULT false, "note" TEXT, "ip" TEXT, "source" TEXT NOT NULL DEFAULT 'login', "location" TEXT, "autoOut" BOOLEAN NOT NULL DEFAULT false, CONSTRAINT "Attendance_pkey" PRIMARY KEY ("id"))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Attendance_userId_shiftDate_key" ON "Attendance"("userId", "shiftDate")`,
  `CREATE TABLE IF NOT EXISTS "Sale" ("id" TEXT NOT NULL, "receipt" TEXT NOT NULL, "userId" TEXT NOT NULL, "raw" TEXT NOT NULL, "summary" TEXT, "amount" DOUBLE PRECISION, "customer" TEXT, "product" TEXT, "flags" TEXT, "ip" TEXT, "phone" TEXT, "email" TEXT, "address" TEXT, "zip" TEXT, "orderNumber" TEXT, "discountPct" DOUBLE PRECISION, "billBefore" DOUBLE PRECISION, "billAfter" DOUBLE PRECISION, "nextBillDate" TIMESTAMP(3), "lines" INTEGER, "overcharged" DOUBLE PRECISION, "device" TEXT, "deviceColor" TEXT, "storage" TEXT, "specs" TEXT, "gift" TEXT, "office" TEXT, "locationCode" TEXT, "closerId" TEXT, "notes" TEXT, "saleType" TEXT, "campaignId" TEXT, "duplicateOf" TEXT, "shiftDate" TEXT NOT NULL DEFAULT '', "status" TEXT NOT NULL DEFAULT 'NEW', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Sale_pkey" PRIMARY KEY ("id"))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Sale_receipt_key" ON "Sale"("receipt")`,
  `CREATE TABLE IF NOT EXISTS "CallSession" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "transcript" TEXT NOT NULL DEFAULT '', "lastTip" TEXT, "tone" TEXT, "summary" TEXT, "mood" TEXT, "confused" TEXT, "confusedNote" TEXT, "endedBy" TEXT, "endedBySource" TEXT, "customerSide" BOOLEAN NOT NULL DEFAULT false, "agentState" TEXT, "customerState" TEXT, "agentNerv" INTEGER, "custNerv" INTEGER, "live" TEXT, "score" INTEGER, "review" TEXT, "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "endedAt" TIMESTAMP(3), CONSTRAINT "CallSession_pkey" PRIMARY KEY ("id"))`,
  `CREATE TABLE IF NOT EXISTS "BreakLog" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "shiftDate" TEXT NOT NULL, "start" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "end" TIMESTAMP(3), CONSTRAINT "BreakLog_pkey" PRIMARY KEY ("id"))`,
  `CREATE TABLE IF NOT EXISTS "Activity" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "shiftDate" TEXT NOT NULL, "kind" TEXT NOT NULL, "start" TIMESTAMP(3) NOT NULL, "end" TIMESTAMP(3) NOT NULL, "seconds" INTEGER NOT NULL, CONSTRAINT "Activity_pkey" PRIMARY KEY ("id"))`,
  `CREATE TABLE IF NOT EXISTS "Setting" ("id" TEXT NOT NULL DEFAULT 'global', "ipLock" BOOLEAN NOT NULL DEFAULT false, "officeIps" TEXT NOT NULL DEFAULT '', "breakAllowance" INTEGER NOT NULL DEFAULT 60, "idleAfter" INTEGER NOT NULL DEFAULT 5, "dailyTarget" INTEGER NOT NULL DEFAULT 3, "bonusPerSale" DOUBLE PRECISION NOT NULL DEFAULT 500, "officeLat" DOUBLE PRECISION, "officeLng" DOUBLE PRECISION, "officeRadius" INTEGER NOT NULL DEFAULT 150, "autoClockOut" INTEGER NOT NULL DEFAULT 30, "autoClockIn" BOOLEAN NOT NULL DEFAULT true, "shiftEndOut" BOOLEAN NOT NULL DEFAULT true, "shiftEndGrace" INTEGER NOT NULL DEFAULT 0, "currency" TEXT NOT NULL DEFAULT '$', "lockdown" BOOLEAN NOT NULL DEFAULT false, "lockdownMsg" TEXT, "monitorNotice" BOOLEAN NOT NULL DEFAULT false, "require2fa" TEXT NOT NULL DEFAULT 'none', "agentPerms" TEXT NOT NULL DEFAULT '{}', "dialer" TEXT NOT NULL DEFAULT '{}', "aiKnowledge" TEXT NOT NULL DEFAULT '{}', "discountRates" TEXT NOT NULL DEFAULT '{"Internet":20,"Electricity":15,"Gas":15}', CONSTRAINT "Setting_pkey" PRIMARY KEY ("id"))`,
];

(async () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing from .env");
  const pool = new Pool({ connectionString: cleanUrl(process.env.DATABASE_URL) });
  for (let i = 1; ; i++) {
    try { await pool.query("SELECT 1"); break; }
    catch (e) { if (i >= 5) throw e; console.log(`Database is waking up, retrying (${i}/4)...`); await new Promise((r) => setTimeout(r, 4000)); }
  }
  await pool.query(ROLE);
  for (const q of CORE) await pool.query(q);
  for (const q of SQL) await pool.query(q);
  console.log("All tables ready.");
  // Ensure Setting row + ADMIN account exist (idempotent)
  await pool.query(`INSERT INTO "Setting" ("id") VALUES ('global') ON CONFLICT ("id") DO NOTHING`);
  const bcrypt = require("bcryptjs");
  const agentId = (process.env.ADMIN_ID || "ADMIN").trim().toUpperCase();
  const pw = (process.env.ADMIN_PASSWORD || "admin123").trim();
  const hash = await bcrypt.hash(pw, 10);
  const id = require("crypto").randomUUID();
  await pool.query(
    `INSERT INTO "User" ("id","agentId","passwordHash","role","name","active") VALUES ($1,$2,$3,'ADMIN','Admin',true)
     ON CONFLICT ("agentId") DO UPDATE SET "passwordHash"=EXCLUDED."passwordHash", "role"='ADMIN', "active"=true`,
    [id, agentId, hash]
  );
  console.log("Admin ready:", agentId);
  // The bootstrap admin is the CEO (the only account that can open the encrypted Secure line).
  await pool.query(`UPDATE "User" SET "ceo"=true WHERE "agentId"=$1`, [agentId]);
  // A always-available demo agent for testing. Login: DEMO / demo1234. 24h shift, every day, so it's
  // never marked late/absent and never auto-clocked-out mid-test. Signing in auto-starts the shift.
  const demoHash = await bcrypt.hash("demo1234", 10);
  await pool.query(
    `INSERT INTO "User" ("id","agentId","passwordHash","role","name","active","shiftStart","shiftHours","workDays","graceMinutes","baseSalary")
     VALUES ($1,'DEMO',$2,'AGENT','Demo Agent',true,'00:00',24,'0,1,2,3,4,5,6',60,50000)
     ON CONFLICT ("agentId") DO UPDATE SET "passwordHash"=EXCLUDED."passwordHash", "role"='AGENT', "active"=true, "shiftStart"='00:00', "shiftHours"=24, "workDays"='0,1,2,3,4,5,6', "graceMinutes"=60`,
    [require("crypto").randomUUID(), demoHash]
  );
  console.log("Demo agent ready: DEMO / demo1234");
  // A ready supervisor login with the recommended access preset. Login: SUP1 / budgetease123.
  const supHash = await bcrypt.hash("budgetease123", 10);
  const supAccess = JSON.stringify(["sales", "quality", "recordings", "attendance", "whereabouts", "breaks", "chat", "reports", "agents"]);
  await pool.query(
    `INSERT INTO "User" ("id","agentId","passwordHash","role","name","active","supAccess")
     VALUES ($1,'SUP1',$2,'SUPERVISOR','Supervisor',true,$3)
     ON CONFLICT ("agentId") DO UPDATE SET "passwordHash"=EXCLUDED."passwordHash", "role"='SUPERVISOR', "active"=true, "supAccess"=EXCLUDED."supAccess"`,
    [require("crypto").randomUUID(), supHash, supAccess]
  );
  console.log("Supervisor ready: SUP1 / budgetease123");
  // Merge the built-in quick-link pack (carriers, bill pay, order & shipment tracking) into whatever's there,
  // de-duping by URL so admin's own links and edits are kept.
  try {
    const pack = require("../lib/quicklinks.json");
    const row = (await pool.query(`SELECT "quickLinks" FROM "Setting" WHERE "id"='global'`)).rows[0];
    let cur = []; try { cur = JSON.parse(row?.quickLinks || "[]"); } catch {}
    if (!Array.isArray(cur)) cur = [];
    const have = new Set(cur.map((x) => (x.url || "").trim()));
    let added = 0;
    for (const l of pack) if (l.url && !have.has(l.url.trim())) { cur.push(l); have.add(l.url.trim()); added++; }
    if (added) { await pool.query(`UPDATE "Setting" SET "quickLinks"=$1 WHERE "id"='global'`, [JSON.stringify(cur)]); console.log(`Quick links: added ${added} built-in links.`); }
  } catch (e) { console.log("Quick-link merge skipped:", e.message); }
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
