@echo off
chcp 65001 >nul
setlocal

cd /d "%~dp0"
title Shanhuai Local UI - http://localhost:8073

echo ============================================================
echo   Shanhuai Local UI
echo   URL: http://localhost:8073
echo   API: http://localhost:8080
echo ============================================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found. Install Node.js 24 or newer.
  goto :failed
)

where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm.cmd was not found.
  goto :failed
)

docker inspect shanhuai-report-local-ui-1 >nul 2>nul
if not errorlevel 1 (
  echo [INFO] Stopping the old local UI container on port 8073...
  docker stop shanhuai-report-local-ui-1 >nul
  if errorlevel 1 goto :failed
)

set "VITE_API_URL=http://localhost:8080"
cd /d "%~dp0ui"

if not exist "node_modules\.bin\vite.cmd" (
  echo [INFO] Installing frontend dependencies for the first run...
  call npm.cmd install
  if errorlevel 1 goto :failed
)

echo [START] Starting Vite from the current source. Press Ctrl+C to stop.
echo.
call npm.cmd run dev -- --host 0.0.0.0 --port 8073
if errorlevel 1 goto :failed
goto :end

:failed
echo.
echo [FAILED] The UI did not start. Review the log above.
pause
exit /b 1

:end
echo.
echo [STOPPED] The UI process has stopped.
pause
