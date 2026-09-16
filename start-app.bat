@echo off
setlocal
cd /d "%~dp0"

echo ======================================
echo   WBS TC launcher
echo ======================================

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js was not found.
  echo Please install Node.js and try again.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [INFO] Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

echo [INFO] Starting WBS TC...
start "WBS TC Server" cmd /k "cd /d \"%~dp0\" && npm run dev"

timeout /t 3 /nobreak >nul
start "" "http://localhost:5173"

echo [INFO] WBS TC started.
echo Close the "WBS TC Server" window to stop the app.
endlocal
