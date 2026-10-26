@echo off
rem Installs the latest Content Studio over this one (Settings -> Check for updates runs it).
rem Your channel folder is not touched; a backup of the app is kept. See setup\install.ps1.
title Content Studio update
set "PS1=%TEMP%\content-studio-install.ps1"
copy /y "%~dp0setup\install.ps1" "%PS1%" >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" -Folder "%~dp0..\.." -Mode update
pause
