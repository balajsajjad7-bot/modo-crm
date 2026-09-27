"use client";
// Full-screen plasma behind every page, the same orange everywhere.
// Falls back to the CSS aurora if the computer can't run WebGL2.
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Plasma from "./Plasma";
import Aurora from "./Aurora";

export default function PlasmaBackground() {
  const path = usePathname() || "";
  const [failed, setFailed] = useState(false);
  const [look, setLook] = useState("dark");
  useEffect(() => {
    const read = () => setLook(document.documentElement.dataset.appearance || "dark");
    read(); window.addEventListener("modo-appearance", read); return () => window.removeEventListener("modo-appearance", read);
  }, []);
  const kiosk = path.startsWith("/kiosk");
  if (failed) return <Aurora />;
  return (
    <div className="plasma-bg" aria-hidden="true">
      <Plasma color="#ff6b35" speed={0.6} direction="forward" scale={1.1} opacity={look === "light" ? 0.5 : kiosk ? 0.9 : 0.8} mouseInteractive onFail={() => setFailed(true)} />
      <div className="plasma-veil" />
    </div>
  );
}
