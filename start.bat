@echo off
chcp 65001 >nul 2>&1

REM --- CD vao thu muc chua file start.bat (app/) ---
cd /d "%~dp0"

echo.
echo   ==========================================
echo   ^|   K-Map House - Phong Tro Manager    ^|
echo   ^|   Dev Mode                           ^|
echo   ==========================================
echo.

REM --- Kiem tra package can cho dev startup ---
if not exist "node_modules\electron-vite\bin\electron-vite.js" (
    echo   [!] Thieu package dev hoac node_modules chua day du, dang cai dat...
    call npm install
    echo.
)

if not exist "node_modules\electron-vite\bin\electron-vite.js" (
    echo   [X] Van thieu electron-vite sau khi cai dat.
    pause
    exit /b 1
)

echo   [OK] node_modules da san sang.

:start_app
echo   [>>] Dang khoi dong Electron app...
echo.
npm run dev
