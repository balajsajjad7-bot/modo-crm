@echo off
title CRM Modo
cd /d "%~dp0"
echo Starting CRM Modo... keep this window open while you use it.
start "" http://localhost:3000
call npm run dev
pause
