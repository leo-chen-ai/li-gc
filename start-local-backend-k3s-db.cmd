@echo off
chcp 65001 >nul
setlocal

cd /d "%~dp0"
title Shanhuai Local API - K3s DB - http://localhost:8080

echo ============================================================
echo   Shanhuai Local API
echo   URL: http://localhost:8080
echo   Data: K3s PostgreSQL / Redis / MQTT over SSH
echo   Safety: background workers are disabled locally
echo   SQL: SQLx query logs are enabled
echo ============================================================
echo.

where cargo >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Rust cargo was not found.
  goto :failed
)

if not exist "%~dp0.env.deploy" (
  echo [ERROR] .env.deploy is missing from the project root.
  goto :failed
)

if not exist "%~dp0api\.env" (
  echo [ERROR] api\.env is missing.
  goto :failed
)

if not exist "%USERPROFILE%\.ssh\shanhuai_k3s_deploy_ed25519" (
  echo [ERROR] SSH key is missing: %USERPROFILE%\.ssh\shanhuai_k3s_deploy_ed25519
  echo         Run deploy\k3s\setup-local-ssh.sh first.
  goto :failed
)

set "BASH_EXE=%LOCALAPPDATA%\Programs\GrowthClawTools\Git\bin\bash.exe"
if not exist "%BASH_EXE%" set "BASH_EXE=C:\Program Files\Git\bin\bash.exe"
if not exist "%BASH_EXE%" (
  echo [ERROR] Git Bash was not found.
  echo         Install Git for Windows or check the bundled GrowthClawTools Git.
  goto :failed
)

docker inspect shanhuai-report-local-shanhuai-api-1 >nul 2>nul
if not errorlevel 1 (
  echo [INFO] Stopping the old local API container on port 8080...
  docker stop shanhuai-report-local-shanhuai-api-1 >nul
  if errorlevel 1 goto :failed
)

set "BACKGROUND_WORKERS_ENABLED=false"
set "LOCAL_SQL_LOGGING=true"
set "SERVER_PORT=8080"
set "LOCAL_TEST_DB_PORT=25432"
set "LOCAL_TEST_REDIS_PORT=26379"
set "LOCAL_TEST_MQTT_PORT=21883"

echo [START] Opening SSH tunnels and loading K3s secrets...
echo [START] API request and error logs stay visible. Press Ctrl+C to stop.
echo.
"%BASH_EXE%" deploy/k3s/run-local-api-with-test-env.sh
if errorlevel 1 goto :failed
goto :end

:failed
echo.
echo [FAILED] The API did not start. Review the log above.
pause
exit /b 1

:end
echo.
echo [STOPPED] The API and its SSH tunnels have stopped.
pause
