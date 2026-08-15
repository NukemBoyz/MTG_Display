@echo off
REM ===================================================================
REM  Dev runner - serves server.py directly from this folder using the
REM  bundled embeddable Python in  python\ , so edits to the HTML, CSS
REM  and JS take effect on a restart with no PyInstaller rebuild.
REM
REM  End users should run MTG_Display.exe instead.
REM
REM  Optional: put flags on the line below, for example
REM        set MTG_OPTIONS=--ip 192.168.1.50 --no-browser
REM ===================================================================

set MTG_OPTIONS=

cd /d "%~dp0"

if not exist "python\python.exe" goto nopython
if not exist "server.py" goto nofiles

python\python.exe server.py %MTG_OPTIONS% %*

echo.
echo Server stopped.
pause
exit /b 0

:nopython
echo.
echo   The  python\  folder is missing.
echo.
echo   Restore it with:
echo       powershell -ExecutionPolicy Bypass -File scripts\setup_python.ps1
echo.
pause
exit /b 1

:nofiles
echo.
echo   server.py is missing from this folder.
echo.
pause
exit /b 1
