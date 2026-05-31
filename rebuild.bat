@echo off
chcp 65001 >nul 2>&1
setlocal

echo ========================================
echo   DBY HOME - Rebuild and Restart
echo ========================================
echo.

REM Go to the folder that contains this script.
cd /d "%~dp0"

echo [1/3] Stopping old Electron processes...
taskkill /F /IM electron.exe 2>nul
taskkill /F /IM "K-Map House.exe" 2>nul
taskkill /F /IM "DBY HOME.exe" 2>nul
timeout /t 1 /nobreak >nul

echo [2/3] Removing old out folder and rebuilding...
if exist "out" rmdir /s /q "out"
call npm run typecheck:node
if errorlevel 1 (
    echo.
    echo !!! NODE TYPECHECK FAILED - CHECK THE ERROR ABOVE !!!
    pause
    exit /b 1
)

call npm run typecheck:web
if errorlevel 1 (
    echo.
    echo !!! WEB TYPECHECK FAILED - CHECK THE ERROR ABOVE !!!
    pause
    exit /b 1
)

call npx electron-vite build
if errorlevel 1 (
    echo.
    echo !!! BUILD FAILED - CHECK THE ERROR ABOVE !!!
    pause
    exit /b 1
)

echo [3/3] Starting app in preview mode...
start "DBY HOME Preview" cmd /k "npm run start"
echo.
echo ========================================
echo   DONE! App is starting...
echo ========================================
timeout /t 3 /nobreak >nul
endlocal
