@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ============================================
echo   K-Map House - PATCH Release
echo ============================================
echo.

cd /d "%~dp0"

git remote get-url origin >nul 2>&1
if errorlevel 1 (
    echo [X] Chua cau hinh git remote origin.
    echo     Can them remote truoc khi chay RELEASE-PATCH.bat
    pause
    exit /b 1
)

gh auth status >nul 2>&1
if errorlevel 1 (
    echo [X] Chua dang nhap GitHub CLI.
    echo     Chay: gh auth login
    pause
    exit /b 1
)

for /f %%v in ('node scripts\release-version.cjs current') do set CURRENT_VERSION=%%v
for /f %%v in ('node scripts\release-version.cjs next-patch') do set NEW_VERSION=%%v
set NOTES=Patch - Bug fixes

echo Tang version: v!CURRENT_VERSION! ^> v!NEW_VERSION!
node scripts\release-version.cjs set !NEW_VERSION! >nul

echo [1/4] Build electron-vite...
taskkill /F /IM "K-Map House.exe" >nul 2>&1
call pnpm run build
if errorlevel 1 ( echo BUILD THAT BAI! & pause & exit /b 1 )

echo [2/4] Nen patch zip...
set PATCH_ZIP=KMapHouse-PATCH-v!NEW_VERSION!.zip
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

echo [3/4] Git commit + push...
git add -A
git commit -m "v!NEW_VERSION! - !NOTES!"
git push
if errorlevel 1 ( echo GIT PUSH THAT BAI! & pause & exit /b 1 )

echo [4/4] Tao GitHub Release...
gh release create v!NEW_VERSION! "!PATCH_ZIP!" --title "K-Map House v!NEW_VERSION! (PATCH)" --notes "!NOTES!"
if errorlevel 1 ( echo GITHUB RELEASE THAT BAI! & pause & exit /b 1 )
if exist "!PATCH_ZIP!" del /Q "!PATCH_ZIP!"

echo.
echo ============================================
echo   PATCH HOAN TAT - v!NEW_VERSION!
echo ============================================
pause
