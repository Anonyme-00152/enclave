@echo off
chcp 65001 >nul
title ENCLAVE - site en local
cd /d "%~dp0"
set PORT=8080

where python >nul 2>nul
if %errorlevel%==0 (set PY=python) else (set PY=py)

echo.
echo   ENCLAVE tourne en local
echo   ----------------------------------------------
echo   Site         : http://localhost:%PORT%
echo   Application  : http://localhost:%PORT%/app.html
echo   Code demo    : 240 617
echo   ----------------------------------------------
echo   Fermez cette fenetre pour arreter le serveur.
echo.

start "" cmd /c "timeout /t 1 >nul & start http://localhost:%PORT%"
%PY% -m http.server %PORT% --bind 127.0.0.1
echo.
echo   Le serveur s'est arrete. Python est-il installe ?
pause
