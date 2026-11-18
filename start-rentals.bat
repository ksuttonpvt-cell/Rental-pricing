@echo off
REM Starts the rental website plus Rentals Control. Settings come from the .env file in this folder.
REM Updates from GitHub install themselves while it runs (see src\updater.js).
cd /d "%~dp0"
title Rental website

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  PROBLEM: Node.js is not installed, or Windows can't find it.
  echo  Install the LTS version from https://nodejs.org then restart the PC.
  goto :fail
)

if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo  Made a .env settings file from .env.example. Open it in Notepad to change settings.
)

echo.
echo  Starting... Leave this window open.
echo  Website: http://localhost:3002   Staff side: http://localhost:3002/staff
echo  To see status and the log, or stop/restart the site, open "Rentals Control.bat".
echo.
node src\supervisor.js
exit /b

:fail
echo.
pause
