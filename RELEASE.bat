@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ============================================
echo   K-Map House - Full Release
echo ============================================
echo.

cd /d "%~dp0"

git remote get-url origin >nul 2>&1
if errorlevel 1 (
    echo [X] Chua cau hinh git remote origin.
    echo     Can them remote truoc khi chay RELEASE.bat
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
set NOTES=Bug fixes and improvements

echo Tang version: v!CURRENT_VERSION! ^> v!NEW_VERSION!
node scripts\release-version.cjs set !NEW_VERSION! >nul

echo [1/4] Tat app neu dang chay...
taskkill /F /IM electron.exe >nul 2>&1
taskkill /F /IM "K-Map House.exe" >nul 2>&1
timeout /t 2 /nobreak >nul

echo [2/4] Build NSIS installer...
call pnpm run build:win
if errorlevel 1 ( echo BUILD THAT BAI! & pause & exit /b 1 )
set INSTALLER=dist\KMapHouse-!NEW_VERSION!-setup.exe
if not exist "!INSTALLER!" (
    echo [X] Khong tim thay installer sau khi build: !INSTALLER!
    pause
    exit /b 1
)

echo [3/4] Git commit + push...
git add -A
git commit -m "v!NEW_VERSION! - !NOTES!"
git push
if errorlevel 1 ( echo GIT PUSH THAT BAI! & pause & exit /b 1 )

echo [4/4] Tao GitHub Release...
gh release create v!NEW_VERSION! "!INSTALLER!" --title "K-Map House v!NEW_VERSION!" --notes "!NOTES!"
if errorlevel 1 ( echo GITHUB RELEASE THAT BAI! & pause & exit /b 1 )

echo.
echo ============================================
echo   RELEASE HOAN TAT - v!NEW_VERSION!
echo ============================================
pause
