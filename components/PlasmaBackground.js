"use client";
// Full-screen plasma behind every page in the Royal look (wine red). Minimal look = no effects at all.
// Falls back to the CSS aurora if the computer can't run WebGL2 or the graphics driver drops the context.
import { useState } from "react";
import { usePathname } from "next/navigation";
import Plasma from "./Plasma";
import Aurora from "./Aurora";
import { useLook } from "./Appearance";

export const WINE = "#9b1b3a";

export default function PlasmaBackground() {
  const path = usePathname() || "";
  const [failed, setFailed] = useState(false);
  const { appearance, look } = useLook();
  if (look === "minimal") return <div className="plasma-bg minimal-bg" aria-hidden="true" />;
  const kiosk = path.startsWith("/kiosk");
  if (failed) return <Aurora />;
  return (
    <div className="plasma-bg" aria-hidden="true">
      <Plasma color={appearance === "light" ? "#b8324f" : WINE} speed={0.6} direction="forward" scale={1.1}
        opacity={appearance === "light" ? 0.45 : kiosk ? 0.9 : 0.8} mouseInteractive onFail={() => setFailed(true)} />
      <div className="plasma-veil" />
    </div>
  );
}
