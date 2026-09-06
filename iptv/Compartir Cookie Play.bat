@echo off
rem Doble clic para abrir Cookie Play y crear un enlace https que funciona
rem desde cualquier movil, sin cuentas y sin coste.
title Cookie Play
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
echo   Cookie Play - creando tu enlace...
node iniciar.mjs --publico %*
pause
