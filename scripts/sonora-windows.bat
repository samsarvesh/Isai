@echo off
title SONORA - Personal AI Music Ecosystem
echo Starting SONORA locally on http://localhost:3000 ...
where node >nul 2>nul
if %errorlevel% neq 0 (
  echo Node.js is required. Download LTS from https://nodejs.org/
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing dependencies...
  call npm install
)
start "" "http://localhost:3000"
call npm run dev
