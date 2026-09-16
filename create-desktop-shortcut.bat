@echo off
setlocal
cd /d "%~dp0"

set "WBS_TC_DIR=%~dp0"
set "WBS_TC_LAUNCHER=%~dp0start-app.bat"

if not exist "%WBS_TC_LAUNCHER%" (
  echo [ERROR] start-app.bat was not found.
  pause
  exit /b 1
)

echo ======================================
echo   WBS TC desktop shortcut setup
echo ======================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$desktop=[Environment]::GetFolderPath('Desktop');" ^
  "$shell=New-Object -ComObject WScript.Shell;" ^
  "$shortcut=$shell.CreateShortcut((Join-Path $desktop 'WBS TC.lnk'));" ^
  "$shortcut.TargetPath=$env:WBS_TC_LAUNCHER;" ^
  "$shortcut.WorkingDirectory=$env:WBS_TC_DIR;" ^
  "$shortcut.Description='Launch WBS TC';" ^
  "$shortcut.Save();" ^
  "Write-Host ('Created: ' + (Join-Path $desktop 'WBS TC.lnk'))"

if errorlevel 1 (
  echo.
  echo [ERROR] Failed to create the desktop shortcut.
  pause
  exit /b 1
)

echo.
echo [OK] Desktop shortcut "WBS TC" was created.
echo You can launch the app from that shortcut next time.
pause
endlocal
