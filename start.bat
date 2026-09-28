@echo off
chcp 65001 >nul 2>&1

REM --- CD vao thu muc chua file start.bat (app/) ---
cd /d "%~dp0"

echo.
echo   ==========================================
echo   ^|   DBY HOME - Phong Tro Manager       ^|
echo   ^|   Dev Mode                           ^|
echo   ==========================================
echo.

REM --- Kiem tra package can cho dev startup ---
if not exist "package.json" (
    echo   [X] Khong tim thay package.json trong thu muc app.
    pause
    exit /b 1
)

if not exist "node_modules\.bin\electron-vite.cmd" (
    echo   [!] Thieu node_modules, dang cai dat dependencies...
    call npm install
    if errorlevel 1 goto :startup_failed
)

if not exist "node_modules\.bin\electron-vite.cmd" (
    echo   [X] Khong tim thay electron-vite sau khi cai dat.
    goto :startup_failed
)

REM npm ci co the tao package Electron nhung chua tai runtime electron.exe.
if not exist "node_modules\electron\dist\electron.exe" (
    echo   [!] Thieu Electron runtime, dang tai lai...
    call node "node_modules\electron\install.js"
    if errorlevel 1 goto :startup_failed
)

if not exist "node_modules\electron\dist\electron.exe" (
    echo   [X] Van thieu node_modules\electron\dist\electron.exe.
    goto :startup_failed
)

echo   [OK] Dependencies va Electron runtime da san sang.

:start_app
echo   [>>] Dang khoi dong Electron app...
echo.
call npm run dev
if errorlevel 1 goto :startup_failed
exit /b 0

:startup_failed
echo.
echo   [X] Khong the khoi dong DBY HOME. Ma loi: %errorlevel%
echo   Kiem tra thong bao phia tren, sau do nhan phim bat ky de dong.
pause
exit /b 1
