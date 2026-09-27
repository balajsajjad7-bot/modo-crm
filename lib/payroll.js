// All salary math lives here so admin and agent screens always agree.
const OFFSET = () => Number(process.env.TZ_OFFSET_MIN ?? 300) * 60000;
export const WORKING_DAYS_PER_MONTH = 26;

export function rates(user) {
  const perDay = user.baseSalary / WORKING_DAYS_PER_MONTH;
  const perHour = perDay / (user.shiftHours || 1);
  const perSecond = perHour / 3600;
  return { perDay, perHour, perSecond };
}

const localParts = (d) => {
  const t = new Date(new Date(d).getTime() + OFFSET());
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), day: t.getUTCDate(), dow: t.getUTCDay() };
};
const ymd = (y, m, d) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);
function localToUtc(y, m, d, hhmm) {
  const [h, min] = hhmm.split(":").map(Number);
  return new Date(Date.UTC(y, m, d, h, min) - OFFSET());
}

// Which shift a moment belongs to (night shifts crossing midnight count for the day they started).
export function resolveShift(user, at = new Date()) {
  const p = localParts(at);
  const lenMs = (user.shiftHours || 9) * 3600000;
  for (const back of [0, 1]) {
    const base = new Date(Date.UTC(p.y, p.m, p.day - back));
    const y = base.getUTCFullYear(), m = base.getUTCMonth(), d = base.getUTCDate();
    const start = localToUtc(y, m, d, user.shiftStart);
    const diff = at - start;
    if (diff >= -4 * 3600000 && diff <= lenMs) return { shiftDate: ymd(y, m, d), start, dow: base.getUTCDay() };
  }
  return { shiftDate: ymd(p.y, p.m, p.day), start: localToUtc(p.y, p.m, p.day, user.shiftStart), dow: p.dow };
}

// Start and end (UTC instants) of the shift that began on shiftDate (YYYY-MM-DD, local date)
export function shiftBounds(user, shiftDate) {
  const [y, m, d] = shiftDate.split("-").map(Number);
  const start = localToUtc(y, m - 1, d, user.shiftStart);
  return { start, end: new Date(start.getTime() + (user.shiftHours || 9) * 3600000) };
}

export function lateness(user, clockIn) {
  const { start, shiftDate } = resolveShift(user, clockIn);
  const lateMs = clockIn - start - (user.graceMinutes || 0) * 60000;
  const lateSeconds = lateMs > 0 ? Math.floor((clockIn - start) / 1000) : 0;
  return { shiftDate, lateSeconds, deduction: +(lateSeconds * rates(user).perSecond).toFixed(2) };
}

export const breakSeconds = (b, now = new Date()) => Math.floor(((b.end ? new Date(b.end) : now) - new Date(b.start)) / 1000);

// Monthly payslip. month = "YYYY-MM". Today's shift is excluded until it's over.
// extra: { breaks, activity, sales, settings }
export function payslip(user, attendance, month, now = new Date(), extra = {}) {
  const { breaks = [], activity = [], sales = [], settings = {}, adjustments = [] } = extra;
  const allowance = (settings.breakAllowance ?? 60) * 60;
  const target = settings.dailyTarget ?? 0, bonusPer = settings.bonusPerSale ?? 0;
  const [Y, M] = month.split("-").map(Number);
  const workDays = new Set(user.workDays.split(",").map(Number));
  const byDate = new Map(attendance.map((a) => [a.shiftDate, a]));
  const sum = (list, key, val) => list.reduce((m, x) => m.set(x[key], (m.get(x[key]) || 0) + val(x)), new Map());
  const breakBy = sum(breaks, "shiftDate", (b) => breakSeconds(b, now));
  const idleBy = sum(activity, "shiftDate", (a) => a.seconds);
  const verifiedBy = sum(sales.filter((s) => s.status === "VERIFIED"), "shiftDate", () => 1);
  const todayStr = resolveShift(user, now).shiftDate;
  const cp = localParts(user.createdAt); const created = ymd(cp.y, cp.m, cp.day);
  const r = rates(user);
  let present = 0, absent = 0, lateSeconds = 0, lateDeduction = 0, breakOverSeconds = 0, idleSeconds = 0, verified = 0, bonus = 0;
  const absentDates = [];
  const daysInMonth = new Date(Date.UTC(Y, M, 0)).getUTCDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const date = ymd(Y, M - 1, d);
    if (date >= todayStr || date < created) continue;
    const dow = new Date(Date.UTC(Y, M - 1, d)).getUTCDay();
    const a = byDate.get(date);
    if (a) {
      present++;
      if (!a.waived) { lateSeconds += a.lateSeconds; lateDeduction += a.deduction; }
      breakOverSeconds += Math.max(0, (breakBy.get(date) || 0) - allowance);
      idleSeconds += idleBy.get(date) || 0;
      const v = verifiedBy.get(date) || 0; verified += v;
      bonus += Math.max(0, v - target) * bonusPer;
    } else if (workDays.has(dow)) { absent++; absentDates.push(date); }
  }
  const absentDeduction = +(absent * r.perDay).toFixed(2);
  const breakDeduction = +(breakOverSeconds * r.perSecond).toFixed(2);
  lateDeduction = +lateDeduction.toFixed(2);
  const adjust = +adjustments.reduce((t, a) => t + a.amount, 0).toFixed(2);
  const net = +Math.max(0, user.baseSalary - absentDeduction - lateDeduction - breakDeduction + bonus + adjust).toFixed(2);
  return { month, base: user.baseSalary, present, absent, absentDates, lateSeconds, lateDeduction, absentDeduction,
    breakOverSeconds, breakDeduction, idleSeconds, verified, bonus, adjust, adjustments, net, rates: r };
}
