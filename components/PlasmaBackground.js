"use client";
// Full-screen plasma behind every page in the Vivid look, in the current palette colour. Minimal look = no effects at all.
// Falls back to the CSS aurora if the computer can't run WebGL2 or the graphics driver drops the context.
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Plasma from "./Plasma";
import Aurora from "./Aurora";
import { useLook } from "./Appearance";


export default function PlasmaBackground() {
  const path = usePathname() || "";
  const [failed, setFailed] = useState(false);
  const { appearance, look, palette } = useLook();
  const [color, setColor] = useState("#8b5cf6");
  // The plasma takes the current palette's colour (CSS --plasma), so it always matches the rest of Modo.
  useEffect(() => { const v = getComputedStyle(document.documentElement).getPropertyValue("--plasma").trim(); if (v) setColor(v); }, [palette]);
  if (look === "minimal") return <div className="plasma-bg minimal-bg" aria-hidden="true" />;
  const kiosk = path.startsWith("/kiosk");
  if (failed) return <Aurora />;
  return (
    <div className="plasma-bg" aria-hidden="true">
      <Plasma color={color} speed={0.6} direction="forward" scale={1.1}
        opacity={appearance === "light" ? 0.45 : kiosk ? 0.9 : 0.8} mouseInteractive onFail={() => setFailed(true)} />
      <div className="plasma-veil" />
    </div>
  );
}
