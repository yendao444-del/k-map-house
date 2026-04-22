@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ============================================
echo   DBY HOME - Full Release
echo ============================================
echo.

cd /d "%~dp0"

set ENABLE_GITHUB=1
if /I "%~1"=="--local" set ENABLE_GITHUB=0
if /I "%~1"=="--github" set ENABLE_GITHUB=1

if "!ENABLE_GITHUB!"=="1" (
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
)

for /f %%v in ('node scripts\release-version.cjs current') do set CURRENT_VERSION=%%v
for /f %%v in ('node scripts\release-version.cjs next-patch') do set NEW_VERSION=%%v
set NOTES=Bug fixes and improvements

echo Tang version: v!CURRENT_VERSION! ^> v!NEW_VERSION!
node scripts\release-version.cjs set !NEW_VERSION! >nul

echo [1/5] Tat app neu dang chay...
taskkill /F /IM electron.exe >nul 2>&1
taskkill /F /IM "DBY HOME.exe" >nul 2>&1
taskkill /F /IM "K-Map House.exe" >nul 2>&1
timeout /t 2 /nobreak >nul

echo [2/5] Don dist cu...
call pnpm run clean:dist
if errorlevel 1 ( echo CLEAN DIST THAT BAI! & pause & exit /b 1 )

echo [3/5] Build app (TypeScript + electron-vite)...
call pnpm run build
if errorlevel 1 (
    echo [X] BUILD THAT BAI! Co loi TypeScript hoac electron-vite.
    echo     Kiem tra log loi o tren, sua code roi chay lai RELEASE.bat.
    pause
    exit /b 1
)

echo [4/5] Package NSIS installer...
call npx electron-builder --win
if errorlevel 1 (
    echo [X] DONG GOI INSTALLER THAT BAI!
    pause
    exit /b 1
)
set INSTALLER=dist\DBYHOME-!NEW_VERSION!-setup.exe
if not exist "!INSTALLER!" (
    echo [X] Khong tim thay installer sau khi build: !INSTALLER!
    pause
    exit /b 1
)
set LATEST_YML=dist\latest.yml
set INSTALLER_BLOCKMAP=dist\DBYHOME-!NEW_VERSION!-setup.exe.blockmap
if not exist "!LATEST_YML!" (
    echo [X] Khong tim thay metadata auto-update: !LATEST_YML!
    pause
    exit /b 1
)
if not exist "!INSTALLER_BLOCKMAP!" (
    echo [X] Khong tim thay blockmap auto-update: !INSTALLER_BLOCKMAP!
    pause
    exit /b 1
)

echo [5/5] Apply runtime workaround for Electron...
set RUNTIME_SRC=node_modules\electron\dist
set RUNTIME_DST=dist\win-unpacked
if not exist "!RUNTIME_DST!" (
    echo [X] Khong tim thay thu muc !RUNTIME_DST!
    pause
    exit /b 1
)
for %%F in (resources.pak v8_context_snapshot.bin libGLESv2.dll d3dcompiler_47.dll chrome_200_percent.pak vk_swiftshader.dll version) do (
    if exist "!RUNTIME_SRC!\%%F" copy /Y "!RUNTIME_SRC!\%%F" "!RUNTIME_DST!\%%F" >nul
)
(
    echo @echo off
    echo cd /d "%%~dp0"
    echo start "" "DBY Home.exe" ".\resources\app"
) > "!RUNTIME_DST!\RUN-DBYHOME.bat"
set PORTABLE_ZIP=dist\DBYHOME-!NEW_VERSION!-portable-win-unpacked.zip
powershell -NoProfile -Command "if (Test-Path '!PORTABLE_ZIP!') { Remove-Item '!PORTABLE_ZIP!' -Force }; Compress-Archive -Path 'dist\\win-unpacked\\*' -DestinationPath '!PORTABLE_ZIP!' -Force"
if not exist "!PORTABLE_ZIP!" (
    echo [X] Khong tao duoc portable zip: !PORTABLE_ZIP!
    pause
    exit /b 1
)

if "!ENABLE_GITHUB!"=="1" (
    echo [5/6] Git commit + push...
    git add -A
    git commit -m "v!NEW_VERSION! - !NOTES!"
    git push
    if errorlevel 1 ( echo GIT PUSH THAT BAI! & pause & exit /b 1 )

    echo [6/6] Tao GitHub Release...
    gh release create v!NEW_VERSION! "!INSTALLER!" "!LATEST_YML!" "!INSTALLER_BLOCKMAP!" "!PORTABLE_ZIP!" --title "DBY HOME v!NEW_VERSION!" --notes "!NOTES!"
    if errorlevel 1 ( echo GITHUB RELEASE THAT BAI! & pause & exit /b 1 )
) else (
    echo [5/5] Dang o che do local-only: bo qua Git push va GitHub Release.
    echo     Neu muon upload de production auto-update, chay: RELEASE.bat
)

echo.
echo ============================================
echo   RELEASE HOAN TAT - v!NEW_VERSION!
echo ============================================
pause
