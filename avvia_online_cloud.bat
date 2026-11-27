@echo off
chcp 65001 > nul
title Avvio Online Gestionale Agenti (Cloudflare Tunnel)
cd /d "%~dp0"
powershell.exe -ExecutionPolicy Bypass -NoProfile -File "%~dp0avvia_online_cloud.ps1"
echo.
pause
