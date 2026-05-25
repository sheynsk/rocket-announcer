#!/bin/bash

# Установка заголовка окна
echo -ne "\033]0;Rocket Announcer\007"

# Очистка экрана
clear

# Вывод баннера
echo ""
echo "  ╔══════════════════════════════════╗"
echo "  ║      Rocket Announcer v1.0       ║"
echo "  ╚══════════════════════════════════╝"
echo ""

# Функция для ожидания нажатия Enter
pause() {
    echo "Нажмите Enter для выхода..."
    read
}

# Проверка Node.js
NODE_CMD=""
if command -v node &>/dev/null; then
    NODE_CMD="node"
elif [ -f "/usr/bin/node" ]; then
    NODE_CMD="/usr/bin/node"
elif [ -f "/usr/local/bin/node" ]; then
    NODE_CMD="/usr/local/bin/node"
else
    echo "  [!] Node.js не найден. Установите с https://nodejs.org"
    echo "  Для Ubuntu/Debian: sudo apt install nodejs npm"
    echo ""
    pause
    exit 1
fi

echo "  [✓] Использую Node.js: $($NODE_CMD --version)"
echo ""

# Переход в директорию скрипта
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR" || {
    echo "  [!] Не удалось перейти в директорию скрипта"
    pause
    exit 1
}

# Установка зависимостей
if [ ! -d "node_modules" ]; then
    echo "  [*] Первый запуск — устанавливаю зависимости..."
    if command -v npm &>/dev/null; then
        npm install --registry https://registry.npmmirror.com 2>&1 | grep -v "WARN"
        if [ ${PIPESTATUS[0]} -ne 0 ]; then
            echo "  [!] npm install не удался. Попробуйте вручную: npm install"
            pause
            exit 1
        fi
    else
        echo "  [!] npm не найден. Установите npm или Node.js полностью"
        pause
        exit 1
    fi
    echo "  [+] Зависимости установлены."
    echo ""
fi

# Остановка старого процесса на порту 3000
echo "  [*] Проверяю порт 3000..."

# Способ 1: через lsof
if command -v lsof &>/dev/null; then
    OLD_PID=$(lsof -ti:3000 2>/dev/null)
    if [ -n "$OLD_PID" ]; then
        echo "  [*] Останавливаю процесс на порту 3000 (PID: $OLD_PID)"
        kill -9 $OLD_PID 2>/dev/null
        sleep 1
    fi
# Способ 2: через netstat
elif command -v netstat &>/dev/null; then
    OLD_PID=$(netstat -tlnp 2>/dev/null | grep ':3000' | awk '{print $7}' | cut -d'/' -f1)
    if [ -n "$OLD_PID" ]; then
        echo "  [*] Останавливаю процесс на порту 3000 (PID: $OLD_PID)"
        kill -9 $OLD_PID 2>/dev/null
        sleep 1
    fi
# Способ 3: через ss
elif command -v ss &>/dev/null; then
    OLD_PID=$(ss -tlnp 2>/dev/null | grep ':3000' | grep -oP 'pid=\K[0-9]+')
    if [ -n "$OLD_PID" ]; then
        echo "  [*] Останавливаю процесс на порту 3000 (PID: $OLD_PID)"
        kill -9 $OLD_PID 2>/dev/null
        sleep 1
    fi
else
    # Способ 4: через pkill
    pkill -f "node.*server.js" 2>/dev/null
    echo "  [*] Останавливаю все процессы node server.js"
fi

echo ""

# Запуск сервера
echo "  [*] Запускаю сервер..."
echo "  [*] Логи сервера будут отображаться ниже"
echo "  [*] Для остановки нажмите Ctrl+C"
echo ""

# Открытие браузера через 2 секунды
(
    sleep 2
    # Пытаемся открыть браузер разными способами
    if command -v xdg-open &>/dev/null; then
        xdg-open http://localhost:3000 2>/dev/null
    elif command -v sensible-browser &>/dev/null; then
        sensible-browser http://localhost:3000 2>/dev/null
    elif command -v firefox &>/dev/null; then
        firefox http://localhost:3000 2>/dev/null &
    elif command -v google-chrome &>/dev/null; then
        google-chrome http://localhost:3000 2>/dev/null &
    elif command -v chromium-browser &>/dev/null; then
        chromium-browser http://localhost:3000 2>/dev/null &
    else
        echo "  [!] Автоматическое открытие браузера не удалось"
        echo "  [*] Откройте вручную: http://localhost:3000"
    fi
) &

# Запуск сервера (основной процесс)
$NODE_CMD server.js

# Эта строка выполнится только когда сервер остановят (Ctrl+C)
echo ""
echo "  [*] Сервер остановлен"
pause