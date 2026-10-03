"use client";
// Live US time-zone clocks for the sign-in page. Each zone shows its local time and whether
// it is inside the normal calling window (8 AM – 9 PM local, the usual TCPA-safe hours).
import { useEffect, useState } from "react";

export const US_ZONES = [
  { tz: "America/New_York", label: "Eastern", short: "ET" },
  { tz: "America/Chicago", label: "Central", short: "CT" },
  { tz: "America/Denver", label: "Mountain", short: "MT" },
  { tz: "America/Phoenix", label: "Arizona", short: "AZ" },
  { tz: "America/Los_Angeles", label: "Pacific", short: "PT" },
  { tz: "America/Anchorage", label: "Alaska", short: "AKT" },
  { tz: "Pacific/Honolulu", label: "Hawaii", short: "HT" },
];

const hourIn = (tz, d) => Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(d));
export const canCall = (tz, d = new Date()) => { const h = hourIn(tz, d); return h >= 8 && h < 21; };

export default function UsClocks({ compact = false }) {
  const [now, setNow] = useState(null);
  useEffect(() => { setNow(new Date()); const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const zones = compact ? US_ZONES.filter((z) => ["ET", "CT", "MT", "PT"].includes(z.short)) : US_ZONES;
  return (
    <section className={"us-clocks" + (compact ? " compact" : "")} aria-label="US time zones">
      {zones.map((z) => {
        const time = now ? now.toLocaleTimeString("en-US", { timeZone: z.tz, hour: "numeric", minute: "2-digit" }) : "--:--";
        const day = now ? now.toLocaleDateString("en-US", { timeZone: z.tz, weekday: "short" }) : "";
        const ok = now ? canCall(z.tz, now) : false;
        return (
          <div key={z.tz} className={"usc" + (ok ? " ok" : " off")} title={ok ? "Inside calling hours (8 AM – 9 PM)" : "Outside calling hours"}>
            <span className="usc-z">{z.label} <em>{z.short}</em></span>
            <b className="usc-t num">{time}</b>
            <span className="usc-s"><i aria-hidden="true" />{ok ? "OK to call" : "Quiet hours"} · {day}</span>
          </div>
        );
      })}
    </section>
  );
}
