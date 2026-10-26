// Safe-to-call hours: federal TCPA (8am–9pm customer local time) plus states with stricter rules.
// Hours are [start, end) in 24h. null = no calls that day. "hol" = no calls on (federal) holidays.
// Source summary: state telemarketing-hours tables (ClickPoint, Oct 2026). Not legal advice — keep your
// compliance team's list as the final word.
const FED = { wk: [8, 21], sat: [8, 21], sun: [8, 21] };
export const STATE_RULES = {
  AL: { wk: [8, 20], sat: [8, 20], sun: null, hol: true },
  CT: { wk: [9, 20], sat: [9, 20], sun: [9, 20] },
  FL: { wk: [8, 20], sat: [8, 20], sun: [8, 20] },
  IL: { wk: [9, 21], sat: [9, 21], sun: [9, 21] },
  KY: { wk: [10, 21], sat: [10, 21], sun: [10, 21] },
  LA: { wk: [8, 20], sat: [8, 20], sun: null, hol: true },
  MD: { wk: [8, 20], sat: [8, 20], sun: [8, 20] },
  MA: { wk: [8, 20], sat: [8, 20], sun: [8, 20] },
  MI: { wk: [9, 21], sat: [9, 21], sun: [9, 21] },
  MN: { wk: [9, 21], sat: [9, 21], sun: [9, 21] },
  MS: { wk: [8, 20], sat: [8, 20], sun: null, hol: true },
  NV: { wk: [9, 20], sat: [9, 20], sun: [9, 20] },
  NM: { wk: [9, 21], sat: [9, 21], sun: [9, 21] },
  OK: { wk: [8, 20], sat: [8, 20], sun: [8, 20] },
  PA: { wk: [9, 19], sat: [9, 19], sun: null, hol: true },
  RI: { wk: [9, 18], sat: [10, 17], sun: null, hol: true },
  SD: { wk: [9, 21], sat: [9, 21], sun: null },
  TX: { wk: [9, 21], sat: [9, 21], sun: [12, 21] },
  UT: { wk: [8, 21], sat: [8, 21], sun: null, hol: true },
  WY: { wk: [8, 20], sat: [8, 20], sun: [8, 20] },
};

function federalHolidays(y) {
  const nth = (m, wd, n) => { const d = new Date(Date.UTC(y, m, 1)); return Date.UTC(y, m, 1 + ((wd - d.getUTCDay() + 7) % 7) + (n - 1) * 7); };
  const last = (m, wd) => { const d = new Date(Date.UTC(y, m + 1, 0)); return Date.UTC(y, m, d.getUTCDate() - ((d.getUTCDay() - wd + 7) % 7)); };
  return [Date.UTC(y, 0, 1), nth(0, 1, 3), nth(1, 1, 3), last(4, 1), Date.UTC(y, 6, 4), nth(8, 1, 1), nth(9, 1, 2), Date.UTC(y, 10, 11), nth(10, 4, 4), Date.UTC(y, 11, 25)];
}
const h12 = (h) => (h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`);
const span = (w) => (w ? `${h12(w[0])}–${h12(w[1])}` : "no calls");

// state = 2-letter code, iana = time zone. Returns everything an agent needs before dialing.
export function callWindow(state, iana, now = new Date()) {
  if (!iana) return null;
  const rule = STATE_RULES[state] || FED;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: iana, year: "numeric", month: "numeric", day: "numeric", weekday: "short", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(now).map((p) => [p.type, p.value]));
  const y = +parts.year, m = +parts.month - 1, d = +parts.day, hr = +parts.hour, min = +parts.minute;
  const wd = parts.weekday; // Mon..Sun
  const holiday = rule.hol && federalHolidays(y).includes(Date.UTC(y, m, d));
  const today = holiday ? null : wd === "Sun" ? rule.sun : wd === "Sat" ? rule.sat : rule.wk;
  const t = hr + min / 60;
  const allowed = !!today && t >= today[0] && t < today[1];
  let note = "";
  if (holiday) note = "State bans telemarketing calls on holidays — today is one";
  else if (!today) note = `No telemarketing calls on ${wd === "Sun" ? "Sundays" : "this day"} in this state`;
  else if (t < today[0]) note = `Opens at ${h12(today[0])} their time (${Math.round((today[0] - t) * 60)} min)`;
  else if (t >= today[1]) note = `Closed for today — ${h12(today[1])} cut-off has passed`;
  else note = `${Math.max(0, Math.round((today[1] - t) * 60))} min left before the ${h12(today[1])} cut-off`;
  const local = now.toLocaleString("en-US", { timeZone: iana, weekday: "short", hour: "numeric", minute: "2-digit" });
  return {
    allowed, local, note, stricter: !!STATE_RULES[state],
    today: span(today), weekdays: span(rule.wk), saturday: span(rule.sat), sunday: span(rule.sun), holidays: rule.hol ? "no calls" : "normal hours",
  };
}
