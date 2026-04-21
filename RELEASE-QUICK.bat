@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ============================================
echo   K-Map House - QUICK PATCH
echo ============================================
echo.

cd /d "%~dp0"

for /f %%v in ('node scripts\release-version.cjs current') do set CURRENT_VERSION=%%v

echo Build electron-vite...
call pnpm run build
if errorlevel 1 ( echo BUILD THAT BAI! & pause & exit /b 1 )

set PATCH_ZIP=KMapHouse-PATCH-v!CURRENT_VERSION!-local.zip
if exist "!PATCH_ZIP!" del "!PATCH_ZIP!"
if exist "_patch_temp" rmdir /S /Q "_patch_temp"
mkdir "_patch_temp\resources\app\out"
xcopy "out\*" "_patch_temp\resources\app\out\" /E /I /Y /Q >nul 2>&1
copy /Y "package.json" "_patch_temp\resources\app\package.json" >nul 2>&1
powershell -NoProfile -Command "Compress-Archive -Path '_patch_temp\*' -DestinationPath '!PATCH_ZIP!' -Force"
rmdir /S /Q "_patch_temp" 2>nul
if not exist "!PATCH_ZIP!" (
    echo [X] Khong tao duoc file patch zip.
    pause
    exit /b 1
)

echo OK - !PATCH_ZIP!
pause
