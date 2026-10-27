@echo off
setlocal
cd /d "%~dp0"
echo Installing locked backend dependencies...
npm install
if errorlevel 1 (
  echo.
  echo [ERROR] npm install failed. Check internet access and the npm registry.
  exit /b 1
)
echo.
echo Backend dependencies installed and package-lock.json generated.
npm run verify
pause
