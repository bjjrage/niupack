@echo off
setlocal
chcp 65001 >nul
title NIUPACK - Estudio de vasos 3D
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Instala Node.js 22.12 o superior para abrir este prototipo.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm.cmd ci --no-fund --no-audit
  if errorlevel 1 (
    pause
    exit /b 1
  )
)
call npm.cmd run build
if errorlevel 1 (
  pause
  exit /b 1
)
start "" "http://127.0.0.1:4173/demo/vaso-3d/"
node serve.mjs
pause
