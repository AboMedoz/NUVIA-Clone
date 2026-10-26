@echo off
setlocal
cd /d "%~dp0"
if /i "%~1"=="--help" goto help

echo NUVIA full startup: web, API, mail worker and AI.
echo Keep this window open. Ctrl+C stops this development group.
echo.
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.13 or newer is required.
  goto missing
)
node -e "const [major,minor]=process.versions.node.split('.').map(Number);process.exit(major>22||major===22&&minor>=13?0:1)"
if errorlevel 1 (
  echo Node.js 22.13 or newer is required.
  goto missing
)
where pnpm >nul 2>nul
if errorlevel 1 (
  echo Install pnpm first: npm install --global pnpm@11.25.0
  goto missing
)
where uv >nul 2>nul
if errorlevel 1 (
  echo Install uv 0.12.15 first. See README.md for the Python setup.
  goto missing
)

echo [1/6] Installing JavaScript dependencies from the lockfile...
call pnpm install --frozen-lockfile
if errorlevel 1 goto failed
echo [2/6] Preparing local settings without replacing existing configuration...
call pnpm setup:local
if errorlevel 1 goto failed
echo [3/6] Preparing the locked Python environment...
uv sync --project apps/ai-service --locked
if errorlevel 1 goto failed
echo [4/6] Preparing private AI settings without downloading trained models...
call pnpm setup:models
if errorlevel 1 goto failed
echo [5/6] Checking the configured MongoDB connection...
call pnpm db:check
if errorlevel 1 (
  echo Check your private MongoDB URI and network access. See README.md.
  goto failed
)
echo [6/6] Starting all services...
echo The launcher will report readiness at http://127.0.0.1:5173/
call pnpm dev:full
if errorlevel 1 goto failed
exit /b 0

:missing
pause
exit /b 1
:failed
echo.
echo NUVIA stopped or could not start. Check the message above.
echo Existing settings and database selection have been preserved.
pause
exit /b 1
:help
echo Double-click START-FULL.cmd to prepare dependencies and start web/API/mail/AI.
echo Requires Node.js 22.13+, pnpm 11.25.0, uv 0.12.15 and usable MongoDB settings.
echo Dependencies may need Internet access. No trained models are downloaded.
echo Existing .env, keys and database selection are preserved.
echo The configured MongoDB must support transactions: Atlas or a replica set.
echo Ctrl+C stops the owned service group. Other running services are not stopped.
exit /b 0
