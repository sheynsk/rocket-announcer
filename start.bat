@echo off
chcp 65001 >nul 2>&1
title Rocket Announcer

echo.
echo  ╔══════════════════════════════════╗
echo  ║      Rocket Announcer v1.0       ║
echo  ╚══════════════════════════════════╝
echo.

:: Check Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!] Node.js не найден. Установите с https://nodejs.org
    echo.
    pause
    exit /b 1
)

:: Go to script directory
cd /d "%~dp0"

:: Install dependencies if needed
if not exist "node_modules" (
    echo  [*] Первый запуск — устанавливаю зависимости...
    call npm install --registry https://registry.npmmirror.com >nul 2>&1
    if %errorlevel% neq 0 (
        echo  [!] npm install не удался. Попробуйте вручную.
        pause
        exit /b 1
    )
    echo  [+] Зависимости установлены.
    echo.
)

:: Kill old process on port 3000
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTEN"') do (
    taskkill /F /PID %%a >nul 2>&1
)

:: Start server in background, open browser after 2 sec
echo  [*] Запускаю сервер...
echo.
start "" /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"

:: Run server (foreground — logs visible in console)
node server.js
