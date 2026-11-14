@echo off
chcp 65001 >nul
title SIMB-AD PharmaGraph
cd /d "%~dp0pharmagraph"

where npm >nul 2>nul
if errorlevel 1 (
  echo Не найден Node.js. Установите его с https://nodejs.org и запустите файл еще раз.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Первый запуск: устанавливаю зависимости, это займет минуту...
  call npm install
)

echo.
echo Запускаю SIMB-AD PharmaGraph. Браузер откроется сам.
echo НЕ закрывайте это окно во время презентации.
echo.
call npm run dev -- --open
pause
