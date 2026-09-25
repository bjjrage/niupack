@echo off
cd /d "%~dp0"
title NIU INTELLIGENCE OS - Local Server
color 0c

node start.mjs

if %errorlevel% neq 0 (
    echo.
    echo ===================================================
    echo  Hubo un inconveniente al ejecutar con Node.js.
    echo  Intentando iniciar directamente con npm run dev...
    echo ===================================================
    echo.
    start http://localhost:3000
    call npm run dev
)

pause
