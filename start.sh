#!/bin/bash

# Установка кодировки и заголовка
export LANG=ru_RU.UTF-8
export LC_ALL=ru_RU.UTF-8
echo -e "\033]0;Rocket Announcer\007"

clear
echo
echo "  ╔══════════════════════════════════╗"
echo "  ║      Rocket Announcer v1.0       ║"
echo "  ╚══════════════════════════════════╝"
echo

# Проверка Node.js
if ! command -v node &> /dev/null; then
    echo "  [!] Node.js не найден. Установите с https://nodejs.org"
    echo
    read -p "Нажмите Enter для выхода..."
    exit 1
fi

# Переход в директорию скрипта
cd "$(dirname "$0")"

# Установка зависимостей при необходимости
if [ ! -d "node_modules" ]; then
    echo "  [*] Первый запуск — устанавливаю зависимости..."
    npm install --registry https://registry.npmmirror.com &> /dev/null
    if [ $? -ne 0 ]; then
        echo "  [!] npm install не удался. Попробуйте вручную."
        read -p "Нажмите Enter для выхода..."
        exit 1
    fi
    echo "  [+] Зависимости установлены."
    echo
fi

# Убить старый процесс на порту 3000
OLD_PID=$(lsof -ti:3000 2>/dev/null)
if [ ! -z "$OLD_PID" ]; then
    kill -9 $OLD_PID 2>/dev/null
fi

# Запуск сервера в фоне и открытие браузера через 2 секунды
echo "  [*] Запускаю сервер..."
echo

# Функция для открытия браузера
(sleep 2 && xdg-open http://localhost:3000 2>/dev/null || open http://localhost:3000 2>/dev/null || sensible-browser http://localhost:3000) &

# Запуск сервера (на переднем плане — логи видны в консоли)
node server.js

# Ожидание завершения (если скрипт запущен без node server.js)
wait