// Builds a clean, professional employment contract filled with an agent's real details.
// Plain text with clear sections (the agent's contract view renders it line by line).
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const money = (n, cur = "Rs") => `${cur} ${Number(n || 0).toLocaleString("en-PK")}`;

function daysList(workDays) {
  const set = String(workDays || "").split(",").map((x) => x.trim()).filter((x) => x !== "").map(Number);
  if (!set.length) return "as scheduled";
  const names = set.sort((a, b) => a - b).map((d) => DAYS[d]).filter(Boolean);
  return names.join(", ");
}
function endTime(start, hours) {
  if (!start || !/^\d{1,2}:\d{2}$/.test(start)) return "";
  const [h, m] = start.split(":").map(Number);
  const t = new Date(2000, 0, 1, h, m); t.setMinutes(t.getMinutes() + Math.round((hours || 9) * 60));
  return t.toTimeString().slice(0, 5);
}

export function buildContract(agent = {}, opts = {}) {
  const company = (opts.companyName || "the Company").trim();
  const cur = opts.currency || "Rs";
  const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const name = agent.name || "the Employee";
  const id = agent.agentId ? ` (Employee ID: ${agent.agentId})` : "";
  const role = opts.departmentName ? `${opts.departmentName} Agent` : "Call Center Agent";
  const campaign = opts.campaignName ? ` on the ${opts.campaignName} campaign` : "";
  const shiftStart = agent.shiftStart || "19:00";
  const shiftEnd = endTime(shiftStart, agent.shiftHours);
  const hours = agent.shiftHours || 9;
  const salary = money(agent.baseSalary, cur);
  const bonus = opts.bonusPerSale ? `${money(opts.bonusPerSale, cur)} per verified sale above the daily target${opts.dailyTarget ? ` of ${opts.dailyTarget}` : ""}` : "as per the current incentive plan";

  return [
`EMPLOYMENT AGREEMENT`,
``,
`This Employment Agreement ("Agreement") is made on ${today} between ${company} ("the Company") and ${name}${id} ("the Employee").`,
``,
`1. POSITION`,
`The Employee is engaged as a ${role}${campaign}. The Employee shall perform the duties reasonably assigned by the Company, including handling calls, following approved scripts, recording accurate information, and meeting quality and compliance standards.`,
``,
`2. WORKING HOURS`,
`Regular shift: ${shiftStart}${shiftEnd ? ` to ${shiftEnd}` : ""} (${hours} hours), on ${daysList(agent.workDays)}. The Employee is expected to be signed in and ready at the start of each shift. Attendance is recorded from the moment of sign-in.`,
``,
`3. COMPENSATION`,
`Base salary: ${salary} per month, paid monthly. Performance incentive: ${bonus}. Salary is subject to lawful deductions described below and any statutory withholdings.`,
``,
`4. ATTENDANCE, LATENESS & DEDUCTIONS`,
`Punctuality is essential. Late arrival and unapproved absence are deducted on a pro-rata basis from salary. Break time taken beyond the allowed daily allowance is likewise deducted. Repeated lateness or absence may lead to disciplinary action.`,
``,
`5. BREAKS`,
`The Employee is entitled to the daily break allowance set by the Company. Breaks must be logged in the system.`,
``,
`6. CONDUCT & COMPLIANCE`,
`The Employee shall act honestly and professionally, follow all campaign scripts and required disclosures (including that calls may be recorded), and comply with all applicable laws and the Company's policies. Misrepresentation to customers is strictly prohibited.`,
``,
`7. CONFIDENTIALITY & DATA PROTECTION`,
`The Employee shall keep confidential all customer data, scripts, pricing, systems, and business information, during and after employment, and shall not copy, share, or remove any data except as required to perform their duties. Customer information must be handled only within Company systems.`,
``,
`8. COMPANY PROPERTY & SYSTEMS`,
`Access credentials and systems provided to the Employee are for Company business only and must not be shared. The Employee is responsible for activity under their account.`,
``,
`9. PROBATION`,
`The first three (3) months are a probationary period, during which either party may end the employment with short notice.`,
``,
`10. TERMINATION`,
`After probation, either party may terminate this Agreement with one (1) month's written notice, or payment in lieu. The Company may terminate without notice for gross misconduct, fraud, breach of confidentiality, or serious policy violation.`,
``,
`11. ACCEPTANCE`,
`By signing below (or by accepting this Agreement within the Company's system), the Employee confirms they have read, understood, and agreed to these terms.`,
``,
``,
`Employee: ${name}${id}`,
`Signature: ____________________    Date: ____________`,
``,
`For ${company}`,
`Signature: ____________________    Date: ____________`,
  ].join("\n");
}
