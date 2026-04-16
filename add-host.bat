@echo off
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)
findstr /C:"RocketAnnouncer.Suro" "%SystemRoot%\System32\drivers\etc\hosts" >nul 2>&1
if %errorlevel% neq 0 (
    echo.>> "%SystemRoot%\System32\drivers\etc\hosts"
    echo 127.0.0.1    RocketAnnouncer.Suro>> "%SystemRoot%\System32\drivers\etc\hosts"
    echo Done - added RocketAnnouncer.Suro to hosts
) else (
    echo Already exists in hosts
)
pause
