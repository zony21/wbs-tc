@echo off
setlocal

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

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$desktop=[Environment]::GetFolderPath('Desktop'); $appDir=$env:WBS_TC_DIR.TrimEnd([char]92); $launcher=Join-Path $appDir 'start-app.bat'; $shell=New-Object -ComObject WScript.Shell; $shortcut=$shell.CreateShortcut((Join-Path $desktop 'WBS TC.lnk')); $shortcut.TargetPath=$launcher; $shortcut.WorkingDirectory=$appDir; $shortcut.Description='Launch WBS TC'; $shortcut.Save(); Write-Host ('Created: ' + (Join-Path $desktop 'WBS TC.lnk'))"

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
