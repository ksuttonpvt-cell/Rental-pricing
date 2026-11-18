@echo off
REM Creates a staff login, or resets the password of an existing one.
cd /d "%~dp0"
set /p NAME=Username for the new staff login: 
node server.js add-user %NAME%
pause
