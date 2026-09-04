@echo off
rem Doble clic en este archivo para abrir Mi IPTV.
title Mi IPTV
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Falta Node.js, que es lo único que necesita esta app.
  echo   Descárgalo ^(versión LTS^) en https://nodejs.org y vuelve a hacer doble clic aquí.
  echo.
  pause
  exit /b 1
)

echo.
echo   Mi IPTV - arrancando...
node iniciar.mjs %*
pause
