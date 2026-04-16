@echo off
title Rocket Announcer

:: Request admin rights for hosts file and port 80
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

echo.
echo  === Rocket Announcer v1.0 ===
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!] Node.js not found. Install from https://nodejs.org
    pause
    exit /b 1
)

:: Add hosts entry if missing
findstr /C:"RocketAnnouncer.Suro" "%SystemRoot%\System32\drivers\etc\hosts" >nul 2>&1
if %errorlevel% neq 0 (
    echo  [*] Adding RocketAnnouncer.Suro to hosts...
    echo.>> "%SystemRoot%\System32\drivers\etc\hosts"
    echo 127.0.0.1    RocketAnnouncer.Suro>> "%SystemRoot%\System32\drivers\etc\hosts"
    echo  [+] Done.
)

:: cd to script directory
cd /d "%~dp0"

:: Install dependencies if needed
if not exist "node_modules" (
    echo  [*] First run - installing dependencies...
    echo.
    call npm install --registry https://registry.npmmirror.com
    if %errorlevel% neq 0 (
        echo  [!] Install failed. Check internet and try again.
        pause
        exit /b 1
    )
    echo.
)

:: Open browser after short delay
start "" cmd /c "timeout /t 3 /nobreak >nul & start http://RocketAnnouncer.Suro:8080"

echo  [*] Server starting at http://RocketAnnouncer.Suro:8080
echo  [*] Browser will open automatically.
echo  [*] To stop - close this window or press Ctrl+C.
echo.

node server.js

pause
