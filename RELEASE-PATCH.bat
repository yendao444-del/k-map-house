@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ============================================
echo   DBY HOME - PATCH Release
echo ============================================
echo.

cd /d "%~dp0"

set ENABLE_GITHUB=1
if /I "%~1"=="--local" set ENABLE_GITHUB=0
if /I "%~1"=="--github" set ENABLE_GITHUB=1
set VERSION_COMMITTED=0

where node >nul 2>&1
if errorlevel 1 (
    echo [X] Khong tim thay Node.js trong PATH.
    pause
    exit /b 1
)

where pnpm >nul 2>&1
if errorlevel 1 (
    echo [X] Khong tim thay pnpm trong PATH.
    pause
    exit /b 1
)

if "!ENABLE_GITHUB!"=="1" (
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
)

for /f %%v in ('node scripts\release-version.cjs current') do set CURRENT_VERSION=%%v
if errorlevel 1 ( echo [X] Khong doc duoc version hien tai. & pause & exit /b 1 )
for /f %%v in ('node scripts\release-version.cjs next-patch') do set NEW_VERSION=%%v
if errorlevel 1 ( echo [X] Khong tinh duoc version patch tiep theo. & pause & exit /b 1 )
set NOTES=Patch - Bug fixes

echo Tang version: v!CURRENT_VERSION! ^> v!NEW_VERSION!
node scripts\release-version.cjs set !NEW_VERSION! >nul
if errorlevel 1 ( echo [X] Khong cap nhat duoc version. & pause & exit /b 1 )

echo [1/4] Tat app neu dang chay va build electron-vite...
taskkill /F /IM electron.exe >nul 2>&1
taskkill /F /IM "DBY HOME.exe" >nul 2>&1
taskkill /F /IM "K-Map House.exe" >nul 2>&1
taskkill /F /IM esbuild.exe >nul 2>&1
timeout /t 2 /nobreak >nul
call pnpm run build
if errorlevel 1 (
    echo BUILD THAT BAI!
    goto rollback_fail
)

echo [2/4] Nen patch zip...
if not exist "dist" mkdir "dist"
set PATCH_ZIP=dist\DBYHOME-PATCH-v!NEW_VERSION!.zip
if exist "!PATCH_ZIP!" del "!PATCH_ZIP!"
if exist "_patch_temp" rmdir /S /Q "_patch_temp"
mkdir "_patch_temp\resources\app\out"
xcopy "out\*" "_patch_temp\resources\app\out\" /E /I /Y /Q >nul 2>&1
if errorlevel 1 (
    echo [X] Khong copy duoc thu muc out vao patch.
    rmdir /S /Q "_patch_temp" 2>nul
    goto rollback_fail
)
copy /Y "package.json" "_patch_temp\resources\app\package.json" >nul 2>&1
if errorlevel 1 (
    echo [X] Khong copy duoc package.json vao patch.
    rmdir /S /Q "_patch_temp" 2>nul
    goto rollback_fail
)
powershell -NoProfile -ExecutionPolicy Bypass -Command "Compress-Archive -Path '_patch_temp\*' -DestinationPath '!PATCH_ZIP!' -Force"
if errorlevel 1 (
    echo [X] Nen patch zip that bai.
    rmdir /S /Q "_patch_temp" 2>nul
    goto rollback_fail
)
rmdir /S /Q "_patch_temp" 2>nul
if not exist "!PATCH_ZIP!" (
    echo [X] Khong tao duoc file patch zip.
    goto rollback_fail
)

if "!ENABLE_GITHUB!"=="1" (
    echo [3/4] Git commit + push...
    git add -A
    git commit -m "v!NEW_VERSION! - !NOTES!"
    if errorlevel 1 ( echo GIT COMMIT THAT BAI! & goto rollback_fail )
    set VERSION_COMMITTED=1
    git push
    if errorlevel 1 ( echo GIT PUSH THAT BAI! & goto fail_after_commit )

    echo [4/4] Tao GitHub Release...
    gh release create v!NEW_VERSION! "!PATCH_ZIP!" --title "DBY HOME v!NEW_VERSION! (PATCH)" --notes "!NOTES!"
    if errorlevel 1 ( echo GITHUB RELEASE THAT BAI! & goto fail_after_commit )
    if exist "!PATCH_ZIP!" del /Q "!PATCH_ZIP!"
) else (
    echo [3/4] Dang o che do local-only: bo qua Git commit, push va GitHub Release.
    echo [4/4] Patch zip da tao: !PATCH_ZIP!
)

echo.
echo ============================================
echo   PATCH HOAN TAT - v!NEW_VERSION!
echo ============================================
pause
exit /b 0

:rollback_fail
echo.
if "!VERSION_COMMITTED!"=="0" (
    echo [!] Dang rollback version ve v!CURRENT_VERSION!...
    node scripts\release-version.cjs set !CURRENT_VERSION! >nul 2>&1
)
if exist "_patch_temp" rmdir /S /Q "_patch_temp" 2>nul
pause
exit /b 1

:fail_after_commit
echo.
echo [!] Commit v!NEW_VERSION! da duoc tao. Khong rollback version de tranh lech lich su git.
echo     Sua loi ben tren roi chay lai lenh push/release neu can.
if exist "_patch_temp" rmdir /S /Q "_patch_temp" 2>nul
pause
exit /b 1
