"use client";
// Reports the agent's location every couple of minutes while Modo is open, so admins see
// when they leave and return to the office. Silent — asks for location permission once.
import { useEffect } from "react";

export default function GeoReporter() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    let stop = false;
    const report = () => navigator.geolocation.getCurrentPosition(
      (p) => { if (stop) return; fetch("/api/geo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }) }).catch(() => {}); },
      () => {},
      { enableHighAccuracy: false, maximumAge: 60000, timeout: 15000 }
    );
    report();
    const t = setInterval(report, 120000);
    return () => { stop = true; clearInterval(t); };
  }, []);
  return null;
}
