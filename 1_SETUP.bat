@echo off
REM ===================================================================
REM  STEP 1 - run this once.
REM
REM  Fetches Python's official "embeddable package" (a plain zip) and
REM  unpacks it into this folder. Nothing is installed. No admin, no
REM  registry, no PATH changes. Delete the folder and it is all gone.
REM ===================================================================

cd /d "%~dp0"

where powershell >nul 2>&1
if errorlevel 1 goto nops

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup_python.ps1"
exit /b %errorlevel%

:nops
echo.
echo  PowerShell was not found on this PC, which is very unusual for
echo  Windows 10 or 11.
echo.
echo  You can still set this up by hand:
echo    1. Open https://www.python.org/downloads/windows/
echo    2. Download "Windows embeddable package (64-bit)"
echo    3. Unzip it into a folder called  python  right here
echo       (so that  python\python.exe  exists)
echo    4. Then use 2_START_MTG.bat
echo.
pause
exit /b 1
