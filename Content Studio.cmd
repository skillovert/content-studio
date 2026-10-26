@echo off
rem Double-click: opens Content Studio in your browser (http://127.0.0.1:4330).
cd /d "%~dp0"
where node >nul 2>&1 || (echo Node.js is not installed. Install the LTS from nodejs.org, then double-click again. & pause & exit /b 1)
rem install packages on the first run (or when an install was cut short)
node -e "import('@anthropic-ai/sdk').catch(() => process.exit(1))" >nul 2>&1 || (
  echo Installing packages, this takes a minute...
  call npm install --omit=dev --no-audit --no-fund
)
rem close a Content Studio that is still running, so the port is free
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'content-studio.server.index\.mjs' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" >nul 2>&1
node "%~dp0server\index.mjs"
pause
