@echo off
rem Content Studio setup: double-click once in your channel folder.
rem Installs Node.js and Python if they are missing (Windows may ask for permission), downloads
rem Content Studio into tools\content-studio, installs what it needs and starts it.
title Content Studio setup
cd /d "%~dp0"
set "PS1=%TEMP%\content-studio-install.ps1"
echo Getting the installer...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Invoke-WebRequest -UseBasicParsing -Uri 'https://raw.githubusercontent.com/skillovert/content-studio/main/setup/install.ps1' -OutFile $env:TEMP\content-studio-install.ps1" || (echo Could not download the installer. Check the internet connection and try again. & pause & exit /b 1)
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Folder "%~dp0." -Mode setup
pause
