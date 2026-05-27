@echo off
chcp 65001 >nul 2>&1
title Rocket Announcer Emoji Uploader

echo.
echo  ╔══════════════════════════════════╗
echo  ║   Rocket Announcer Emoji Uploader ║
echo  ╚══════════════════════════════════╝
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [!] Node.js не найден. Установите с https://nodejs.org
    echo.
    pause
    exit /b 1
)

cd /d "%~dp0"

if "%RC_URL%"=="" (
    set /p RC_URL=Rocket.Chat URL: 
)
if "%RC_USER_ID%"=="" (
    set /p RC_USER_ID=Rocket.Chat User ID: 
)
if "%RC_TOKEN%"=="" (
    set /p RC_TOKEN=Rocket.Chat Auth Token: 
)
if "%EMOJI_DIR%"=="" (
    set /p EMOJI_DIR=Emoji folder [default: .\emojis]: 
)

if "%EMOJI_DIR%"=="" set EMOJI_DIR=.\emojis

echo.
echo  [*] Uploading emoji from "%EMOJI_DIR%"...
echo.

node upload-emojis.js
set EXIT_CODE=%errorlevel%

echo.
if %EXIT_CODE% neq 0 (
    echo  [!] Upload failed.
) else (
    echo  [+] Done.
)
echo.
pause
exit /b %EXIT_CODE%
