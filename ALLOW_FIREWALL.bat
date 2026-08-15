@echo off
REM Only needed if the board works on this PC but phones cannot reach it.

cd /d "%~dp0"
cls
echo.
echo ============================================================
echo   Allow MTG Display through Windows Firewall
echo ============================================================
echo.
echo   This adds ONE inbound rule:
echo.
echo       Name  : MTG Display 8080
echo       Allow : TCP port 8080, private AND public networks
echo.
echo   That is what lets phones on your Wi-Fi reach the board -
echo   at home, at a friend's place, or a game store, regardless
echo   of how Windows categorized that network. It still only
echo   allows port 8080, nothing else, on this PC only.
echo.
echo   To remove it later:
echo       netsh advfirewall firewall delete rule name="MTG Display 8080"
echo.

net session >nul 2>&1
if errorlevel 1 goto noadmin

set /p CONFIRM="Type Y then Enter to add the rule: "
if /i not "%CONFIRM%"=="Y" goto cancelled

netsh advfirewall firewall delete rule name="MTG Display 8080" >nul 2>&1
netsh advfirewall firewall add rule name="MTG Display 8080" dir=in action=allow protocol=TCP localport=8080 profile=private,public
if errorlevel 1 goto failed

echo.
echo   Rule added. Try the phone again.
echo.
pause
exit /b 0

:noadmin
echo   This needs administrator rights.
echo.
echo   Close this window, then RIGHT-CLICK this file and pick
echo   "Run as administrator".
echo.
pause
exit /b 1

:cancelled
echo.
echo   Cancelled. Nothing changed.
echo.
pause
exit /b 0

:failed
echo.
echo   Could not add the rule. This PC may be managed by an
echo   administrator who blocks firewall changes.
echo.
pause
exit /b 1
