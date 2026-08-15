@echo off
REM ===================================================================
REM  STEP 2 - this is the program. Double-click it to run.
REM
REM  Optional: to force the address used in the QR codes, put it on
REM  the line below, for example:
REM        set MTG_OPTIONS=--ip 192.168.1.50
REM  Leave it empty for automatic detection.
REM ===================================================================

set MTG_OPTIONS=

cd /d "%~dp0"

if not exist "python\python.exe" goto nosetup
if not exist "server.py" goto nofiles

python\python.exe server.py %MTG_OPTIONS% %*

echo.
echo Server stopped.
pause
exit /b 0

:nosetup
echo.
echo ============================================================
echo   Setup has not been run yet
echo ============================================================
echo.
echo   Double-click  1_SETUP.bat  first. It takes about a minute
echo   and only needs doing once.
echo.
pause
exit /b 1

:nofiles
echo.
echo   server.py is missing from this folder.
echo.
echo   Make sure you extracted the whole zip, and that you are
echo   running this from inside the extracted folder rather than
echo   from inside the zip preview window.
echo.
pause
exit /b 1
