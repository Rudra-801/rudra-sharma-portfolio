@echo off
setlocal
cd /d "%~dp0"
title NEXZO AI - Start Here
if not exist "Backend\local-ai-server.mjs" (
  echo.
  echo [ERROR] Backend folder was not found beside this file.
  echo Extract the ZIP completely, then run START_HERE.cmd from the extracted folder.
  echo Do not run npm install from the parent Desktop folder.
  echo.
  pause
  exit /b 1
)
call "%~dp0START_NEXZO_AI.cmd"
