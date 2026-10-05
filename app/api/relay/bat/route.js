import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { viciConnector, ensureRelayKey } from "@/lib/relay";

// Admin downloads "Modo Relay.bat" with this Modo's address and relay key built in.
export async function GET(req) {
  const { error } = await requireRole("ADMIN");
  if (error) return error;
  const conn = await viciConnector();
  if (!conn) return NextResponse.json({ error: "Save the VICIdial connection first." }, { status: 400 });
  const key = await ensureRelayKey(conn);
  const modo = new URL(req.url).origin;
  const bat = [
    "@echo off",
    "title Modo Relay - keep this window open",
    'set "DIR=%LOCALAPPDATA%\\ModoRelay"',
    'if not exist "%DIR%" mkdir "%DIR%"',
    "where node >nul 2>nul",
    "if errorlevel 1 (",
    "  echo Node.js is needed for Modo Relay. Opening the download page...",
    "  echo Install the LTS version, then double-click this file again.",
    "  start https://nodejs.org/en/download",
    "  pause",
    "  exit /b",
    ")",
    "echo Getting the latest Modo Relay...",
    `powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -UseBasicParsing '${modo}/downloads/modo-relay.js' -OutFile \\"$env:LOCALAPPDATA\\ModoRelay\\modo-relay.js\\" } catch { Write-Host 'Download failed, using the saved copy.' }"`,
    ":loop",
    `node "%DIR%\\modo-relay.js" ${modo} ${key}`,
    "echo Relay stopped. Restarting in 5 seconds...",
    "timeout /t 5 >nul",
    "goto loop",
    "",
  ].join("\r\n");
  return new NextResponse(bat, { headers: { "content-type": "application/octet-stream", "content-disposition": 'attachment; filename="Modo Relay.bat"', "cache-control": "no-store" } });
}
