@echo off
setlocal
cd /d "%~dp0"

where powershell >nul 2>nul
if not errorlevel 1 (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-local.ps1"
  if not errorlevel 1 exit /b 0
)

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [ZgEdit] 本地服务启动失败，且未检测到 Node.js 作为备用方案。
  echo [ZgEdit] 可安装 Node.js LTS 后再次双击启动: https://nodejs.org/
  echo.
  pause
  exit /b 1
)

node scripts\start-local.js
pause
